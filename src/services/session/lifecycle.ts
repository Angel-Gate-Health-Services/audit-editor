import { cancelEvery, every, type Cancel, type Schedule } from '../timers.ts';

export const IDLE_BEFORE_WARNING_MS = 240000;
export const LOGOUT_WARNING_MS = 60000;

const TABS_KEY = 'aghs-active-tabs:v1';
const TAB_ID_KEY = 'aghs-tab-id:v1';
const ACTIVITY_KEY = 'aghs-session-activity:v1';
const TAB_STALE_MS = 300000;

interface TabRecord {
  pageId?: string;
  userId?: string | null;
  status?: string;
  seenAt?: number;
}

type Records = Record<string, TabRecord>;

interface TabMessage {
  type?: string;
  requestId?: string;
  userId?: string;
}

interface Channel {
  postMessage(message: TabMessage): void;
  onmessage: ((event: { data: TabMessage }) => void) | null;
  close?(): void;
}

const parseJson = <T,>(value: string | null, fallback: T): T => {
  try { return (JSON.parse(value as string) as T) || fallback; } catch { return fallback; }
};

const randomId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export interface TabCoordinator {
  hasResumeCandidate(): boolean;
  mayResume(waitMs?: number): Promise<boolean>;
  setUser(nextUserId: string | null): void;
  isLastTab(): boolean;
  reopen(): void;
  close(): void;
}

export function createTabCoordinator({
  sharedStorage = globalThis.localStorage,
  tabStorage = globalThis.sessionStorage,
  now = Date.now,
  makeId = randomId,
  navigationType = (globalThis.performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined)?.type || 'navigate',
  channelFactory = globalThis.BroadcastChannel ? (name: string) => new BroadcastChannel(name) as unknown as Channel : null,
  schedule = every(10000),
  cancel = cancelEvery,
}: {
  sharedStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  tabStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
  makeId?: () => string;
  navigationType?: string;
  channelFactory?: ((name: string) => Channel) | null;
  schedule?: Schedule;
  cancel?: Cancel;
} = {}): TabCoordinator {
  let tabId = tabStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = makeId();
    tabStorage.setItem(TAB_ID_KEY, tabId);
  }
  const ownTab = tabId;
  const pageId = makeId();
  let stopped = false;

  const read = () => parseJson<Records>(sharedStorage.getItem(TABS_KEY), {});
  const live = (record: TabRecord | undefined) => record?.status === 'open' && now() - Number(record.seenAt || 0) < TAB_STALE_MS;
  const write = (records: Records) => sharedStorage.setItem(TABS_KEY, JSON.stringify(records));
  const initial = read();
  const own = initial[ownTab];
  const authenticatedOther = Object.entries(initial).some(([id, record]) => id !== ownTab && live(record) && record.userId);
  const sameTabReload = navigationType === 'reload' && own?.userId;
  const resumeCandidate = Boolean(authenticatedOther || (live(own) && own.userId) || sameTabReload);
  const resumeUserId = resumeCandidate ? own?.userId || Object.values(initial).find((record) => live(record) && record.userId)?.userId || null : null;
  let userId: string | null = null;
  const pendingPings = new Map<string, (userId: string) => void>();
  const channel = channelFactory?.('aghs-session-tabs:v1') || null;

  function update(patch: TabRecord = {}) {
    if (stopped) return;
    const records = read();
    records[ownTab] = { pageId, userId, status: 'open', seenAt: now(), ...patch };
    for (const [id, record] of Object.entries(records)) {
      if (id !== ownTab && now() - Number(record.seenAt || 0) >= TAB_STALE_MS) delete records[id];
    }
    write(records);
  }

  update();
  let timer = schedule(() => update());
  if (channel) channel.onmessage = ({ data }) => {
    if (data?.type === 'ping' && !stopped && userId) {
      channel.postMessage({ type: 'pong', requestId: data.requestId, userId });
    } else if (data?.type === 'pong' && data.userId) {
      pendingPings.get(data.requestId as string)?.(data.userId);
    }
  };

  return {
    hasResumeCandidate: () => resumeCandidate,
    async mayResume(waitMs = 500) {
      if (!resumeCandidate) return false;
      if (sameTabReload || !channel) return true;
      const requestId = makeId();
      const response = new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => {
          pendingPings.delete(requestId);
          resolve(null);
        }, waitMs);
        pendingPings.set(requestId, (nextUserId) => {
          clearTimeout(timeout);
          pendingPings.delete(requestId);
          resolve(nextUserId);
        });
      });
      channel.postMessage({ type: 'ping', requestId });
      const confirmedUserId = await response;
      if (!confirmedUserId || confirmedUserId !== resumeUserId) return false;
      userId = confirmedUserId;
      update({ userId });
      return true;
    },
    setUser(nextUserId) {
      userId = nextUserId || null;
      update({ userId });
    },
    isLastTab() {
      return !Object.entries(read()).some(([id, record]) => id !== ownTab && live(record));
    },
    reopen() {
      if (!stopped) return;
      stopped = false;
      update();
      timer = schedule(() => update());
    },
    close() {
      if (stopped) return;
      const records = read();
      if (records[ownTab]?.pageId === pageId) {
        records[ownTab] = { ...records[ownTab], status: 'closed', seenAt: now() };
        write(records);
      }
      stopped = true;
      cancel(timer);
    },
  };
}

