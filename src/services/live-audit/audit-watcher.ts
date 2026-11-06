import { cancelEvery, every, type Cancel, type Schedule } from '../timers.ts';
import type { ActivityRecord } from '../../types/audit.ts';

export const SITE_BUSY_MESSAGE = 'This site is already being audited';

export interface LeaseTarget {
  homeId: string;
  auditId: string;
  payStart?: string;
}

export interface Lease extends LeaseTarget {
  sessionId: string;
}

interface HeldLease extends Lease {
  expiresAt: string;
}

export type WatcherStatus = 'idle' | 'checking' | 'held' | 'blocked' | 'error';

export interface WatcherApi {
  listAuditActivity(): Promise<ActivityRecord[]>;
  claimAuditSite(lease: Lease): Promise<ActivityRecord | null>;
  renewAuditSite(lease: Lease): Promise<ActivityRecord | null>;
  releaseAuditSite(lease: Lease): Promise<void>;
}

export interface WatcherSnapshot {
  list: ActivityRecord[];
  loaded: boolean;
  status: WatcherStatus;
  error: string;
  target: LeaseTarget | null;
}

export interface AuditWatcher {
  open(next: LeaseTarget): Promise<boolean>;
  close(): Promise<unknown>;
  refresh(): Promise<void>;
  watch(enabled: boolean): void;
  snapshot(): WatcherSnapshot;
  owns(homeId: string, auditId: string, payStart?: string): boolean;
  stop(): Promise<void>;
}

export function createAuditWatcher({ api, onChange = () => {}, onLost = () => {},
  now = Date.now, makeId = () => crypto.randomUUID(),
  schedule = every(5000), cancel = cancelEvery }: {
  api: WatcherApi;
  onChange?: () => void;
  onLost?: () => void;
  now?: () => number;
  makeId?: () => string;
  schedule?: Schedule;
  cancel?: Cancel;
}): AuditWatcher {
  let target: LeaseTarget | null = null;
  let held: HeldLease | null = null;
  let status: WatcherStatus = 'idle';
  let error = '';
  let list: ActivityRecord[] = [];
  let loaded = false;
  let watching = false;
  let stopped = false;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let opening: Promise<boolean> | null = null;
  let refreshing: Promise<void> | null = null;
  let renewedAt = 0;
  const same = (a: LeaseTarget | null, b: LeaseTarget | null) => a?.homeId === b?.homeId && a?.payStart === b?.payStart && a?.auditId === b?.auditId;
  const notify = () => onChange();
  const release = (lease: Lease | null) => lease ? api.releaseAuditSite(lease).catch(() => {}) : Promise.resolve();
  const activeList = () => list.filter((r) => Date.parse(r.expires_at) > now());

  async function refresh() {
    if (stopped || (!watching && !target)) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        if (held && now() - renewedAt >= 20000) {
          const lease = held;
          const record = await api.renewAuditSite(lease);
          if (held === lease) {
            if (!record) {
              held = null;
              status = 'blocked';
              error = SITE_BUSY_MESSAGE;
              onLost();
            } else {
              held.expiresAt = record.expires_at;
              renewedAt = now();
              status = 'held';
            }
          }
        }
        const records = await api.listAuditActivity();
        if (stopped) return;
        const changed = JSON.stringify(list) !== JSON.stringify(records) || !loaded || Boolean(error);
        list = records;
        loaded = true;
        if (status !== 'blocked') error = '';
        if (changed) notify();
      } catch (err) {
        if (stopped) return;
        error = (err as Error).message;
        if (held && Date.parse(held.expiresAt) <= now()) {
          status = 'error';
        }
        notify();
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function open(next: LeaseTarget): Promise<boolean> {
    if (stopped) return Promise.resolve(false);
    if (same(target, next) && (status === 'checking' || (status === 'held' && held && Date.parse(held.expiresAt) > now()))) return opening || Promise.resolve(true);
    const version = ++generation;
    const previous = held;
    held = null;
    target = next;
    status = 'checking';
    error = '';
    const lease: Lease = { ...next, sessionId: makeId() };
    const attempt = queue.then(async () => {
      await release(previous);
      if (stopped || generation !== version) return false;
      try {
        const record = await api.claimAuditSite(lease);
        if (stopped || generation !== version) {
          if (record) await release(lease);
          return false;
        }
        if (!record) {
          status = 'blocked';
          error = SITE_BUSY_MESSAGE;
          notify();
          return false;
        }
        held = { ...lease, expiresAt: record.expires_at };
        renewedAt = now();
        status = 'held';
        list = [...list.filter((r) => r.home_id !== record.home_id || r.pay_period_start !== record.pay_period_start), record];
        notify();
        return true;
      } catch (err) {
        if (generation === version && !stopped) {
          status = 'error';
          error = (err as Error).message;
          notify();
        }
        return false;
      }
    });
    opening = attempt;
    queue = attempt;
    notify();
    return attempt;
  }

  function close() {
    if (!target && !held) return queue;
    ++generation;
    const previous = held;
    held = null;
    target = null;
    status = 'idle';
    error = '';
    queue = queue.then(() => release(previous));
    notify();
    return queue;
  }

  const timer = schedule(() => {
    if (held && status === 'held' && Date.parse(held.expiresAt) <= now()) {
      status = 'error';
      error = 'Couldn’t verify site availability. Please try again.';
      notify();
    }
    void refresh();
  });
  return {
    open, close, refresh,
    watch(enabled) {
      const started = enabled && !watching;
      watching = enabled;
      if (started) void refresh();
    },
    snapshot: () => ({ list: activeList(), loaded, status, error, target }),
    owns: (homeId, auditId, payStart) => status === 'held' && held?.homeId === homeId && held?.auditId === auditId && (payStart === undefined || held?.payStart === payStart) && Date.parse(held.expiresAt) > now(),
    async stop() {
      stopped = true;
      cancel(timer);
      await close();
    },
  };
}
