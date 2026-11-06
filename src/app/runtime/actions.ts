import { useSession } from '../store/stores.ts';
import { LIVE_VIEW_ACTIONS, auditEditingBlocked, currentAudit, isLiveAudit } from './audit-access.ts';
import { services } from './services.ts';

const ALWAYS_ALLOWED = ['retryActivity', 'refreshActivity', 'toggleProgress', 'progressPeriod'];

export async function runAction(name: string, fn: () => unknown) {
  const gen = useSession.getState().generation;
  if (services.sessionGuard && !await services.sessionGuard.verify()) return;
  if (gen !== useSession.getState().generation) return;
  const viewOnly = isLiveAudit(currentAudit()) ? LIVE_VIEW_ACTIONS : ALWAYS_ALLOWED;
  if (!viewOnly.includes(name) && auditEditingBlocked()) return;
  return fn();
}

export function action<A extends unknown[]>(name: string, fn: (...args: A) => unknown) {
  return (...args: A) => { void runAction(name, () => fn(...args)); };
}
