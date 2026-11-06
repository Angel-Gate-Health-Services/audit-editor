import * as api from '../../services/api/api.ts';
import { SITE_BUSY_MESSAGE, createAuditWatcher } from '../../services/live-audit/audit-watcher.ts';
import { createLivePublisher, createLiveViewer } from '../../services/live-audit/live-audit.ts';
import { createAuditSync } from '../../services/sync/audit-sync.ts';
import { load, save } from '../../services/persistence/store.ts';
import { shiftFindings } from '../../domain/employees/stats.ts';
import { createSessionGuard } from '../../services/session/guard.ts';
import { ACTIVITY_KEY_PREFIX, IDLE_BEFORE_WARNING_MS, LOGOUT_WARNING_MS, activityStorage, createIdleSession, createTabCoordinator } from '../../services/session/lifecycle.ts';
import { createSessionMonitor } from '../../services/session/monitor.ts';
import { useAdmin, useAudits, useSession, useStatus, useUi, resetSessionStores } from '../store/stores.ts';
import { loadCompletions, viewedPayPeriod } from '../../features/progress/progress.ts';
import { parseRoute } from '../navigation/route.ts';
import { navigateHash } from '../navigation/navigator.ts';
import { currentAudit, needsReservation, publishViewer, syncRouteServices } from './audit-access.ts';
import { refreshEmployees, refreshHomes, refreshPhotos } from './people.ts';
import { clearInterval_, services, timers } from './services.ts';
import { setSaveState, showToast } from './feedback.ts';
import type { Profile } from '../../types/audit.ts';

export const SESSION_DURATION_SECONDS = (IDLE_BEFORE_WARNING_MS + LOGOUT_WARNING_MS) / 1000;

export function sessionTimerState(seconds: number, warning = seconds <= LOGOUT_WARNING_MS / 1000) {
  const active = seconds >= SESSION_DURATION_SECONDS;
  const danger = !active && warning;
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return {
    active,
    danger,
    idle: !active && !danger,
    label: active ? 'Session Active' : `${minutes}:${remainder}`,
  };
}

const onTick = (sessionSeconds: number, sessionWarning: boolean) => useStatus.setState({ sessionSeconds, sessionWarning });
const showSessionWarning = (seconds: number) => useStatus.setState({ warningSeconds: seconds });
const hideSessionWarning = () => useStatus.setState({ warningSeconds: null });

function bumpGeneration(profile: Profile | null, checked = true) {
  useSession.setState((s) => ({ checked, profile, generation: s.generation + 1 }));
}

export async function startSession(profile: Profile) {
  services.sessionGuard?.stop();
  services.idleSession?.stop();
  if (services.auditWatcher) await services.auditWatcher.stop();
  bumpGeneration(profile);
  const gen = useSession.getState().generation;
  const current = () => gen === useSession.getState().generation;
  services.tabCoordinator?.setUser(profile.id);
  resetSessionStores();
  const db = load(profile.id);
  useAudits.setState({ audits: db.audits, auditor: db.auditor });
  const userId = profile.id;
  const activity = activityStorage(userId);
  services.idleSession = createIdleSession({
    readActivity: activity.read,
    writeActivity: activity.write,
    onWarning: showSessionWarning,
    onActive: hideSessionWarning,
    onTick,
    onExpire() {
      if (!current() || useSession.getState().profile?.id !== userId) return;
      endSession('You were signed out after 5 minutes of inactivity.');
      void services.sessionEnding.then(() => api.signOut());
    },
  });
  services.sessionGuard = createSessionGuard({ check: api.loadProfile,
    onValid(next) {
      if (!current()) return;
      if (next.id !== userId) throw new Error('Account changed');
      const previous = useSession.getState().profile!;
      const merged = { ...previous, ...next };
      if ((Object.keys(merged) as (keyof Profile)[]).some((key) => merged[key] !== previous[key])) useSession.setState({ profile: merged });
      if (!next.is_admin) useAdmin.setState({ users: null, sessions: null });
    },
    onInvalid() {
      if (!current()) return;
      endSession();
      useUi.setState((s) => ({ login: { ...s.login, error: 'Your session could not be verified. Please sign in again.' } }));
    },
  });
  const watcher = createAuditWatcher({ api,
    onChange() {
      if (services.auditWatcher !== watcher) return;
      useStatus.setState({ watcher: watcher.snapshot() });
    },
    onLost() {
      showToast(SITE_BUSY_MESSAGE);
      useStatus.setState({ instant: true });
      navigateHash('#/new', { replace: true });
    },
  });
  services.auditWatcher = watcher;
  void services.auditSync?.stop();
  services.auditSync = createAuditSync({ api, userId,
    findingsFor: shiftFindings,
    getAudits: () => useAudits.getState().audits,
    setAudits(list) {
      if (!current()) return;
      useAudits.setState({ audits: list });
      save({ audits: list, auditor: useAudits.getState().auditor }, userId);
    },
    onSaved(status) {
      const text = useStatus.getState().saveState;
      if (!current() || text === 'Saving…') return;
      if (status === 'saved' && text) setSaveState('Saved to your account');
      if (status === 'error') setSaveState('Saved in this browser · couldn’t reach your account');
    },
  });
  clearInterval_('progress');
  timers.progress = setInterval(() => {
    if (!current() || !useSession.getState().profile || document.hidden) return;
    const periods = new Set([viewedPayPeriod().start]);
    const audit = currentAudit();
    if (audit?.payStart) periods.add(audit.payStart);
    periods.forEach((start) => { void loadCompletions(start); });
  }, 5000);
  void services.sessionMonitor?.stop({ signedOut: false });
  services.sessionMonitor = createSessionMonitor({ api, userId,
    onSignedOut() {
      if (!current() || useSession.getState().profile?.id !== userId) return;
      endSession('An admin signed you out. Please sign in again.');
      void services.sessionEnding.then(() => api.clearBrowserSession());
    },
  });
  void services.livePublisher?.close();
  services.livePublisher = createLivePublisher({ api,
    onViewers(list) {
      if (!current()) return;
      useUi.setState({ liveViewers: list });
    },
  });
  void services.liveViewer?.close();
  services.liveViewer = createLiveViewer({ api,
    onChange(watching) {
      const [area, id] = parseRoute();
      if (!current() || area !== 'a' || id !== watching.auditId) return;
      publishViewer();
    },
  });
  setSaveState('');
  syncRouteServices();
  await Promise.all([refreshHomes(), refreshEmployees(), refreshPhotos()]);
}

