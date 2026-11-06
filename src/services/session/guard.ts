import type { Profile } from '../../types/audit.ts';

import { cancelEvery, every, type Cancel, type Schedule } from '../timers.ts';

export interface SessionGuard {
  verify(force?: boolean): Promise<boolean>;
  stop(): void;
}

export function createSessionGuard({ check, onValid, onInvalid, now = Date.now,
  schedule = every(30000), cancel = cancelEvery }: {
  check: () => Promise<Profile | null>;
  onValid: (profile: Profile) => void;
  onInvalid: () => void;
  now?: () => number;
  schedule?: Schedule;
  cancel?: Cancel;
}): SessionGuard {
  let stopped = false;
  let verifiedAt = now();
  let pending: Promise<boolean> | null = null;
  async function verify(force = false): Promise<boolean> {
    if (stopped) return false;
    if (pending) return pending;
    if (!force && now() - verifiedAt < 30000) return true;
    pending = (async () => {
      try {
        const profile = await check();
        if (stopped) return false;
        if (!profile?.active) throw new Error('Your account is no longer available. Please sign in again.');
        verifiedAt = now();
        onValid(profile);
        return true;
      } catch {
        if (!stopped) {
          stopped = true;
          cancel(timer);
          onInvalid();
        }
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  const timer = schedule(() => { void verify(true); });
  return { verify, stop() { stopped = true; cancel(timer); } };
}