export function activityStorage(userId: string, storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage) {
  const key = `${ACTIVITY_KEY}:${userId}`;
  return {
    read: () => Number(storage.getItem(key)) || 0,
    write: (value: number) => storage.setItem(key, String(value)),
    key,
  };
}

export const ACTIVITY_KEY_PREFIX = `${ACTIVITY_KEY}:`;

export interface IdleSession {
  activity(): void;
  check(): void;
  stop(): void;
}

export function createIdleSession({
  readActivity,
  writeActivity,
  onWarning,
  onActive,
  onExpire,
  onTick = () => {},
  now = Date.now,
  schedule = every(1000),
  cancel = cancelEvery,
  idleMs = IDLE_BEFORE_WARNING_MS,
  warningMs = LOGOUT_WARNING_MS,
}: {
  readActivity: () => number;
  writeActivity: (value: number) => void;
  onWarning: (seconds: number) => void;
  onActive: () => void;
  onExpire: () => void;
  onTick?: (secondsLeft: number, warning: boolean) => void;
  now?: () => number;
  schedule?: Schedule;
  cancel?: Cancel;
  idleMs?: number;
  warningMs?: number;
}): IdleSession {
  let stopped = false;
  let warning = false;
  let expired = false;

  function activity() {
    if (stopped || expired) return;
    writeActivity(now());
    onTick(Math.ceil((idleMs + warningMs) / 1000), false);
    if (warning) {
      warning = false;
      onActive();
    }
  }

  function tick() {
    if (stopped || expired) return;
    let last = readActivity();
    if (!last) {
      last = now();
      writeActivity(last);
    }
    const elapsed = Math.max(0, now() - last);
    const secondsLeft = Math.max(0, Math.ceil((idleMs + warningMs - elapsed) / 1000));
    onTick(secondsLeft, elapsed >= idleMs);
    if (elapsed >= idleMs + warningMs) {
      expired = true;
      warning = false;
      onActive();
      onExpire();
      return;
    }
    if (elapsed >= idleMs) {
      warning = true;
      onWarning(Math.max(1, Math.ceil((idleMs + warningMs - elapsed) / 1000)));
    } else if (warning) {
      warning = false;
      onActive();
    }
  }

  activity();
  const timer = schedule(tick);
  return {
    activity,
    check: tick,
    stop() {
      stopped = true;
      cancel(timer);
      if (warning) onActive();
    },
  };
}
