import { QUESTIONS } from '../audits/config.ts';
import {
  entryComplete, entryFlagged, entryFlags, coveredReason, payPeriodIndexFor, payPeriodAt, shiftMinutes, fmtLong, parseISO,
} from '../audits/model.ts';
import type { Audit, Completion, Employee, Finding, FindingReview, PayPeriod } from '../../types/audit.ts';

export type Reviews = Map<string, Pick<FindingReview, 'excused'> & Partial<FindingReview>>;

export const nameKey = (name: string | null | undefined) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const employeeKeys = (employee: Pick<Employee, 'name' | 'aliases'>) => [employee.name, ...(employee.aliases || [])].map(nameKey).filter(Boolean);

export function employeeIndex<E extends Pick<Employee, 'name' | 'aliases'>>(employees: E[] | null | undefined) {
  const index = new Map<string, E>();
  for (const e of employees || []) for (const key of employeeKeys(e)) if (!index.has(key)) index.set(key, e);
  return index;
}

export function shiftFindings(audit: Audit | null | undefined): Finding[] {
  const out: Finding[] = [];
  if (!audit) return out;
  for (const ind of Object.values(audit.individuals || {})) {
    for (const e of ind.entries || []) {
      const author = String(e.author || '').trim().replace(/\s+/g, ' ');
      if (!author || !e.id) continue;
      const complete = entryComplete(e);
      out.push({
        id: `${audit.id}:${e.id}`,
        audit_id: audit.id,
        entry_id: e.id,
        employee_name: author.slice(0, 200),
        employee_key: nameKey(author).slice(0, 200),
        home_id: audit.siteId || null,
        home_name: audit.site?.name || null,
        pay_period_start: audit.payStart || null,
        shift_date: !e.allShifts && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : null,
        shift_start: !e.allShifts && /^\d{2}:\d{2}$/.test(e.shiftStart || '') ? e.shiftStart : null,
        shift_end: !e.allShifts && /^\d{2}:\d{2}$/.test(e.shiftEnd || '') ? e.shiftEnd : null,
        all_shifts: Boolean(e.allShifts),
        complete,
        flagged: complete && entryFlagged(e),
        flags: entryFlags(e).map((q) => {
          const c = e.checks[q.key];
          return { q: q.key, reasons: c.reasons.filter((r) => q.reasons.some((x) => x.key === r && !coveredReason(q, c.reasons, x))), other: Boolean(c.otherOn && c.other.trim()) };
        }),
        audit_completed: Boolean(audit.completionId || audit.completedAt),
      });
    }
  }
  return out;
}

export function groupFindings<E extends Pick<Employee, 'id' | 'name' | 'aliases'>>(findings: Finding[], employees: E[] | null | undefined) {
  const index = employeeIndex(employees);
  const byEmployee = new Map<string, Finding[]>();
  const unlisted = new Map<string, { key: string; name: string; rows: Finding[] }>();
  for (const f of findings) {
    const key = f.employee_key || nameKey(f.employee_name);
    const employee = index.get(key);
    if (employee) {
      if (!byEmployee.has(employee.id)) byEmployee.set(employee.id, []);
      byEmployee.get(employee.id)!.push(f);
    } else {
      if (!unlisted.has(key)) unlisted.set(key, { key, name: f.employee_name, rows: [] });
      unlisted.get(key)!.rows.push(f);
    }
  }
  return { byEmployee, unlisted };
}

const question = (key: string) => QUESTIONS.find((q) => q.key === key);

export function reasonLabel(qKey: string, rKey: string) {
  const q = question(qKey);
  if (!q) return rKey;
  if (rKey === 'other') return `${q.short}: other reason`;
  const r = q.reasons.find((x) => x.key === rKey);
  return r ? `${q.short}: ${r.label}` : q.short;
}

const lowerFirst = (s: string) => s.split(' ').map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');

