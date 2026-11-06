import * as api from '../../services/api/api.ts';
import { SITE_BUSY_MESSAGE } from '../../services/live-audit/audit-watcher.ts';
import {
  DAY_ISSUES, SHIFT_MAX_HOURS, SHIFT_MIN_HOURS, addDays, coveredReason, fmtDate, individual, isFlagged, newAudit, newEntry, noSubmissionOn,
  payPeriod, remainingIndividuals, repeatStaff, shiftDates, shiftLengthOk, todayISO,
} from '../../domain/audits/model.ts';
import { buildPdf, pdfFileName } from '../../domain/audits/pdf.ts';
import { canReopenCompletion, completionMatchesAudit } from '../../domain/audits/progress.ts';
import { QUESTIONS } from '../../domain/audits/config.ts';
import { askConfirm, showAlert } from '../../components/dialog/dialog.ts';
import { useAudits, useProgress, useSession, useUi } from '../../app/store/stores.ts';
import { auditEditingBlocked, commitAudit, completingOrDeleting, currentAudit, findAudit, persist, saveNow } from '../../app/runtime/audit-access.ts';
import { allSites, isAdmin, refreshEmployees } from '../../app/runtime/people.ts';
import { services } from '../../app/runtime/services.ts';
import { scrollToFlash, showToast } from '../../app/runtime/feedback.ts';
import { parseRoute } from '../../app/navigation/route.ts';
import { go } from '../../app/navigation/navigator.ts';
import { cacheCompletion, completionOf, completionsFor, loadCompletions, removeCompletion, viewedPayPeriod } from '../progress/progress.ts';
import type { Answer, Audit, DayIssue, Entry } from '../../types/audit.ts';

export const ENTRY_STEPS: [string, string][] = [['details', 'Shift'], ...QUESTIONS.map((q): [string, string] => [q.key, q.short]), ['review', 'Review']];

export function fail(msg: string) {
  useUi.setState({ error: msg });
  scrollToFlash('.flash-error', 'center');
}

const routeName = () => parseRoute()[3];

function entryIn(audit: Audit, name: string, entryId: string): Entry | undefined {
  return individual(audit, name).entries.find((e) => e.id === entryId);
}

export function currentEntry() {
  const [, , , name, , entryId] = parseRoute();
  const audit = currentAudit();
  if (!audit || !name || !entryId || !Object.hasOwn(audit.individuals, name)) return null;
  return audit.individuals[name].entries.find((e) => e.id === entryId) || null;
}

function updateEntry(recipe: (entry: Entry, audit: Audit) => void) {
  const [, id, , name, , entryId] = parseRoute();
  return commitAudit(id, (audit) => {
    const entry = entryIn(audit, name, entryId);
    if (entry) recipe(entry, audit);
  });
}

export async function pickSite(id: string) {
  const watcher = services.auditWatcher;
  if (useUi.getState().pickingSite || !watcher) return;
  const site = allSites().find((s) => s.id === id);
  if (!site) return;
  const chosen = viewedPayPeriod();
  const period = chosen.start;
  const profile = useSession.getState().profile!;
  const occupied = watcher.snapshot().list.find((r) => r.home_id === id && r.pay_period_start === period);
  if (occupied && occupied.user_id !== profile.id) return showToast(SITE_BUSY_MESSAGE);
  const gen = useSession.getState().generation;
  const origin = location.hash;
  const stale = () => watcher !== services.auditWatcher || gen !== useSession.getState().generation || useSession.getState().profile !== profile || location.hash !== origin;
  useUi.setState({ pickingSite: true });
  await loadCompletions(period);
  if (stale()) {
    if (gen === useSession.getState().generation) useUi.setState({ pickingSite: false });
    return;
  }
  const completionState = useProgress.getState().completions[period];
  if (completionState?.error || !completionState?.list) {
    useUi.setState({ pickingSite: false });
    showToast('Couldn’t verify whether this site is complete. Please try again.');
    return;
  }
  const completed = completionState.list.find((r) => r.home_id === id);
  if (completed) {
    useUi.setState({ pickingSite: false });
    showToast(isAdmin() ? 'Undo this completed audit before starting it again.' : 'This site’s audit is already complete.');
    return;
  }
  const { audits, auditor } = useAudits.getState();
  const existing = audits.find((a) => a.siteId === id && a.payStart === period && !completionOf(a));
  const audit = existing || { ...newAudit(site, auditor || profile.display_name), payStart: chosen.start, payEnd: chosen.end };
  try {
    const claimed = await watcher.open({ homeId: site.id, auditId: audit.id, payStart: audit.payStart });
    if (stale()) {
      await watcher.close();
      return;
    }
    if (!claimed) {
      showToast(watcher.snapshot().status === 'blocked' ? SITE_BUSY_MESSAGE : 'Couldn’t check site availability. Please try again.');
      return;
    }
    if (!existing) useAudits.setState((s) => ({ audits: [audit, ...s.audits] }));
    if (!saveNow()) {
      if (!existing) useAudits.setState((s) => ({ audits: s.audits.filter((a) => a.id !== audit.id) }));
      await watcher.close();
      showToast('Couldn’t save this audit in this browser. Please try again.');
      return;
    }
    commitAudit(audit.id, () => {});
    go('a', audit.id, 'setup');
  } finally {
    if (gen === useSession.getState().generation) useUi.setState({ pickingSite: false });
  }
}

