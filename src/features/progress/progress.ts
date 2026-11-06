import * as api from '../../services/api/api.ts';
import { canCompleteAudit, currentPayPeriod, lastPayPeriod, payPeriodAt, payPeriodIndexFor, remainingIndividuals } from '../../domain/audits/model.ts';
import { canReopenCompletion, completionMatchesAudit } from '../../domain/audits/progress.ts';
import { useAudits, useData, useProgress, useSession, type CompletionState } from '../../app/store/stores.ts';
import { allSites, generation } from '../../app/runtime/people.ts';
import { reducedMotion } from '../../app/runtime/feedback.ts';
import { defer } from '../../app/runtime/services.ts';
import type confettiFn from 'canvas-confetti';
import type { Audit, Completion, Home, PayPeriod } from '../../types/audit.ts';

const requests = new Map<string, Promise<void>>();

const blank = (): CompletionState => ({ list: null, loadedAt: 0, loading: false, error: '', version: 0 });

function setCompletion(start: string, patch: Partial<CompletionState>) {
  useProgress.setState((s) => ({ completions: { ...s.completions, [start]: { ...(s.completions[start] || blank()), ...patch } } }));
}

export function completionsFor(payStart: string): CompletionState | { list: null; loading?: boolean; error?: string } {
  const c = useProgress.getState().completions[payStart];
  if (!c || (!c.loading && Date.now() - c.loadedAt > 30000)) defer(() => loadCompletions(payStart));
  return c || { list: null };
}

export function loadCompletions(payStart: string): Promise<void> {
  const existing = useProgress.getState().completions[payStart];
  if (existing?.loading) return requests.get(payStart) || Promise.resolve();
  const gen = generation();
  const version = existing?.version || 0;
  setCompletion(payStart, { loading: true });
  const request = (async () => {
    let patch: Partial<CompletionState> = {};
    try {
      const list = await api.listCompletions(payStart);
      if (gen === generation() && (useProgress.getState().completions[payStart]?.version || 0) === version) patch = { list, error: '' };
    } catch (err) {
      const message = (err as Error).message;
      if (gen === generation() && (useProgress.getState().completions[payStart]?.version || 0) === version) {
        patch = { error: /could not find the table|does not exist/i.test(message) ? 'missing-table' : message };
      }
    }
    if (gen === generation()) setCompletion(payStart, { ...patch, loading: false, loadedAt: Date.now() });
    requests.delete(payStart);
  })();
  requests.set(payStart, request);
  return request;
}

export const homeCompletionOf = (audit: Audit) => completionsFor(audit.payStart).list?.find((r) => r.home_id === audit.siteId) || null;

export const completionOf = (audit: Audit) => {
  const rec = homeCompletionOf(audit);
  return completionMatchesAudit(rec, audit, useSession.getState().profile?.id) ? rec : null;
};

export function cacheCompletion(payStart: string, record: Completion) {
  const c = useProgress.getState().completions[payStart] || blank();
  setCompletion(payStart, {
    version: (c.version || 0) + 1,
    list: [...(c.list || []).filter((r) => r.home_id !== record.home_id), record],
    loadedAt: Date.now(),
    error: '',
  });
}

export async function removeCompletion(record: Completion, persist: () => void) {
  const profile = useSession.getState().profile;
  if (!canReopenCompletion(record, profile)) throw new Error('Only admins can undo audit progress.');
  await api.reopenAudit(record.id);
  const c = useProgress.getState().completions[record.pay_period_start];
  if (c) {
    setCompletion(record.pay_period_start, {
      version: (c.version || 0) + 1,
      list: c.list?.filter((r) => r.id !== record.id) || [],
      error: '',
      loadedAt: Date.now(),
    });
  }
  const userId = useSession.getState().profile!.id;
  let changed = false;
  const audits = useAudits.getState().audits.map((audit) => {
    if (!completionMatchesAudit(record, audit, userId)) return audit;
    changed = true;
    const { completedAt: _at, completionId: _id, ...rest } = audit;
    return rest;
  });
  if (changed) useAudits.setState({ audits });
  persist();
}

export function viewedPayPeriod() {
  const latest = currentPayPeriod().index;
  const index = useProgress.getState().progressPeriod ?? latest;
  return payPeriodAt(Math.max(0, Math.min(latest, index)));
}

export function periodTag(period: PayPeriod) {
  if (period.index === currentPayPeriod().index) return 'Current pay period';
  if (period.index === lastPayPeriod().index) return 'Last pay period';
  return '';
}

export interface ProgressState {
  period: PayPeriod;
  homes: Home[];
  doneBy: Map<string, Completion>;
  done: number;
  total: number;
  pct: number;
  complete: boolean;
  loading?: boolean;
}

export function progressState(period = viewedPayPeriod()): ProgressState | { missingTable: true } | { error: string } | null {
  const c = completionsFor(period.start);
  if (c.error === 'missing-table') return { missingTable: true };
  if (c.error) return { error: c.error };
  if (useData.getState().homes === null || c.list === null) return null;
  const homes = allSites();
  const doneBy = new Map(c.list.map((r) => [r.home_id, r]));
  const done = homes.filter((h) => doneBy.has(h.id)).length;
  const total = homes.length;
  const state = { period, homes, doneBy, done, total, pct: total ? Math.round((done / total) * 100) : 0, complete: total > 0 && done === total };
  if (period.index >= lastPayPeriod().index) syncCelebration(period, state.complete);
  return state;
}

export const isReady = (st: ReturnType<typeof progressState>): st is ProgressState => Boolean(st && 'period' in st);

const celebrated: Record<string, boolean> = {};

export function syncCelebration(period: PayPeriod, complete: boolean) {
  const key = `aghs-celebrated:${useSession.getState().profile?.id}:${period.start}`;
  if (!complete) {
    try { localStorage.removeItem(key); } catch { delete celebrated[period.start]; }
    delete celebrated[period.start];
    return;
  }
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    if (celebrated[period.start]) return;
  }
  celebrated[period.start] = true;
  setTimeout(() => { void launchConfetti(); }, 250);
}

let confettiLoad: Promise<typeof confettiFn> | null = null;

export async function launchConfetti() {
  if (reducedMotion()) return;
  confettiLoad ||= import('canvas-confetti').then((m) => m.default);
  try {
    const confetti = await confettiLoad;
    const colors = ['#4aacf7', '#e3413f', '#2da44e', '#ffffff', '#f2cc60'];
    const burst = (x: number, angle: number) => confetti({ particleCount: 90, spread: 70, startVelocity: 55, angle, origin: { x, y: 0.7 }, colors, zIndex: 200 });
    void burst(0.15, 60);
    void burst(0.85, 120);
    setTimeout(() => { void confetti({ particleCount: 140, spread: 120, startVelocity: 40, origin: { x: 0.5, y: 0.35 }, colors, zIndex: 200, scalar: 1.1 }); }, 350);
  } catch {
    confettiLoad = null;
  }
}

export const periodNumber = (start: string) => payPeriodAt(payPeriodIndexFor(start)).number;

export function completionReadiness(audit: Audit, name: string | null) {
  const left = remainingIndividuals(audit);
  const othersLeft = name ? left.filter((n) => n !== name) : left;
  const ready = name ? othersLeft.length === 0 : canCompleteAudit(audit);
  return { left, ready };
}

export const progressGeneration = generation;
