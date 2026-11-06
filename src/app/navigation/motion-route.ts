export interface MotionRoute {
  area: string;
  depth: number;
  order: number;
  scope?: string;
}

export type MotionDirection = 'none' | 'fade' | 'forward' | 'back' | 'replace';

export const ADMIN_TAB_ORDER = ['sites', 'employees', 'users', 'sessions', 'settings'];
export const ENTRY_STEP_ORDER = ['details', 'progress', 'summary', 'missing', 'review'];

export function motionRoute({ checked, signedIn, parts }: { checked: boolean; signedIn: boolean; parts: string[] }): MotionRoute {
  if (!checked) return { area: 'loading', depth: -2, order: 0 };
  if (!signedIn) return { area: 'auth', depth: -1, order: 0 };
  const [area, id, kind, name, entryKind, entryId, step] = parts;
  if (!area) return { area: 'home', depth: 0, order: 0 };
  if (['audits', 'pay-periods', 'my-audits', 'employees', 'sites', 'settings', 'time', 'shifts'].includes(area) && !id) return { area, depth: 1, order: 0 };
  if (area === 'new') return { area: 'new', depth: 2, order: 0 };
  if (area === 'dashboard') {
    if (id === 'site') return { area: `admin-site:${kind || 'new'}`, depth: 3, order: 0 };
    if (!id) return { area: 'admin', depth: 1, order: 0 };
    return { area: 'admin-tabs', scope: 'admin-tabs', depth: 2, order: Math.max(0, ADMIN_TAB_ORDER.indexOf(id)) };
  }
  if (area !== 'a') return { area: 'other', depth: 1, order: 0 };

  const auditScope = `audit:${id}`;
  if (!kind || ['setup', 'general', 'pdf'].includes(kind)) {
    const order = kind === 'setup' ? 0 : !kind ? 1 : kind === 'general' ? 2 : 3;
    return { area: `${auditScope}:tab`, scope: `${auditScope}:tabs`, depth: 2, order };
  }
  if (kind === 'i' && entryKind === 'e') {
    const order = Math.max(0, ENTRY_STEP_ORDER.indexOf(step));
    return { area: `${auditScope}:entry:${entryId}`, scope: `${auditScope}:entry:${entryId}`, depth: 4, order };
  }
  if (kind === 'i') return { area: `${auditScope}:person:${name}`, depth: 3, order: 0 };
  return { area: auditScope, depth: 2, order: 0 };
}

export function motionDirection(previous: MotionRoute | null, next: MotionRoute): MotionDirection {
  if (!previous || previous.area === 'loading') return 'none';
  if (previous.area === 'auth' || next.area === 'auth') return 'fade';
  if (previous.scope && previous.scope === next.scope && previous.order !== next.order) {
    return next.order > previous.order ? 'forward' : 'back';
  }
  if (next.depth !== previous.depth) return next.depth > previous.depth ? 'forward' : 'back';
  if (next.area === 'home') return 'back';
  if (previous.area === 'home') return 'forward';
  return 'replace';
}

export function sameAuditShell(previousParts: string[] | null, parts: string[]) {
  const [area, id, kind] = parts;
  const hasShell = area === 'a' && (!kind || ['setup', 'general', 'pdf'].includes(kind));
  if (!hasShell || !previousParts) return false;
  const [pArea, pId, pKind] = previousParts;
  return pArea === 'a' && pId === id && (!pKind || ['setup', 'general', 'pdf'].includes(pKind));
}