export const refreshActivity = () => services.auditWatcher?.refresh();

export function retryActivity() {
  const audit = currentAudit();
  if (audit) return services.auditWatcher?.open({ homeId: audit.siteId, auditId: audit.id });
}

export function dateToday() {
  const audit = currentAudit();
  if (audit) commitAudit(audit.id, (a) => { a.auditDate = todayISO(); });
}

export function setupNext() {
  const audit = currentAudit();
  if (!audit) return;
  if (!audit.auditor.trim()) return fail('Add your name for the “Audit By” line.');
  if (!audit.payStart || !audit.payEnd) return fail('Set the pay period start and end dates.');
  if (!audit.site.residents.length) return fail('This site has no individuals. Add them to your sites file and import it again.');
  go('a', audit.id);
}

export function addEntry() {
  const audit = currentAudit();
  const name = routeName();
  if (!audit || !name) return;
  const entry = newEntry();
  commitAudit(audit.id, (a) => { individual(a, name).entries.push(entry); });
  go('a', audit.id, 'i', name, 'e', entry.id, 'details');
}

export async function deleteEntry(id: string) {
  if (!(await askConfirm('The shift and its answers will be removed from this audit.', { title: 'Delete this shift?', confirmLabel: 'Delete shift', danger: true }))) return;
  const audit = currentAudit();
  const name = routeName();
  if (!audit || !name) return;
  commitAudit(audit.id, (a) => {
    const ind = individual(a, name);
    ind.entries = ind.entries.filter((e) => e.id !== id);
  });
}

export function entryNext(step: string) {
  const [, id, , name, , entryId] = parseRoute();
  const entry = currentEntry();
  const audit = currentAudit();
  if (!entry || !audit) return;
  if (step === 'details') {
    if (!entry.author.trim()) return fail('Enter the author of this documentation.');
    if (!entry.allShifts && !entry.date) return fail('Enter the submission date, or mark it as all shifts.');
    if (!entry.allShifts && (!entry.shiftStart || !entry.shiftEnd)) return fail('Enter the shift start and end times.');
    if (!entry.allShifts && entry.date && noSubmissionOn(individual(audit, name), entry.date)) return fail(`${fmtDate(entry.date)} is marked as having no submission for ${name}. Pick another day.`);
    if (!entry.allShifts && !shiftLengthOk(entry.shiftStart, entry.shiftEnd)) return fail(`A shift is ${SHIFT_MIN_HOURS} to ${SHIFT_MAX_HOURS} hours long. Change the start or end time.`);
  } else {
    const q = QUESTIONS.find((x) => x.key === step)!;
    const c = entry.checks[q.key];
    if (!c.answer) return fail('Choose yes or no.');
    if (isFlagged(q, c) && !c.reasons.length && !(c.otherOn && c.other.trim())) return fail('Pick at least one reason, or choose Other and describe it.');
  }
  const next = ENTRY_STEPS[ENTRY_STEPS.findIndex((s) => s[0] === step) + 1][0];
  go('a', id, 'i', name, 'e', entryId, next);
}

export function setAdequate(adequate: boolean) {
  const audit = currentAudit();
  const name = routeName();
  if (audit && name) commitAudit(audit.id, (a) => { individual(a, name).adequate = adequate; });
}