export function endSession(message = '') {
  services.sessionGuard?.stop();
  services.sessionGuard = null;
  services.idleSession?.stop();
  services.idleSession = null;
  hideSessionWarning();
  services.tabCoordinator?.setUser(null);
  clearTimeout(timers.save);
  const { profile } = useSession.getState();
  const previousMessage = profile ? '' : useUi.getState().login.error;
  if (profile) {
    const { audits, auditor } = useAudits.getState();
    save({ audits, auditor }, profile.id);
  }
  const watcher = services.auditWatcher;
  services.auditWatcher = null;
  void watcher?.stop();
  services.sessionEnding = Promise.all([services.sessionMonitor?.stop(), services.livePublisher?.close(), services.liveViewer?.close(), services.auditSync?.stop()]);
  services.auditSync = null;
  services.sessionMonitor = null;
  services.livePublisher = null;
  services.liveViewer = null;
  for (const key of ['sessions', 'others', 'staff', 'hub', 'progress'] as const) clearInterval_(key);
  const pdfUrl = useUi.getState().pdfUrl;
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  useStatus.setState({ instant: true, sessionSeconds: 0, sessionWarning: false });
  bumpGeneration(null);
  resetSessionStores();
  useUi.setState((s) => ({ login: { ...s.login, error: message || previousMessage } }));
  setSaveState('');
  if (location.hash && location.hash !== '#/') {
    navigateHash('#/', { replace: true });
    history.replaceState(null, '', location.pathname + location.search);
  }
}

export async function boot() {
  if (window.self !== window.top) return;
  if (!api.configured) {
    useSession.setState({ checked: false });
    return;
  }
  services.tabCoordinator = createTabCoordinator();
  api.onSignedOut(() => endSession());
  try {
    const canResume = await services.tabCoordinator.mayResume();
    if (!canResume && !services.tabCoordinator.hasResumeCandidate()) await api.clearBrowserSession();
    const existing = canResume ? await api.currentSession() : null;
    if (existing) {
      const profile = await api.loadProfile();
      if (profile) {
        await startSession(profile);
        return;
      }
    }
  } catch (err) {
    useUi.setState((s) => ({ login: { ...s.login, error: (err as Error).message } }));
  }
  useSession.setState({ checked: true });
}

export function noteSessionActivity() {
  if (!services.idleSession || Date.now() - services.lastActivitySignal < 1000) return;
  services.lastActivitySignal = Date.now();
  services.idleSession.activity();
}

export function attachGlobalListeners() {
  const controller = new AbortController();
  const { signal } = controller;
  for (const eventName of ['pointerdown', 'pointermove', 'keydown', 'input', 'scroll', 'touchstart']) {
    window.addEventListener(eventName, noteSessionActivity, { passive: true, signal });
  }
  window.addEventListener('storage', (ev) => {
    if (ev.key?.startsWith(ACTIVITY_KEY_PREFIX)) services.idleSession?.check();
  }, { signal });
  window.addEventListener('beforeunload', (ev) => {
    if (!useSession.getState().profile || !services.tabCoordinator?.isLastTab() || !needsReservation(currentAudit())) return;
    ev.preventDefault();
    ev.returnValue = 'Are you sure you want to close this tab? You’re still auditing a site.';
  }, { signal });
  window.addEventListener('pagehide', () => {
    services.tabCoordinator?.close();
    void services.auditWatcher?.stop();
  }, { signal });
  window.addEventListener('pageshow', (ev) => {
    const profile = useSession.getState().profile;
    if (ev.persisted && profile) {
      services.tabCoordinator?.reopen();
      void startSession(profile);
    }
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    services.idleSession?.check();
    void services.sessionGuard?.verify(true);
    void services.auditWatcher?.refresh();
    void services.auditSync?.pull();
    if (useSession.getState().profile) void loadCompletions(viewedPayPeriod().start);
  }, { signal });
  window.addEventListener('focus', () => {
    services.idleSession?.check();
    void services.sessionGuard?.verify(true);
  }, { signal });
  return () => controller.abort();
}

let booted: Promise<void> | null = null;
let detach: (() => void) | null = null;

export function startRuntime() {
  if (booted) return booted;
  detach = attachGlobalListeners();
  booted = boot();
  return booted;
}

export function stopRuntimeForTests() {
  detach?.();
  detach = null;
  booted = null;
}

export async function signOutNow() {
  endSession();
  await services.sessionEnding;
  await api.signOut();
}
