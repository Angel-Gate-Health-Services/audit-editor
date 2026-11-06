import { cancelDelay, cancelEvery, delayBy, type Cancel, type Delay, type Schedule, type ScheduleEvery, type TimerHandle } from '../timers.ts';
import type { Audit, AuditViewer, LiveAudit, LivePosition } from '../../types/audit.ts';

export const VIEWER_FRESH_MS = 45000;

export interface LivePublishPayload {
  auditId: string;
  homeId: string;
  data: Audit;
  position: LivePosition;
}

export interface PublisherApi {
  listAuditViewers(auditId: string): Promise<AuditViewer[]>;
  publishLiveAudit(payload: LivePublishPayload): Promise<void>;
  removeLiveAudit(auditId: string): Promise<void>;
}

export interface LivePublisher {
  publish(audit: Audit, homeId: string, position?: LivePosition): void;
  stop(): Promise<unknown>;
  close(): Promise<unknown>;
  readonly auditId: string | null;
  readonly viewers: AuditViewer[];
}

export function createLivePublisher({ api, onViewers = () => {}, now = Date.now,
  delay = delayBy, clear = cancelDelay,
  schedule = (fn: () => void) => setInterval(fn, 10000), cancel = cancelEvery }: {
  api: PublisherApi;
  onViewers?: (list: AuditViewer[]) => void;
  now?: () => number;
  delay?: Delay;
  clear?: Cancel;
  schedule?: Schedule;
  cancel?: Cancel;
}): LivePublisher {
  let current: { auditId: string; homeId: string } | null = null;
  let pending: LivePublishPayload | null = null;
  let lastSent = '';
  let timer: TimerHandle = null;
  let viewers: AuditViewer[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const viewerTimer = schedule(() => { void checkViewers(); });

  const setViewers = (list: AuditViewer[]) => {
    const next = list.filter((v) => now() - Date.parse(v.seen_at) < VIEWER_FRESH_MS);
    if (JSON.stringify(next) === JSON.stringify(viewers)) return;
    viewers = next;
    onViewers(viewers);
  };

  async function checkViewers() {
    const target = current;
    if (!target) return;
    try {
      const list = await api.listAuditViewers(target.auditId);
      if (current === target) setViewers(list);
    } catch {
      return;
    }
  }

  function send() {
    timer = null;
    const next = pending;
    pending = null;
    if (!next || !current || next.auditId !== current.auditId) return;
    const body = JSON.stringify([next.data, next.position]);
    if (body === lastSent) return;
    queue = queue.then(async () => {
      try {
        await api.publishLiveAudit(next);
        lastSent = body;
      } catch {
        lastSent = '';
      }
    });
  }

  const publisher: LivePublisher = {
    publish(audit, homeId, position = {}) {
      if (current && current.auditId !== audit.id) void publisher.stop();
      if (!current) {
        current = { auditId: audit.id, homeId };
        lastSent = '';
        void checkViewers();
      }
      pending = { auditId: audit.id, homeId, data: audit, position };
      if (!timer) timer = delay(send, lastSent ? 1200 : 0);
    },
    stop() {
      if (timer) clear(timer);
      timer = null;
      pending = null;
      const ending = current;
      current = null;
      lastSent = '';
      setViewers([]);
      if (!ending) return queue;
      queue = queue.then(() => api.removeLiveAudit(ending.auditId).catch(() => {}));
      return queue;
    },
    close() {
      cancel(viewerTimer);
      return publisher.stop();
    },
    get auditId() { return current?.auditId || null; },
    get viewers() { return viewers; },
  };
  return publisher;
}

export type ViewerStatus = 'loading' | 'ready' | 'gone' | 'missing-table' | 'error';

export interface ViewerState {
  auditId: string;
  status: ViewerStatus;
  live: LiveAudit | null;
  error: string;
}

export interface ViewerApi {
  getLiveAudit(auditId: string): Promise<LiveAudit | null>;
  markViewingAudit(auditId: string): Promise<void>;
  stopViewingAudit(auditId: string): Promise<void>;
}

export interface LiveViewer {
  open(auditId: string): ViewerState;
  close(): Promise<unknown>;
  refresh(): Promise<void>;
  readonly state: ViewerState | null;
}

export function createLiveViewer({ api, onChange = () => {},
  schedule = (fn: () => void, ms: number) => setInterval(fn, ms), cancel = cancelEvery }: {
  api: ViewerApi;
  onChange?: (state: ViewerState) => void;
  schedule?: ScheduleEvery;
  cancel?: Cancel;
}): LiveViewer {
  let state: ViewerState | null = null;
  let timers: TimerHandle[] = [];
  let loading: Promise<void> | null = null;

  const stopTimers = () => {
    timers.forEach(cancel);
    timers = [];
  };

  async function load(): Promise<void> {
    const target = state;
    if (!target || loading) return loading || undefined;
    loading = (async () => {
      try {
        const live = await api.getLiveAudit(target.auditId);
        if (state !== target) return;
        const before = JSON.stringify([target.status, target.live]);
        target.status = live ? 'ready' : 'gone';
        target.live = live || target.live;
        target.error = '';
        if (JSON.stringify([target.status, target.live]) !== before) onChange(target);
      } catch (err) {
        if (state !== target) return;
        const message = (err as Error).message;
        target.status = /could not find the table|does not exist/i.test(message) ? 'missing-table' : 'error';
        target.error = message;
        onChange(target);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  const checkIn = () => {
    if (state?.status === 'ready') api.markViewingAudit(state.auditId).catch(() => {});
  };

  const viewer: LiveViewer = {
    open(auditId) {
      if (state?.auditId === auditId) return state;
      void viewer.close();
      state = { auditId, status: 'loading', live: null, error: '' };
      void load().then(checkIn);
      timers = [schedule(() => { void load(); }, 4000), schedule(checkIn, 15000)];
      return state;
    },
    close() {
      stopTimers();
      const leaving = state;
      state = null;
      if (leaving?.status === 'ready') return api.stopViewingAudit(leaving.auditId).catch(() => {});
      return Promise.resolve();
    },
    refresh: () => load(),
    get state() { return state; },
  };
  return viewer;
}

export function auditPosition(parts: string[]): LivePosition {
  const [, , kind, name, e, entryId, step] = parts;
  if (kind === 'i' && name) return { view: e === 'e' ? 'shift' : 'individual', individual: name, entryId: e === 'e' ? entryId || null : null, step: e === 'e' ? step || 'details' : null };
  return { view: kind || 'individuals' };
}
