import type { AuditWatcher } from '../../services/live-audit/audit-watcher.ts';
import type { LivePublisher, LiveViewer } from '../../services/live-audit/live-audit.ts';
import type { SessionGuard } from '../../services/session/guard.ts';
import type { IdleSession, TabCoordinator } from '../../services/session/lifecycle.ts';
import type { SessionMonitor } from '../../services/session/monitor.ts';
import type { AuditSync } from '../../services/sync/audit-sync.ts';

type Interval = ReturnType<typeof setInterval>;
type Timeout = ReturnType<typeof setTimeout>;

export const services = {
  tabCoordinator: null as TabCoordinator | null,
  idleSession: null as IdleSession | null,
  sessionGuard: null as SessionGuard | null,
  auditWatcher: null as AuditWatcher | null,
  auditSync: null as AuditSync | null,
  sessionMonitor: null as SessionMonitor | null,
  livePublisher: null as LivePublisher | null,
  liveViewer: null as LiveViewer | null,
  sessionEnding: Promise.resolve() as Promise<unknown>,
  lastActivitySignal: 0,
};

export const timers = {
  progress: null as Interval | null,
  hub: null as Interval | null,
  staff: null as Interval | null,
  others: null as Interval | null,
  sessions: null as Interval | null,
  save: undefined as Timeout | undefined,
  toast: undefined as Timeout | undefined,
  theme: undefined as Timeout | undefined,
};

export function clearInterval_(key: 'progress' | 'hub' | 'staff' | 'others' | 'sessions') {
  if (timers[key]) clearInterval(timers[key]);
  timers[key] = null;
}

export const defer = (fn: () => unknown) => queueMicrotask(() => { void fn(); });
