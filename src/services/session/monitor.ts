import { cancelEvery, every, type Cancel, type Schedule } from '../timers.ts';

const STORAGE_KEY = 'aghs-session-monitor';
export const PING_MS = 30000;

export interface MonitorApi {
  pingTrackedSession(id: string): Promise<boolean>;
  startTrackedSession(): Promise<string>;
  endTrackedSession(id: string): Promise<unknown>;
}

function tabStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export interface SessionMonitor {
  stop(options?: { signedOut?: boolean }): Promise<void>;
}

export function createSessionMonitor({ api, userId, storage = tabStorage(), onSignedOut = () => {},
  schedule = every(PING_MS), cancel = cancelEvery }: {
  api: MonitorApi;
  userId: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  onSignedOut?: () => void;
  schedule?: Schedule;
  cancel?: Cancel;
}): SessionMonitor {
  let stopped = false;
  let pending: Promise<void> | null = null;
  let id: string | null = null;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') as { userId?: string; id?: string } | null;
    if (saved?.userId === userId) id = saved.id || null;
  } catch {
    id = null;
  }
  const remember = () => {
    try {
      if (id) storage?.setItem(STORAGE_KEY, JSON.stringify({ userId, id }));
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      return;
    }
  };

  function beat() {
    if (stopped || pending) return pending;
    pending = (async () => {
      try {
        if (id && await api.pingTrackedSession(id)) return;
        if (stopped) return;
        const next = await api.startTrackedSession();
        if (stopped) {
          await api.endTrackedSession(next).catch(() => {});
          return;
        }
        id = next;
        remember();
      } catch (err) {
        if ((err as { signedOut?: boolean })?.signedOut && !stopped) {
          stopped = true;
          cancel(timer);
          id = null;
          remember();
          onSignedOut();
        }
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  void beat();
  const timer = schedule(beat);

  return {
    async stop({ signedOut = true } = {}) {
      if (stopped) return;
      stopped = true;
      cancel(timer);
      await pending;
      const ending = id;
      if (signedOut) {
        id = null;
        remember();
      }
      if (signedOut && ending) {
        await Promise.race([api.endTrackedSession(ending).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      }
    },
  };
}

export function fmtDuration(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'Under a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function describeDevice(ua = '') {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari'
            : 'Browser';
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
            : /CrOS/.test(ua) ? 'ChromeOS'
              : /Linux/.test(ua) ? 'Linux'
                : 'unknown system';
  return `${browser} on ${os}`;
}