export function reasonPhrase(qKey: string, rKey: string) {
  const q = question(qKey);
  if (!q) return rKey;
  if (rKey === 'other') return `other problems with the ${q.short.toLowerCase()}`;
  if (qKey === 'missing' && rKey === 'clockin') return 'clock-ins that didn’t match the schedule';
  if (qKey === 'missing' && rKey === 'Documentation') return 'empty submissions';
  const r = q.reasons.find((x) => x.key === rKey);
  if (!r) return q.short.toLowerCase();
  if (qKey === 'missing') return `missing ${lowerFirst(r.label)}`;
  if (qKey === 'summary' && rKey === 'missing') return 'no daily summary';
  if (qKey === 'progress' && rKey === 'missing') return 'missing progress notes';
  return `${lowerFirst(r.label)} in the ${q.short.toLowerCase()}`;
}

export function shiftKind(start: string | null | undefined) {
  if (!/^\d{2}:\d{2}$/.test(start || '')) return null;
  const h = Number(start!.slice(0, 2));
  if (h >= 5 && h < 12) return 'Day';
  if (h >= 12 && h < 18) return 'Evening';
  return 'Overnight';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pct = (n: number, d: number) => (d ? n / d : 0);
const top = <K,>(map: Map<K, number>) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

export function rateFor(findings: Finding[], reviews: Reviews = new Map()) {
  const done = findings.filter((f) => f.complete);
  const flagged = done.filter((f) => f.flagged && !reviews.get(f.id)?.excused);
  return pct(flagged.length, done.length);
}

export interface PeriodStat { index: number; period: PayPeriod; shifts: number; flagged: number }
export interface HomeStat { id: string | null; name: string; shifts: number; flagged: number }

export function employeeStats(findings: Finding[], { reviews = new Map(), orgRate = null, recentPeriods = 3 }: { reviews?: Reviews; orgRate?: number | null; recentPeriods?: number } = {}) {
  const rows = [...findings].sort((a, b) => (b.shift_date || b.pay_period_start || '').localeCompare(a.shift_date || a.pay_period_start || ''));
  const done = rows.filter((f) => f.complete);
  const excused = done.filter((f) => f.flagged && reviews.get(f.id)?.excused);
  const flagged = done.filter((f) => f.flagged && !reviews.get(f.id)?.excused);
  const byQuestion = new Map<string, number>();
  const byReason = new Map<string, number>();
  for (const f of flagged) {
    for (const flag of f.flags || []) {
      byQuestion.set(flag.q, (byQuestion.get(flag.q) || 0) + 1);
      for (const r of flag.reasons || []) byReason.set(`${flag.q}:${r}`, (byReason.get(`${flag.q}:${r}`) || 0) + 1);
      if (flag.other) byReason.set(`${flag.q}:other`, (byReason.get(`${flag.q}:other`) || 0) + 1);
    }
  }
  const homes = new Map<string, HomeStat>();
  for (const f of done) {
    const key = f.home_id || f.home_name || 'unknown';
    const h = homes.get(key) || { id: f.home_id, name: f.home_name || 'Unknown site', shifts: 0, flagged: 0 };
    h.shifts += 1;
    if (flagged.includes(f)) h.flagged += 1;
    homes.set(key, h);
  }
  const periods = new Map<number, PeriodStat>();
  for (const f of done) {
    if (!f.pay_period_start) continue;
    const index = payPeriodIndexFor(f.pay_period_start);
    const p = periods.get(index) || { index, period: payPeriodAt(index), shifts: 0, flagged: 0 };
    p.shifts += 1;
    if (flagged.includes(f)) p.flagged += 1;
    periods.set(index, p);
  }
  const periodList = [...periods.values()].sort((a, b) => a.index - b.index);
  const lastIndex = periodList.at(-1)?.index ?? null;
  const recent = periodList.filter((p) => lastIndex !== null && p.index > lastIndex - recentPeriods);
  const earlier = periodList.filter((p) => lastIndex !== null && p.index <= lastIndex - recentPeriods);
  const sum = (list: PeriodStat[], k: 'shifts' | 'flagged') => list.reduce((n, p) => n + p[k], 0);
  const recentRate = pct(sum(recent, 'flagged'), sum(recent, 'shifts'));
  const earlierRate = pct(sum(earlier, 'flagged'), sum(earlier, 'shifts'));
  let streak = 0;
  for (let i = periodList.length - 1; i >= 0; i -= 1) {
    if (periodList[i].flagged > 0 && (i === periodList.length - 1 || periodList[i + 1].index === periodList[i].index + 1)) streak += 1;
    else break;
  }
  const kinds = new Map<string, number>();
  const weekdays = new Map<string, number>();
  const lengths: number[] = [];
  for (const f of done) {
    const kind = shiftKind(f.shift_start);
    if (kind) kinds.set(kind, (kinds.get(kind) || 0) + 1);
    if (f.shift_date) {
      const day = WEEKDAYS[parseISO(f.shift_date).getDay()];
      weekdays.set(day, (weekdays.get(day) || 0) + 1);
    }
    const minutes = shiftMinutes(f.shift_start, f.shift_end);
    if (minutes) lengths.push(minutes);
  }
  const dates = rows.map((f) => f.shift_date || f.pay_period_start).filter((d): d is string => Boolean(d)).sort();
  return {
    rows,
    total: rows.length,
    complete: done.length,
    inProgress: rows.length - done.length,
    flagged: flagged.length,
    excused: excused.length,
    clean: done.length - flagged.length - excused.length,
    rate: pct(flagged.length, done.length),
    orgRate,
    allShifts: done.filter((f) => f.all_shifts && flagged.includes(f)).length,
    byQuestion: top(byQuestion).map(([q, count]) => ({ q, label: question(q)?.short || q, count })),
    topReasons: top(byReason).map(([key, count]) => {
      const [q, r] = key.split(':');
      return { q, r, label: reasonLabel(q, r), phrase: reasonPhrase(q, r), count };
    }),
    clockIn: byReason.get('missing:clockin') || 0,
    homes: [...homes.values()].sort((a, b) => b.shifts - a.shifts || a.name.localeCompare(b.name)),
    periods: periodList,
    recentRate,
    earlierRate,
    hasTrend: recent.length > 0 && earlier.length > 0,
    streak,
    kinds: top(kinds).map(([kind, count]) => ({ kind, count })),
    topWeekday: top(weekdays)[0]?.[0] || null,
    avgLength: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null,
    auditors: new Set(rows.map((f) => f.auditor_id).filter(Boolean)).size,
    first: dates[0] || null,
    last: dates.at(-1) || null,
  };
}

export type EmployeeStats = ReturnType<typeof employeeStats>;

const percent = (r: number) => `${Math.round(r * 100)}%`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function summarize(name: string, s: EmployeeStats) {
  const first = name.split(' ')[0] || name;
  if (!s.total) return `No shifts by ${name} have been audited yet. Statistics will appear here as soon as an auditor reviews one of their shifts.`;
  if (!s.complete) return `${name} has ${s.total === 1 ? 'a shift' : `${s.total} shifts`} being audited right now. Statistics will appear once ${s.total === 1 ? 'it’s' : 'they’re'} finished.`;
  const parts: string[] = [];
  const where = s.homes.length === 1 ? `at ${s.homes[0].name}` : `across ${s.homes.length} sites`;
  const when = s.first && s.last && s.first !== s.last ? ` between ${fmtLong(s.first)} and ${fmtLong(s.last)}` : s.last ? ` on ${fmtLong(s.last)}` : '';
  parts.push(`${name} has had ${s.complete === 1 ? 'one shift' : `${s.complete} shifts`} audited ${where}${when}.`);
  if (!s.flagged) {
    parts.push(`None of them were flagged${s.excused ? ` (${s.excused === 1 ? 'one flag was' : `${s.excused} flags were`} excused by an admin)` : ''}, which is a clean record.`);
  } else {
    const vs = s.orgRate === null ? '' : s.rate > s.orgRate + 0.05 ? `, higher than the company average of ${percent(s.orgRate)}` : s.rate < s.orgRate - 0.05 ? `, lower than the company average of ${percent(s.orgRate)}` : `, close to the company average of ${percent(s.orgRate)}`;
    parts.push(`${s.flagged === 1 ? 'One' : s.flagged} of them (${percent(s.rate)}) ${s.flagged === 1 ? 'was' : 'were'} flagged${vs}.`);
    const [a, b] = s.topReasons;
    if (a) parts.push(`The most common issue is ${a.phrase} (${a.count === 1 ? 'once' : `${a.count} times`})${b ? `, followed by ${b.phrase} (${b.count === 1 ? 'once' : `${b.count} times`})` : ''}.`);
    if (s.excused) parts.push(`${s.excused === 1 ? 'One more flag was' : `${s.excused} more flags were`} excused by an admin and ${s.excused === 1 ? 'isn’t' : 'aren’t'} counted.`);
  }
  if (s.hasTrend) {
    const diff = s.recentRate - s.earlierRate;
    if (diff <= -0.1) parts.push(`Things are improving: ${percent(s.recentRate)} of recent shifts were flagged, down from ${percent(s.earlierRate)} before.`);
    else if (diff >= 0.1) parts.push(`Flags are rising: ${percent(s.recentRate)} of recent shifts were flagged, up from ${percent(s.earlierRate)} before.`);
    else parts.push(`The flag rate has held steady over recent pay periods.`);
  }
  if (s.streak >= 2) parts.push(`${first} has been flagged in ${s.streak} pay periods in a row.`);
  if (s.clockIn) parts.push(`${s.clockIn === 1 ? 'One clock-in' : `${s.clockIn} clock-ins`} didn’t match the schedule.`);
  const habits: string[] = [];
  if (s.kinds[0]) habits.push(`mostly works ${lower(s.kinds[0].kind)} shifts`);
  if (s.homes.length > 1) habits.push(`most often at ${s.homes[0].name}`);
  if (s.avgLength) habits.push(`with shifts averaging about ${Math.round(s.avgLength / 60)} hours`);
  if (habits.length) parts.push(`${first} ${habits.join(', ')}.`);
  return parts.join(' ');
}

export const homeKey = (f: Pick<Finding, 'home_id' | 'home_name'>) => f.home_id || `name:${nameKey(f.home_name || 'unknown')}`;

export function groupByHome(findings: Finding[]) {
  const homes = new Map<string, { key: string; id: string | null; name: string; rows: Finding[] }>();
  for (const f of findings) {
    const key = homeKey(f);
    if (!homes.has(key)) homes.set(key, { key, id: f.home_id, name: f.home_name || 'Unknown site', rows: [] });
    homes.get(key)!.rows.push(f);
  }
  return homes;
}

export interface StaffPerson { id: string | null; name: string; listed: boolean; key: string; s: EmployeeStats }

export function staffBreakdown<E extends Pick<Employee, 'id' | 'name' | 'aliases'>>(rows: Finding[], employees: E[] | null | undefined, { reviews = new Map() }: { reviews?: Reviews } = {}): StaffPerson[] {
  const { byEmployee, unlisted } = groupFindings(rows, employees);
  const people: StaffPerson[] = [];
  for (const e of employees || []) {
    const list = byEmployee.get(e.id);
    if (list) people.push({ id: e.id, name: e.name, listed: true, key: nameKey(e.name), s: employeeStats(list, { reviews }) });
  }
  for (const u of unlisted.values()) people.push({ id: null, name: u.name, listed: false, key: u.key, s: employeeStats(u.rows, { reviews }) });
  return people.sort((a, b) => b.s.flagged - a.s.flagged || b.s.rate - a.s.rate || b.s.complete - a.s.complete || a.name.localeCompare(b.name));
}

export function coverage<C extends Pick<Completion, 'home_id' | 'pay_period_start'>>(completions: C[] | null | undefined, homeId: string, lastIndex: number, span = 6) {
  const done = new Map<number, C>();
  for (const c of completions || []) {
    if (c.home_id !== homeId || !c.pay_period_start) continue;
    done.set(payPeriodIndexFor(c.pay_period_start), c);
  }
  const periods: { index: number; period: PayPeriod; completion: C | null }[] = [];
  for (let i = lastIndex; i > lastIndex - span && i >= 0; i -= 1) periods.push({ index: i, period: payPeriodAt(i), completion: done.get(i) || null });
  return { periods, audited: periods.filter((p) => p.completion).length, total: periods.length, missedInRow: periods.findIndex((p) => p.completion) === -1 ? periods.length : periods.findIndex((p) => p.completion) };
}

export function summarizeHome(name: string, s: EmployeeStats, { staff = [], cover = null }: { staff?: StaffPerson[]; cover?: { total: number; audited: number; missedInRow: number } | null } = {}) {
  const parts: string[] = [];
  if (!s.total) {
    parts.push(`No shifts at ${name} have been audited yet.`);
  } else if (!s.complete) {
    parts.push(`${s.total === 1 ? 'A shift' : `${s.total} shifts`} at ${name} ${s.total === 1 ? 'is' : 'are'} being audited right now.`);
  } else {
    const people = staff.filter((p) => p.s.complete).length;
    const when = s.first && s.last && s.first !== s.last ? ` between ${fmtLong(s.first)} and ${fmtLong(s.last)}` : s.last ? ` on ${fmtLong(s.last)}` : '';
    parts.push(`${name} has had ${s.complete === 1 ? 'one shift' : `${s.complete} shifts`} audited from ${people === 1 ? 'one staff member' : `${people} staff members`}${when}.`);
    if (!s.flagged) {
      parts.push(`None of them were flagged${s.excused ? ` (${s.excused === 1 ? 'one flag was' : `${s.excused} flags were`} excused by an admin)` : ''}.`);
    } else {
      const vs = s.orgRate === null ? '' : s.rate > s.orgRate + 0.05 ? `, higher than the company average of ${percent(s.orgRate)}` : s.rate < s.orgRate - 0.05 ? `, lower than the company average of ${percent(s.orgRate)}` : `, close to the company average of ${percent(s.orgRate)}`;
      parts.push(`${s.flagged === 1 ? 'One' : s.flagged} of them (${percent(s.rate)}) ${s.flagged === 1 ? 'was' : 'were'} flagged${vs}.`);
      const [a, b] = s.topReasons;
      if (a) parts.push(`The most common issue is ${a.phrase} (${a.count === 1 ? 'once' : `${a.count} times`})${b ? `, followed by ${b.phrase} (${b.count === 1 ? 'once' : `${b.count} times`})` : ''}.`);
      const flaggedStaff = staff.filter((p) => p.s.flagged).slice(0, 2);
      if (flaggedStaff.length) {
        const share = s.flagged ? flaggedStaff.reduce((n, p) => n + p.s.flagged, 0) / s.flagged : 0;
        parts.push(`${flaggedStaff.map((p) => `${p.name} (${p.s.flagged})`).join(' and ')} account${flaggedStaff.length === 1 ? 's' : ''} for ${percent(share)} of the flags.`);
      }
    }
    if (s.hasTrend) {
      const diff = s.recentRate - s.earlierRate;
      if (diff <= -0.1) parts.push(`Documentation is improving: ${percent(s.recentRate)} of recent shifts were flagged, down from ${percent(s.earlierRate)} before.`);
      else if (diff >= 0.1) parts.push(`Flags are rising: ${percent(s.recentRate)} of recent shifts were flagged, up from ${percent(s.earlierRate)} before.`);
      else parts.push('The flag rate has held steady over recent pay periods.');
    }
    if (s.clockIn) parts.push(`${s.clockIn === 1 ? 'One clock-in' : `${s.clockIn} clock-ins`} didn’t match the schedule.`);
  }
  if (cover?.total) {
    if (cover.audited === cover.total) parts.push(`It was audited in every one of the last ${cover.total} pay periods.`);
    else if (!cover.audited) parts.push(`It hasn’t been marked audited in any of the last ${cover.total} pay periods.`);
    else parts.push(`It was audited in ${cover.audited} of the last ${cover.total} pay periods${cover.missedInRow >= 2 ? `, but not in the most recent ${cover.missedInRow}` : ''}.`);
  }
  return parts.join(' ');
}
