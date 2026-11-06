import * as api from '../../services/api/api.ts';
import { currentPayPeriod, payPeriodAt } from '../../domain/audits/model.ts';
import { canReopenCompletion } from '../../domain/audits/progress.ts';
import { askConfirm } from '../../components/dialog/dialog.ts';
import { useProgress, useSession } from '../../app/store/stores.ts';
import { allSites, isAdmin } from '../../app/runtime/people.ts';
import { completingOrDeleting, persist } from '../../app/runtime/audit-access.ts';
import { go } from '../../app/navigation/navigator.ts';
import { cacheCompletion, loadCompletions, removeCompletion, viewedPayPeriod } from './progress.ts';

export const refreshProgress = () => loadCompletions(viewedPayPeriod().start);

export async function reopenHome(id: string, period: string) {
  if (completingOrDeleting()) return;
  const record = useProgress.getState().completions[period]?.list?.find((r) => r.id === id);
  if (!record || !canReopenCompletion(record, useSession.getState().profile)) return;
  const home = allSites().find((h) => h.id === record.home_id);
  if (!(await askConfirm('It will stop counting toward this pay period’s progress until it’s marked complete again.', { title: `Reopen the ${home?.name || 'site'} audit?`, confirmLabel: 'Reopen' }))) return;
  useProgress.setState({ completing: true, completeMsg: null });
  try {
    await removeCompletion(record, () => persist());
    useProgress.setState({ completeMsg: { ok: true, text: 'Audit reopened.' } });
  } catch (err) {
    useProgress.setState({ completeMsg: { ok: false, text: (err as Error).message } });
  }
  useProgress.setState({ completing: false });
  void loadCompletions(period);
}

export async function adminCompleteHome(id: string, period: string) {
  if (completingOrDeleting() || !isAdmin()) return;
  const home = allSites().find((h) => h.id === id);
  if (!home || useProgress.getState().completions[period]?.list?.some((r) => r.home_id === id)) return;
  if (!(await askConfirm('It will count toward everyone’s progress for this pay period.', { title: `Mark ${home.name} as audited?`, confirmLabel: 'Mark complete' }))) return;
  useProgress.setState({ completing: true, completeMsg: null });
  try {
    cacheCompletion(period, await api.markAuditComplete(period, id, crypto.randomUUID()));
    useProgress.setState({ completeMsg: { ok: true, text: `${home.name} is marked as audited.` } });
  } catch (err) {
    useProgress.setState({ completeMsg: { ok: false, text: (err as Error).message } });
  }
  useProgress.setState({ completing: false });
  void loadCompletions(period);
}

export function openPeriodInAudits(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > currentPayPeriod().index) return;
  useProgress.setState({ progressPeriod: index });
  go('audits');
}

export function showPeriod(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > currentPayPeriod().index) return;
  useProgress.setState({ progressPeriod: index, completeMsg: null });
  window.scrollTo({ top: 0 });
}

export function stepPeriod(dir: number, picking: boolean) {
  if (picking) return false;
  const step = Math.sign(dir);
  const from = viewedPayPeriod();
  const next = payPeriodAt(Math.max(0, Math.min(currentPayPeriod().index, from.index + step)));
  if (!step || next.index === from.index) return false;
  useProgress.setState({ progressPeriod: next.index, progressSlide: step, completeMsg: null });
  return true;
}

export const toggleProgress = () => useProgress.setState((s) => ({ progressOpen: !s.progressOpen }));
