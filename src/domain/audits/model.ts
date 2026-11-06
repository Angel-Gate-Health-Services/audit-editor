import { QUESTIONS, GENERAL_EXAMPLES, PAY_PERIOD_ANCHOR, REASON_MAX } from './config.ts';
import type { Audit, Check, DayIssue, Entry, Individual, PayPeriod, Question, Reason, Site } from '../../types/audit.ts';

const pad = (n: number) => String(n).padStart(2, '0');

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

export function parseISO(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function fmtLong(iso: string | null | undefined) {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function fmtShort(iso: string | null | undefined) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}

export function fmtTime(t: string | null | undefined) {
  if (!t) return '';
  const [hour, m] = t.split(':').map(Number);
  let h = hour;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad(h)}:${pad(m)} ${ap}`;
}

export function parseTime(text: string | null | undefined): string | null {
  const s = String(text || '').trim().toLowerCase().replace(/[\s.]/g, '');
  if (!s) return '';
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '00:00';
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3][0] === 'p' && h !== 12) h += 12;
    if (m[3][0] === 'a' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${pad(h)}:${pad(min)}`;
}

export const SHIFT_MIN_HOURS = 7;
export const SHIFT_MAX_HOURS = 12;

const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMinutes = (n: number) => { const v = ((n % 1440) + 1440) % 1440; return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };

export function shiftMinutes(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  return ((toMinutes(end) - toMinutes(start)) % 1440 + 1440) % 1440;
}

export function shiftLengthOk(start: string | null | undefined, end: string | null | undefined) {
  const n = shiftMinutes(start, end);
  return n !== null && n >= SHIFT_MIN_HOURS * 60 && n <= SHIFT_MAX_HOURS * 60;
}

export function shiftEndRange(start: string | null | undefined) {
  if (!start) return null;
  return { earliest: fromMinutes(toMinutes(start) + SHIFT_MIN_HOURS * 60), latest: fromMinutes(toMinutes(start) + SHIFT_MAX_HOURS * 60) };
}

export function shiftEndOptions(start: string | null | undefined, stepMinutes = 60) {
  if (!start) return [];
  const out: string[] = [];
  for (let n = SHIFT_MIN_HOURS * 60; n <= SHIFT_MAX_HOURS * 60; n += stepMinutes) out.push(fromMinutes(toMinutes(start) + n));
  return out;
}

