import { addDays, fmtTime, payPeriodAt, payPeriodIndexFor } from '../audits/model.ts';
import { nameKey } from '../employees/stats.ts';
import type { ClockImport, ClockShift, Employee, Finding, PayPeriod, Site } from '../../types/audit.ts';

export const WEEK_LIMIT_MINUTES = 40 * 60;
export const LONG_STRETCH_MINUTES = 16 * 60;
export const TIME_TOLERANCE_MINUTES = 15;
export const LOW_HOUR_OPTIONS = [16, 24, 32, 40] as const;
export const DEFAULT_LOW_HOURS = 32;

const DAY = 1440;

export const personKey = (name: string | null | undefined) => nameKey(name).replace(/[,]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

export function clockMinutes(clockIn: string, clockOut: string) {
  const start = toMinutes(clockIn);
  let end = clockOut === '23:59' ? DAY : toMinutes(clockOut);
  if (end <= start) end += DAY;
  return Math.min(DAY, end - start);
}

export function titleName(name: string) {
  return name.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export const fmtHours = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}` : h.toFixed(1);
};

export const fmtClock = (minuteOfDay: number) => {
  const m = ((minuteOfDay % DAY) + DAY) % DAY;
  return fmtTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
};

export interface Stretch {
  start: number;
  end: number;
  date: string;
  site: string;
  homeId: string | null;
  rows: ClockShift[];
}

export function siteMatcher(homes: Pick<Site, 'id' | 'name'>[]) {
  const byName = new Map(homes.map((h) => [nameKey(h.name), h.id]));
  return (site: string) => byName.get(nameKey(site)) ?? null;
}

export function stretchesOf(rows: ClockShift[], homeFor: (site: string) => string | null, joinSites = false) {
  const sorted = [...rows].sort((a, b) => dayNumber(a.work_date) * DAY + toMinutes(a.clock_in) - (dayNumber(b.work_date) * DAY + toMinutes(b.clock_in)));
  const out: Stretch[] = [];
  for (const row of sorted) {
    const start = dayNumber(row.work_date) * DAY + toMinutes(row.clock_in);
    const end = start + row.minutes;
    const last = out[out.length - 1];
    if (last && start - last.end <= 1 && start >= last.start && (joinSites || nameKey(last.site) === nameKey(row.site_name))) {
      last.end = Math.max(last.end, end);
      last.rows.push(row);
      continue;
    }
    out.push({ start, end, date: row.work_date, site: row.site_name, homeId: homeFor(row.site_name), rows: [row] });
  }
  return out;
}

export function coveredDays(imports: Pick<ClockImport, 'range_start' | 'range_end'>[]) {
  const days = new Set<number>();
  for (const i of imports) for (let d = dayNumber(i.range_start); d <= dayNumber(i.range_end); d++) days.add(d);
  return days;
}

export interface WeekTotal {
  start: string;
  end: string;
  minutes: number;
  overtime: number;
  covered: boolean;
}

export interface EmployeeHours {
  key: string;
  name: string;
  employee: Employee | null;
  rows: ClockShift[];
  minutes: number;
  weeks: WeekTotal[];
  overtime: number;
  low: boolean;
  longest: number;
  days: number;
  sites: { site: string; minutes: number }[];
  noClock: boolean;
}

export function periodWeeks(period: PayPeriod) {
  return [0, 7].map((offset) => ({ start: addDays(period.start, offset), end: addDays(period.start, offset + 6) }));
}

export function hoursForPeriod({ period, shifts, imports, employees, homes, lowHours = DEFAULT_LOW_HOURS }: {
  period: PayPeriod;
  shifts: ClockShift[];
  imports: Pick<ClockImport, 'range_start' | 'range_end'>[];
  employees: Employee[];
  homes: Pick<Site, 'id' | 'name'>[];
  lowHours?: number;
}) {
  const covered = coveredDays(imports);
  const weeks = periodWeeks(period).map((w) => {
    let all = true;
    for (let d = dayNumber(w.start); d <= dayNumber(w.end); d++) if (!covered.has(d)) all = false;
    return { ...w, covered: all };
  });
  const anyCovered = weeks.some((w) => w.covered) || shifts.length > 0;
  const index = new Map<string, Employee>();
  for (const e of employees) for (const n of [e.name, ...(e.aliases || [])]) {
    const k = personKey(n);
    if (k && !index.has(k)) index.set(k, e);
  }
  const homeFor = siteMatcher(homes);
  const groups = new Map<string, { name: string; employee: Employee | null; rows: ClockShift[] }>();
  for (const row of shifts) {
    const employee = index.get(personKey(row.employee_name)) || null;
    const key = employee ? `e:${employee.id}` : `n:${personKey(row.employee_name)}`;
    const group = groups.get(key) || { name: employee?.name || titleName(row.employee_name), employee, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  if (anyCovered) {
    for (const e of employees) {
      if (e.active && !groups.has(`e:${e.id}`)) groups.set(`e:${e.id}`, { name: e.name, employee: e, rows: [] });
    }
  }
  const people: EmployeeHours[] = [];
  for (const [key, g] of groups) {
    const weekTotals: WeekTotal[] = weeks.map((w) => {
      const minutes = g.rows.filter((r) => r.work_date >= w.start && r.work_date <= w.end).reduce((sum, r) => sum + r.minutes, 0);
      return { ...w, minutes, overtime: Math.max(0, minutes - WEEK_LIMIT_MINUTES) };
    });
    const bySite = new Map<string, number>();
    for (const r of g.rows) bySite.set(r.site_name || 'Unknown site', (bySite.get(r.site_name || 'Unknown site') || 0) + r.minutes);
    const longest = stretchesOf(g.rows, homeFor, true).reduce((max, s) => Math.max(max, s.end - s.start), 0);
    const minutes = g.rows.reduce((sum, r) => sum + r.minutes, 0);
    people.push({
      key,
      name: g.name,
      employee: g.employee,
      rows: g.rows,
      minutes,
      weeks: weekTotals,
      overtime: weekTotals.reduce((sum, w) => sum + w.overtime, 0),
      low: weekTotals.some((w) => w.covered && w.minutes < lowHours * 60),
      longest,
      days: new Set(g.rows.map((r) => r.work_date)).size,
      sites: [...bySite].map(([site, m]) => ({ site, minutes: m })).sort((a, b) => b.minutes - a.minutes),
      noClock: g.rows.length === 0,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return { people, weeks, covered, anyCovered };
}

export type MismatchKind = 'no-clock' | 'wrong-home' | 'off-hours' | 'never-at-home';

export interface Mismatch {
  id: string;
  kind: MismatchKind;
  finding: Finding;
  person: string;
  personKey: string;
  homeName: string;
  date: string | null;
  documented: string;
  clocked: string;
  detail: string;
}

const intervalLabel = (start: number, end: number) => `${fmtClock(start)} – ${fmtClock(end)}`;

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

function uncoveredMinutes(start: number, end: number, cover: Stretch[]) {
  const pieces = cover.map((s) => [Math.max(start, s.start), Math.min(end, s.end)] as const).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = start;
  for (const [a, b] of pieces) {
    if (b <= cursor) continue;
    covered += b - Math.max(a, cursor);
    cursor = b;
  }
  return end - start - covered;
}

export interface ClockCheck extends Omit<Mismatch, 'kind'> {
  kind: MismatchKind | 'match';
}

export function documentationMismatches(args: Parameters<typeof clockChecks>[0]) {
  return clockChecks(args).filter((c): c is Mismatch => c.kind !== 'match');
}

export function clockChecks({ findings, shifts, imports, employees, homes }: {
  findings: Finding[];
  shifts: ClockShift[];
  imports: Pick<ClockImport, 'range_start' | 'range_end'>[];
  employees: Employee[];
  homes: Pick<Site, 'id' | 'name'>[];
}) {
  const covered = coveredDays(imports);
  const homeFor = siteMatcher(homes);
  const canonical = new Map<string, string>();
  for (const e of employees) for (const n of [e.name, ...(e.aliases || [])]) {
    const k = personKey(n);
    if (k && !canonical.has(k)) canonical.set(k, `e:${e.id}`);
  }
  const who = (name: string) => canonical.get(personKey(name)) || `n:${personKey(name)}`;
  const rowsByPerson = new Map<string, ClockShift[]>();
  for (const row of shifts) {
    const k = who(row.employee_name);
    rowsByPerson.set(k, [...(rowsByPerson.get(k) || []), row]);
  }
  const stretchCache = new Map<string, Stretch[]>();
  const stretchesFor = (k: string) => {
    if (!stretchCache.has(k)) stretchCache.set(k, stretchesOf(rowsByPerson.get(k) || [], homeFor));
    return stretchCache.get(k)!;
  };
  const atHome = (s: Stretch, f: Finding) => (f.home_id && s.homeId ? s.homeId === f.home_id : nameKey(s.site) === nameKey(f.home_name));
  const out: ClockCheck[] = [];
  for (const f of findings) {
    const k = who(f.employee_name);
    const stretches = stretchesFor(k);
    const homeName = f.home_name || 'this site';
    const base = { id: f.id, finding: f, person: f.employee_name, personKey: k, homeName };
    if (!f.shift_date || f.all_shifts) {
      if (!f.pay_period_start) continue;
      const period = payPeriodAt(payPeriodIndexFor(f.pay_period_start));
      const first = dayNumber(period.start);
      const last = dayNumber(period.end);
      let anyDay = false;
      for (let d = first; d <= last; d++) if (covered.has(d)) anyDay = true;
      if (!anyDay) continue;
      const there = stretches.filter((s) => s.date >= period.start && s.date <= period.end && atHome(s, f));
      if (there.length) {
        const total = there.reduce((sum, s) => sum + s.end - s.start, 0);
        out.push({ ...base, kind: 'match', date: null, documented: 'All shifts', clocked: `${fmtHours(total)} h at ${homeName}`, detail: `Clocked in at ${homeName} ${there.length === 1 ? 'once' : `${there.length} times`} this pay period.` });
      } else {
        const elsewhere = [...new Set(stretches.filter((s) => s.date >= period.start && s.date <= period.end).map((s) => s.site))];
        out.push({
          ...base, kind: 'never-at-home', date: null, documented: 'All shifts',
          clocked: elsewhere.length ? elsewhere.join(', ') : 'No clock-ins',
          detail: elsewhere.length ? `Never clocked in at ${homeName} this pay period. Clocked in at ${elsewhere.join(', ')}.` : `No clock-ins at all this pay period.`,
        });
      }
      continue;
    }
    const day = dayNumber(f.shift_date);
    if (!covered.has(day)) continue;
    const start = day * DAY + (f.shift_start ? toMinutes(f.shift_start) : 0);
    let end = f.shift_start && f.shift_end ? day * DAY + toMinutes(f.shift_end) : day * DAY + DAY;
    if (end <= start) end += DAY;
    const documented = f.shift_start && f.shift_end ? intervalLabel(start, end) : 'Time not recorded';
    const touching = stretches.filter((s) => overlap(s.start, s.end, start, end) > 0);
    const sameDay = stretches.filter((s) => overlap(s.start, s.end, day * DAY, day * DAY + DAY) > 0);
    const describe = (list: Stretch[]) => list.map((s) => `${intervalLabel(s.start, s.end)} at ${s.site || 'an unknown site'}`).join('; ');
    if (!touching.length) {
      if (!sameDay.length) {
        out.push({ ...base, kind: 'no-clock', date: f.shift_date, documented, clocked: 'No clock-in', detail: `No clock-in on this date, but documentation was submitted for ${documented} at ${homeName}.` });
      } else {
        out.push({ ...base, kind: 'off-hours', date: f.shift_date, documented, clocked: describe(sameDay), detail: `Documented ${documented}, but clocked in ${describe(sameDay)}.` });
      }
      continue;
    }
    const here = touching.filter((s) => atHome(s, f));
    if (!here.length) {
      out.push({ ...base, kind: 'wrong-home', date: f.shift_date, documented, clocked: describe(touching), detail: `Documentation is for ${homeName}, but they were clocked in at ${[...new Set(touching.map((s) => s.site))].join(', ')} at that time.` });
      continue;
    }
    if (f.shift_start && f.shift_end) {
      const missing = uncoveredMinutes(start, end, here);
      if (missing > TIME_TOLERANCE_MINUTES) {
        out.push({ ...base, kind: 'off-hours', date: f.shift_date, documented, clocked: describe(here), detail: `Documented ${documented}, but clocked in ${describe(here)} (${fmtHours(missing)} h of the documented time wasn’t on the clock).` });
        continue;
      }
    }
    out.push({ ...base, kind: 'match', date: f.shift_date, documented, clocked: describe(here), detail: `Clocked in ${describe(here)}.` });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.person.localeCompare(b.person));
}

export const MISMATCH_LABELS: Record<MismatchKind, string> = {
  'no-clock': 'No clock-in',
  'wrong-home': 'Different site',
  'off-hours': 'Time doesn’t match',
  'never-at-home': 'Never at this site',
};
