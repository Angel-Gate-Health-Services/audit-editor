import { AUDIT_SORTS } from '../../domain/audits/model.ts';
import { useSession, useUi } from '../../app/store/stores.ts';

export const SORT_KEY = () => `aghs-audit-sort:${useSession.getState().profile?.id}`;

export function auditSort() {
  let sort = useUi.getState().auditSort;
  if (!sort) {
    try {
      sort = localStorage.getItem(SORT_KEY()) || 'edited';
    } catch {
      sort = 'edited';
    }
    const resolved = sort;
    queueMicrotask(() => { if (!useUi.getState().auditSort) useUi.setState({ auditSort: resolved }); });
  }
  return AUDIT_SORTS.some(([k]) => k === sort) ? sort : 'edited';
}

export function setAuditSort(value: string) {
  if (!AUDIT_SORTS.some(([k]) => k === value)) return;
  useUi.setState({ auditSort: value });
  try {
    localStorage.setItem(SORT_KEY(), value);
  } catch {
    return;
  }
}