export function fmtShiftLength(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hours`;
}

export function payPeriod(audit: { payStart?: string; payEnd?: string }) {
  const { payStart, payEnd } = audit;
  if (payStart && payEnd) return `${fmtShort(payStart)} - ${fmtShort(payEnd)}`;
  return fmtShort(payStart || payEnd);
}

const daysBetween = (a: string, b: string) => {
  const utc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(b) - utc(a)) / 86400000);
};

const periodStart = (index: number) => addDays(PAY_PERIOD_ANCHOR, index * 14);
const payDateOf = (index: number) => addDays(periodStart(index), 19);

export function payPeriodAt(index: number): PayPeriod {
  const year = payDateOf(index).slice(0, 4);
  let first = index;
  while (payDateOf(first - 1).slice(0, 4) === year) first--;
  const start = periodStart(index);
  return { index, number: index - first + 1, year, start, end: addDays(start, 13), payDate: payDateOf(index) };
}

export const payPeriodIndexFor = (iso: string) => Math.floor(daysBetween(PAY_PERIOD_ANCHOR, iso) / 14);

export const currentPayPeriod = (today = todayISO()) => payPeriodAt(payPeriodIndexFor(today));
export const lastPayPeriod = (today = todayISO()) => payPeriodAt(payPeriodIndexFor(today) - 1);

export function lastCompletedPayPeriod(today = todayISO()) {
  const p = lastPayPeriod(today);
  return { payStart: p.start, payEnd: p.end };
}

export function fmtRange(startIso: string, endIso: string) {
  const f = (iso: string, opts: Intl.DateTimeFormatOptions) => parseISO(iso).toLocaleDateString('en-US', opts);
  return `${f(startIso, { month: 'short', day: 'numeric' })} – ${f(endIso, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export const dateLabel = (e: Entry) => (e.allShifts ? 'All shifts' : fmtDate(e.date));

export function shiftLabel(e: Entry) {
  if (e.allShifts) return 'All shifts';
  if (!e.shiftStart && !e.shiftEnd) return '';
  return `${fmtTime(e.shiftStart)} - ${fmtTime(e.shiftEnd)}`;
}

const blankCheck = (): Check => ({ answer: null, reasons: [], otherOn: false, other: '', notes: '' });

export function newEntry(): Entry {
  return {
    id: uid(),
    createdAt: Date.now(),
    allShifts: false,
    otherThanListed: false,
    date: '',
    author: '',
    shiftStart: '',
    shiftEnd: '',
    checks: Object.fromEntries(QUESTIONS.map((q) => [q.key, blankCheck()])),
    reasonOverride: null,
  };
}

const SITE_TEXT_FIELDS = ['name', 'address', 'phone', 'managerTitle', 'manager', 'cell', 'email', 'supervisor'] as const;

export function cleanSite(s: Partial<Site>): Site {
  const site = { id: String(s.id || uid()) } as Site;
  for (const f of SITE_TEXT_FIELDS) site[f] = String(s[f] ?? '').trim();
  site.residents = (s.residents || []).map((r) => String(r).trim()).filter(Boolean);
  return site;
}

export function newAudit(site: Partial<Site>, auditor: string | null | undefined): Audit {
  const { id, ...snapshot } = cleanSite(site);
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    auditDate: todayISO(),
    auditor: auditor || '',
    siteId: id,
    site: snapshot,
    ...lastCompletedPayPeriod(),
    individuals: {},
    general: {
      notes: '',
      repeatStaff: null,
      recommendations: GENERAL_EXAMPLES.recommendations.map((_, exampleIndex) => ({ title: '', text: '', exampleIndex })),
      closing: '',
      examplesAsPlaceholders: true,
    },
  };
}

export function migrateNoteExamples(audit: Audit) {
  const general = audit.general;
  if (!general || general.examplesAsPlaceholders) return audit;
  for (const recommendation of general.recommendations || []) {
    const exampleIndex = GENERAL_EXAMPLES.recommendations.findIndex((example) =>
      recommendation.title === example.title || recommendation.text === example.text);
    if (exampleIndex < 0) continue;
    const example = GENERAL_EXAMPLES.recommendations[exampleIndex];
    recommendation.exampleIndex = exampleIndex;
    if (recommendation.title === example.title) recommendation.title = '';
    if (recommendation.text === example.text) recommendation.text = '';
  }
  if (general.closing === GENERAL_EXAMPLES.closing) general.closing = '';
  general.examplesAsPlaceholders = true;
  return audit;
}

export function individual(audit: Audit, name: string): Individual {
  if (!Object.hasOwn(audit.individuals, name)) {
    Object.defineProperty(audit.individuals, name, { value: { notes: '', entries: [] }, writable: true, enumerable: true, configurable: true });
  }
  return audit.individuals[name];
}

export const individualOf = (audit: Audit, name: string): Individual | null => (Object.hasOwn(audit.individuals, name) ? audit.individuals[name] : null);

export const sortNames = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

export const isFlagged = (q: Question, check: Check | null | undefined) => check?.answer === q.flagOn;
export const entryFlags = (e: Entry) => QUESTIONS.filter((q) => isFlagged(q, e.checks[q.key]));
export const entryFlagged = (e: Entry) => entryFlags(e).length > 0;
export const entryComplete = (e: Entry) => QUESTIONS.every((q) => e.checks[q.key].answer);

function sentence(s: string) {
  s = s.trim();
  s = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function joinList(items: string[]) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function coveredReason(q: Question, picked: string[], r: Reason) {
  return !r.covers && !(r.sentence && !r.part) && q.reasons.some((x) => x.covers && picked.includes(x.key));
}

export function generatedReason(e: Entry) {
  const picked: { q: Question; reasons: Reason[] }[] = [];
  const others: string[] = [];
  for (const q of entryFlags(e)) {
    const c = e.checks[q.key];
    const reasons = q.reasons.filter((r) => c.reasons.includes(r.key) && !coveredReason(q, c.reasons, r));
    if (reasons.length) picked.push({ q, reasons });
    if (c.otherOn && c.other.trim()) others.push(sentence(c.other));
  }
  const extra = [...new Set(others)];
  const all = picked.flatMap((p) => p.reasons);
  if (!all.length) return extra.join(' ');
  if (all.length === 1 && !extra.length) return all[0].text;

  const sentences = picked.flatMap(({ q, reasons }) => {
    const own = reasons.filter((r) => r.sentence).map((r) => r.sentence!);
    const parts = reasons.filter((r) => r.part);
    if (!parts.length) return own;
    if (q.items) {
      const plural = parts.length > 1 || parts[0].plural;
      return [`${capitalize(joinList(parts.map((r) => r.part!)))} ${plural ? 'are' : 'is'} ${q.items}.`, ...own];
    }
    return [`${q.subject} ${joinList(parts.map((r) => r.part!))}.`, ...own];
  }).concat(extra);
  const full = sentences.join(' ');
  if (full.length <= REASON_MAX) return full;

  const joined = sentences.map((t, i) => (i ? t.charAt(0).toLowerCase() + t.slice(1) : t).replace(/\.$/, '')).join('; ') + '.';
  if (joined.length <= REASON_MAX) return joined;

  const clauses = picked.flatMap(({ q, reasons }) => {
    const grouped = reasons.filter((r) => r.part || r.covers);
    const alone = reasons.filter((r) => r.sentence && !r.covers).map((r) => `${capitalize(r.tag)}.`);
    return [...(grouped.length ? [`${q.tagLabel}: ${grouped.map((r) => r.tag).join(', ')}.`] : []), ...alone];
  });
  return [...clauses, ...extra].join(' ');
}

export const entryReason = (e: Entry) => (e.reasonOverride ?? '').trim() || generatedReason(e);

export function sortedEntries(entries: Entry[]) {
  return [...entries].sort((a, b) => {
    if (a.allShifts !== b.allShifts) return a.allShifts ? 1 : -1;
    return (a.date + a.shiftStart).localeCompare(b.date + b.shiftStart) || a.createdAt - b.createdAt;
  });
}

export const DAY_ISSUES: Record<Exclude<DayIssue, ''>, string> = { one: 'Only one submission on this date', none: 'No submission on this date' };

export const dayIssueDates = (ind: Individual | null | undefined) => Object.keys(ind?.dayIssues || {}).sort();

export const shiftDates = (ind: Individual | null | undefined, except: Entry | null = null) => new Set((ind?.entries || []).filter((e) => e !== except && !e.allShifts && e.date).map((e) => e.date));

export const noSubmissionOn = (ind: Individual | null | undefined, iso: string) => ind?.dayIssues?.[iso] === 'none';

export function dayIssueLines(ind: Individual | null | undefined) {
  if (!ind) return [];
  const audited = shiftDates(ind);
  const issues = ind.dayIssues || {};
  return dayIssueDates(ind)
    .filter((iso) => (DAY_ISSUES as Record<string, string>)[issues[iso]] && !(issues[iso] === 'none' && audited.has(iso)))
    .map((iso) => (issues[iso] === 'one'
      ? `There is only one submission of documentation on ${fmtLong(iso)}.`
      : `There is no submission of documentation on ${fmtLong(iso)}.`));
}

export const splitLines = (text: string | null | undefined) =>
  (text || '').split('\n').map((s) => s.trim().replace(/^[-–•*]\s*/, '')).filter(Boolean);

export function individualNotes(audit: Audit, name: string) {
  const ind = individualOf(audit, name);
  if (!ind) return [];
  const lines = [...splitLines(ind.notes), ...dayIssueLines(ind)];
  for (const e of sortedEntries(ind.entries)) {
    const label = [dateLabel(e), e.allShifts ? '' : shiftLabel(e)].filter(Boolean).join(', ');
    const who = e.author ? ` (${e.author})` : '';
    for (const q of QUESTIONS) {
      const n = e.checks[q.key].notes.trim();
      if (n) lines.push(`${label}${who}: ${n}`);
    }
  }
  return lines;
}

export function individualDone(audit: Audit, name: string) {
  const ind = individualOf(audit, name);
  if (!ind) return false;
  return Boolean(ind.adequate) || ind.entries.some((e) => entryComplete(e) && entryFlagged(e)) || dayIssueLines(ind).length > 0;
}

export const remainingIndividuals = (audit: Audit) => audit.site.residents.filter((n) => !individualDone(audit, n));

export const canCompleteAudit = (audit: Audit) => remainingIndividuals(audit).length <= 1;

export const allEntries = (audit: Audit) => Object.values(audit.individuals).flatMap((i) => i.entries);

export function flaggedAuthors(audit: Audit) {
  const counts = new Map<string, number>();
  for (const e of allEntries(audit)) {
    const name = e.author.trim();
    if (!name || !entryFlagged(e)) continue;
    counts.set(name, (counts.get(name) || 0) + (e.allShifts ? 2 : 1));
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const suggestedRepeatStaff = (audit: Audit) => flaggedAuthors(audit).filter((a) => a.count >= 2).map((a) => a.name);

export const repeatStaff = (audit: Audit) => audit.general.repeatStaff ?? suggestedRepeatStaff(audit);

export const AUDIT_SORTS = [
  ['edited', 'Last edited'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['most-flagged', 'Most flagged'],
  ['least-flagged', 'Least flagged'],
  ['home', 'Site name (A–Z)'],
] as const;

export type AuditSortKey = (typeof AUDIT_SORTS)[number][0];

export const flaggedCount = (audit: Partial<Audit> | null | undefined) => Object.values(audit?.individuals || {}).flatMap((i) => i.entries || []).filter(entryFlagged).length;

export function sortAudits<T>(list: T[], key: string = 'edited', pick: (x: T) => Partial<Audit> | null | undefined = (x) => x as Partial<Audit>) {
  const started = (a: Partial<Audit>) => Number(a.createdAt) || Number(a.updatedAt) || 0;
  const edited = (a: Partial<Audit>) => Number(a.updatedAt) || 0;
  const name = (a: Partial<Audit>) => a.site?.name || '';
  const compare = ({
    edited: (a: Partial<Audit>, b: Partial<Audit>) => edited(b) - edited(a),
    newest: (a: Partial<Audit>, b: Partial<Audit>) => started(b) - started(a),
    oldest: (a: Partial<Audit>, b: Partial<Audit>) => started(a) - started(b),
    'most-flagged': (a: Partial<Audit>, b: Partial<Audit>) => flaggedCount(b) - flaggedCount(a) || edited(b) - edited(a),
    'least-flagged': (a: Partial<Audit>, b: Partial<Audit>) => flaggedCount(a) - flaggedCount(b) || edited(b) - edited(a),
    home: (a: Partial<Audit>, b: Partial<Audit>) => name(a).localeCompare(name(b), 'en', { sensitivity: 'base' }) || edited(b) - edited(a),
  } as Record<string, (a: Partial<Audit>, b: Partial<Audit>) => number>)[key] || ((a: Partial<Audit>, b: Partial<Audit>) => edited(b) - edited(a));
  return [...list].sort((x, y) => compare(pick(x) || {}, pick(y) || {}));
}
