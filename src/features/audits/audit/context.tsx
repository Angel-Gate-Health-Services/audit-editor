import { createContext, useContext } from 'react';
import { LIVE_VIEW_ACTIONS } from '../../../app/runtime/audit-access.ts';
import type { Audit } from '../../../types/audit.ts';

export interface AuditContextValue {
  audit: Audit;
  live: boolean;
}

export const AuditContext = createContext<AuditContextValue | null>(null);

export function useAuditContext() {
  const value = useContext(AuditContext);
  if (!value) throw new Error('Audit context missing');
  return value;
}

export function useLock() {
  const { live } = useAuditContext();
  return (actionName?: string) => (live && (!actionName || !LIVE_VIEW_ACTIONS.includes(actionName))
    ? { disabled: true, 'aria-disabled': true as const, title: 'View only' }
    : {});
}

export function useInputLock() {
  const { live } = useAuditContext();
  return live;
}