export async function markAuditComplete() {
  if (completingOrDeleting()) return;
  const audit = currentAudit();
  if (!audit) return;
  if (!allSites().some((h) => h.id === audit.siteId)) {
    useProgress.setState({ completeMsg: { ok: false, text: 'This audit was started before sites moved to the database, so it can’t count toward progress. Start a new audit for this site.' } });
    return;
  }
  const left = remainingIndividuals(audit);
  if (left.length && !(await askConfirm(`${left[0]} has no flagged shift and isn’t marked as having adequate documentation.`, { title: 'Mark the audit complete anyway?', confirmLabel: 'Mark complete' }))) return;
  useProgress.setState({ completing: true, completeMsg: null });
  const id = audit.id;
  try {
    const completionId = findAudit(id)?.completionId || crypto.randomUUID();
    useAudits.setState((s) => ({ audits: s.audits.map((a) => (a.id === id ? { ...a, completionId } : a)) }));
    if (!saveNow()) throw new Error('Couldn’t save this audit in this browser. Progress was not changed.');
    const rec = await api.markAuditComplete(audit.payStart, audit.siteId, completionId);
    cacheCompletion(audit.payStart, rec);
    commitAudit(id, (a) => {
      a.completedAt = rec.completed_at;
      a.completionId = rec.id;
    });
    useProgress.setState({ completeMsg: { ok: true, text: `${audit.site.name} is marked complete. Everyone’s progress bar now includes it.` } });
  } catch (err) {
    useProgress.setState({ completeMsg: { ok: false, text: (err as Error).message } });
    void loadCompletions(audit.payStart);
  }
  useProgress.setState({ completing: false });
}

export function toggleDayIssue(date: string) {
  const audit = currentAudit();
  const name = routeName();
  if (!audit || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
  commitAudit(audit.id, (a) => {
    const ind = individual(a, name);
    const issues = { ...(ind.dayIssues || {}) };
    if (Object.hasOwn(issues, date)) delete issues[date];
    else issues[date] = '';
    ind.dayIssues = issues;
  });
}

export function setDayIssue(date: string, kind: string) {
  const audit = currentAudit();
  const name = routeName();
  if (!audit || !name || !Object.hasOwn(DAY_ISSUES, kind)) return;
  const ind = individual(structuredClone(audit), name);
  if (!Object.hasOwn(ind.dayIssues || {}, date)) return;
  if (kind === 'none' && shiftDates(ind).has(date)) return showToast('A shift is audited on this day, so it can’t have no submission.');
  commitAudit(audit.id, (a) => {
    const target = individual(a, name);
    target.dayIssues = { ...target.dayIssues, [date]: kind as DayIssue };
    target.adequate = false;
  });
}

export async function addAuthorAsEmployee() {
  const name = (currentEntry()?.author || '').trim();
  if (!name) return;
  try {
    await api.createEmployee(name);
    await refreshEmployees();
    showToast(`${name} was added to employees.`);
  } catch (err) {
    void showAlert((err as Error).message);
  }
}

export function pickShiftDate(date: string) {
  const name = routeName();
  const audit = currentAudit();
  if (audit && name && noSubmissionOn(Object.hasOwn(audit.individuals, name) ? audit.individuals[name] : null, date)) return showToast(`${fmtDate(date)} is marked as having no submission for ${name}.`);
  useUi.setState({ error: '' });
  updateEntry((entry) => { entry.date = date; });
}

export function answer(q: string, v: Answer) {
  useUi.setState({ error: '' });
  updateEntry((entry) => { entry.checks[q].answer = v; });
}

export function toggleReason(q: string, r: string) {
  const question = QUESTIONS.find((x) => x.key === q);
  const reason = question?.reasons.find((x) => x.key === r);
  const entry = currentEntry();
  if (!entry || !question || !reason || coveredReason(question, entry.checks[q].reasons, reason)) return;
  useUi.setState({ error: '' });
  updateEntry((e) => {
    const c = e.checks[q];
    c.reasons = c.reasons.includes(r) ? c.reasons.filter((x) => x !== r) : [...c.reasons, r];
    c.reasons = c.reasons.filter((x) => !coveredReason(question, c.reasons, question.reasons.find((y) => y.key === x)!));
  });
}

export const resetReason = () => updateEntry((entry) => { entry.reasonOverride = null; });

export function toggleStaff(name: string) {
  const audit = currentAudit();
  if (!audit) return;
  commitAudit(audit.id, (a) => {
    const list = repeatStaff(a);
    a.general.repeatStaff = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
  });
}

export function addStaff(raw: string) {
  const audit = currentAudit();
  const name = raw.trim();
  if (!audit || !name) return;
  commitAudit(audit.id, (a) => {
    const list = repeatStaff(a);
    if (!list.includes(name)) a.general.repeatStaff = [...list, name];
  });
}

export function addRec() {
  const audit = currentAudit();
  if (audit) commitAudit(audit.id, (a) => { a.general.recommendations.push({ title: '', text: '' }); });
}

export function removeRec(i: number) {
  const audit = currentAudit();
  if (audit) commitAudit(audit.id, (a) => { a.general.recommendations.splice(i, 1); });
}

export async function downloadPdf() {
  const audit = currentAudit();
  if (!audit) return;
  download((await buildPdf(audit)).output('blob'), pdfFileName(audit));
}

export async function printPdf() {
  const audit = currentAudit();
  if (!audit) return;
  const doc = await buildPdf(audit, { autoPrint: true });
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}

export function openPdf() {
  const url = useUi.getState().pdfUrl;
  if (url) window.open(url, '_blank');
}

export async function deleteAudit(id: string) {
  if (completingOrDeleting()) return;
  const a = findAudit(id);
  if (!a) return;
  useProgress.setState({ deleting: true });
  const profile = useSession.getState().profile!;
  try {
    const records = await api.listCompletions(a.payStart);
    const record = records.find((r) => completionMatchesAudit(r, a, profile.id));
    if (record && !canReopenCompletion(record, profile)) {
      throw new Error('Ask an admin to undo this audit’s completion before deleting it. Only admins can undo audit progress.');
    }
    if (!(await askConfirm(`${record ? 'Doing this will remove all progress data, as well as employee and site data.' : ''}This can’t be undone.`, { title: `Delete the ${a.site.name} audit (${payPeriod(a)})?`, confirmLabel: 'Delete audit', danger: true }))) return;
    if (record) await removeCompletion(record, () => persist());
    const previous = useAudits.getState().audits;
    useAudits.setState({ audits: previous.filter((x) => x.id !== id) });
    if (!saveNow()) {
      useAudits.setState({ audits: previous });
      throw new Error('Couldn’t save the deletion in this browser.');
    }
    services.auditSync?.remove(id);
    persist();
    await loadCompletions(a.payStart);
  } catch (err) {
    void showAlert((err as Error).message, { title: 'The audit wasn’t deleted' });
  } finally {
    useProgress.setState({ deleting: false });
  }
}

export function download(blob: Blob, filename: string) {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function exportAudit(id: string) {
  const a = findAudit(id);
  if (!a) return;
  download(new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }), pdfFileName(a).replace(/\.pdf$/, ' backup.json'));
}

