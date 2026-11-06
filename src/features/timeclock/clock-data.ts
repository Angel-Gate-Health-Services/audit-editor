import * as api from '../../services/api/api.ts';
import { ApiError } from '../../services/api/api.ts';
import { payPeriodAt, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { useClock } from '../../app/store/stores.ts';
import { generation } from '../../app/runtime/people.ts';
import type { ClockImport, PayPeriod } from '../../types/audit.ts';
const FRESH_MS = 15000;

export const SETUP_MESSAGE = 'Clock-in tracking isn’t set up yet. An admin needs to run supabase/time-clock.sql in the Supabase SQL Editor.';

export const periodKey = (p: PayPeriod) => p.start;

const errorText = (err: unknown) => (err instanceof ApiError && err.hint === 'missing_table' ? 'missing-table' : (err as Error).message || 'Something went wrong.');

export async function loadClockImports(force = false) {
  const st = useClock.getState();
  if (!force && st.imports && Date.now() - st.loadedAt < FRESH_MS) return st.imports;
  const gen = generation();
  try {
    const imports = await api.listClockImports();
    if (gen !== generation()) return null;
    useClock.setState({ imports, importsError: '', loadedAt: Date.now() });
    return imports;
  } catch (err) {
    if (gen !== generation()) return null;
    useClock.setState((s) => ({ imports: s.imports || [], importsError: errorText(err), loadedAt: Date.now() }));
    return null;
  }
}

export async function loadClockPeriod(period: PayPeriod, force = false) {
  const key = periodKey(period);
  const st = useClock.getState();
  if (st.loadingPeriod === key || (!force && st.shifts.has(key))) return;
  useClock.setState({ loadingPeriod: key });
  const gen = generation();
  try {
    const rows = await api.listClockShifts(period.start, period.end);
    if (gen !== generation()) return;
    useClock.setState((s) => ({ shifts: new Map(s.shifts).set(key, rows), shiftsError: '' }));
  } catch (err) {
    if (gen !== generation()) return;
    useClock.setState({ shiftsError: errorText(err) });
  } finally {
    if (gen === generation()) useClock.setState((s) => (s.loadingPeriod === key ? { loadingPeriod: null } : {}));
  }
}

export function importsFor(period: PayPeriod, imports: ClockImport[] | null) {
  return (imports || []).filter((i) => i.range_start <= period.end && i.range_end >= period.start);
}

export function periodsWithData(imports: ClockImport[] | null) {
  const indexes = new Set<number>();
  for (const i of imports || []) {
    for (let n = payPeriodIndexFor(i.range_start); n <= payPeriodIndexFor(i.range_end); n++) indexes.add(n);
  }
  return [...indexes].sort((a, b) => b - a).map(payPeriodAt);
}

export const peopleCacheKey = (keys: string[]) => [...new Set(keys)].sort().join('|');

export async function loadClockForPeople(keys: string[], force = false) {
  const cacheKey = peopleCacheKey(keys);
  const st = useClock.getState();
  if (!cacheKey || st.loadingPeople === cacheKey || (!force && st.people.has(cacheKey))) return;
  useClock.setState({ loadingPeople: cacheKey });
  const gen = generation();
  try {
    const rows = await api.listClockShiftsFor(cacheKey.split('|'));
    if (gen !== generation()) return;
    useClock.setState((s) => ({ people: new Map(s.people).set(cacheKey, rows), peopleError: '' }));
  } catch (err) {
    if (gen !== generation()) return;
    useClock.setState({ peopleError: errorText(err) });
  } finally {
    if (gen === generation()) useClock.setState((s) => (s.loadingPeople === cacheKey ? { loadingPeople: null } : {}));
  }
}