export function setAuditField(field: 'auditor' | 'auditDate', value: string) {
  const audit = currentAudit();
  if (!audit) return;
  if (field === 'auditor') useAudits.setState({ auditor: value.trim() });
  commitAudit(audit.id, (a) => { a[field] = value; });
}

export function setPayStart(value: string) {
  const audit = currentAudit();
  if (!audit) return;
  commitAudit(audit.id, (a) => {
    a.payStart = value;
    if (value) a.payEnd = addDays(value, 13);
  });
}

export function editAudit(recipe: (audit: Audit) => void, value: unknown) {
  if (auditEditingBlocked()) return false;
  const audit = currentAudit();
  if (!audit) return false;
  commitAudit(audit.id, recipe);
  if (useUi.getState().error && value) useUi.setState({ error: '' });
  return true;
}

export function editEntry(recipe: (entry: Entry) => void, value: unknown) {
  const [, , , name, , entryId] = parseRoute();
  return editAudit((audit) => {
    const entry = entryIn(audit, name, entryId);
    if (entry) recipe(entry);
  }, value);
}

export function changePayStart(audit: Audit, value: string, takenReason: (audit: Audit, start: string) => string) {
  const status = completionsFor(audit.payStart);
  if (completionOf(audit) || ((status.loading || status.error) && (audit.completionId || audit.completedAt))) return;
  if (value !== audit.payStart && takenReason(audit, value)) {
    showToast(`You can’t move this audit to that pay period: ${takenReason(audit, value)}.`);
    return;
  }
  editAudit((a) => {
    a.payStart = value;
    if (value) a.payEnd = addDays(value, 13);
  }, value);
}

