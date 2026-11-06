import { SITE_BUSY_MESSAGE } from '../../services/live-audit/audit-watcher.ts';
import { auditPosition } from '../../services/live-audit/live-audit.ts';
import { save } from '../../services/persistence/store.ts';
import { useAudits, useProgress, useSession, useStatus, useUi } from '../store/stores.ts';
import { completionOf } from '../../features/progress/progress.ts';
import { parseRoute, partsOf } from '../navigation/route.ts';
import { askConfirm, showAlert } from '../../components/dialog/dialog.ts';
import { allSites } from './people.ts';
import { services, timers } from './services.ts';
import { setSaveState, showToast } from './feedback.ts';
import type { Audit, LivePosition } from '../../types/audit.ts';

export const findAudit = (id: string | undefined) => useAudits.getState().audits.find((a) => a.id === id);

export const liveState = () => services.liveViewer?.state || null;

export const isLiveAudit = (audit: Audit | null | undefined) => Boolean(audit) && liveState()?.live?.audit === audit;

export const livePosition = (): LivePosition => liveState()?.live?.position || {};

export const findAnyAudit = (id: string | undefined) => findAudit(id) || (liveState()?.auditId === id ? liveState()?.live?.audit || null : null);

export function currentAudit() {
  const [a, id] = parseRoute();
  return a === 'a' ? findAnyAudit(id) || null : null;
}

export const needsReservation = (audit: Audit | null | undefined): audit is Audit => Boolean(audit && !isLiveAudit(audit) && allSites().some((h) => h.id === audit.siteId) && !completionOf(audit));

export const LIVE_VIEW_ACTIONS = ['openPdf', 'printPdf', 'downloadPdf', 'toggleProgress', 'progressPeriod', 'refreshActivity', 'retryActivity'];

export function syncLiveAudit() {
  if (!useSession.getState().profile) return;
  const parts = parseRoute();
  const [area, id] = parts;
  const viewer = services.liveViewer;
  if (viewer?.state && (area !== 'a' || id !== viewer.state.auditId || findAudit(id))) {
    void viewer.close();
    publishViewer();
  }
  const publisher = services.livePublisher;
  if (!publisher) return;
  const audit = area === 'a' ? findAudit(id) : null;
  if (audit && needsReservation(audit)) {
    if (services.auditWatcher?.owns(audit.siteId, audit.id)) publisher.publish(audit, audit.siteId, auditPosition(parts));
  } else if (publisher.auditId) {
    void publisher.stop();
  }
  useStatus.setState({ publishingAuditId: publisher.auditId });
}

export function publishViewer() {
  useStatus.setState((s) => ({ viewer: services.liveViewer?.state ? { ...services.liveViewer.state } : null, viewerVersion: s.viewerVersion + 1 }));
}

export function syncAuditWatcher() {
  const watcher = services.auditWatcher;
  if (!watcher || useUi.getState().pickingSite) return;
  watcher.watch(parseRoute()[0] === 'new');
  const audit = currentAudit();
  const target = watcher.snapshot().target;
  if (needsReservation(audit)) {
    if (target?.homeId !== audit.siteId || target?.auditId !== audit.id || target?.payStart !== audit.payStart) {
      void watcher.open({ homeId: audit.siteId, auditId: audit.id, payStart: audit.payStart });
    }
  } else {
    void watcher.close();
  }
}

export function syncRouteServices() {
  syncAuditWatcher();
  syncLiveAudit();
}

export function auditEditingBlocked() {
  const audit = currentAudit();
  if (isLiveAudit(audit)) {
    showToast(`You’re viewing ${liveState()!.live!.ownerName}’s audit. Only they can change it.`);
    return true;
  }
  const watcher = services.auditWatcher;
  if (!watcher || !needsReservation(audit) || watcher.owns(audit.siteId, audit.id, audit.payStart)) return false;
  showToast(watcher.snapshot().status === 'blocked' ? SITE_BUSY_MESSAGE : 'Checking site availability. Please try again.');
  useStatus.setState({ watcher: watcher.snapshot() });
  return true;
}

export function saveNow() {
  const profile = useSession.getState().profile;
  if (!profile) return false;
  const { audits, auditor } = useAudits.getState();
  return save({ audits, auditor }, profile.id);
}

export function persist(auditId?: string, savedMsg = 'All changes saved') {
  if (!useSession.getState().profile) return;
  const audit = auditId ? findAudit(auditId) : null;
  if (auditId && !audit) return;
  if (audit && services.livePublisher?.auditId === audit.id) syncLiveAudit();
  clearTimeout(timers.save);
  setSaveState('Saving…');
  timers.save = setTimeout(() => {
    setSaveState(saveNow() ? savedMsg : 'Couldn’t save in this browser');
    const latest = auditId ? findAudit(auditId) : null;
    if (latest) services.auditSync?.queue(latest);
  }, 300);
}

export function commitAudit(id: string, recipe: (audit: Audit) => void, savedMsg?: string) {
  const audit = findAudit(id);
  if (!audit || !useSession.getState().profile || isLiveAudit(audit)) return null;
  const next = structuredClone(audit);
  recipe(next);
  next.updatedAt = Date.now();
  useAudits.setState((s) => ({ audits: s.audits.map((a) => (a.id === id ? next : a)) }));
  persist(id, savedMsg);
  return next;
}

export function auditHasWork(audit: Audit | null | undefined) {
  if (!audit || audit.completionId || audit.completedAt) return Boolean(audit);
  const individualWork = Object.values(audit.individuals || {}).some((person) =>
    Boolean(person?.adequate || person?.notes?.trim() || person?.entries?.length));
  const general = audit.general || ({} as Audit['general']);
  const generalWork = Boolean(
    general.notes?.trim() || general.closing?.trim() || Array.isArray(general.repeatStaff)
    || (general.recommendations || []).some((item) => item.title?.trim() || item.text?.trim())
  );
  return individualWork || generalWork;
}

export function auditFromHash(hash: string | null) {
  const [area, id] = partsOf(String(hash || ''));
  return area === 'a' ? findAudit(id) || null : null;
}

export function discardEmptyAudit(audit: Audit) {
  const previous = useAudits.getState().audits;
  useAudits.setState({ audits: previous.filter((item) => item.id !== audit.id) });
  if (!saveNow()) {
    useAudits.setState({ audits: previous });
    void showAlert('The empty audit couldn’t be deleted from this browser. Please try again.', { title: 'Couldn’t delete the audit' });
    return false;
  }
  services.auditSync?.remove(audit.id);
  void services.auditWatcher?.close();
  return true;
}

export async function confirmDiscardEmptyAudit(audit: Audit | null) {
  if (!audit || auditHasWork(audit)) return true;
  const leave = await askConfirm(`No shifts or individual results have been added to the ${audit.site.name} audit, so it will be deleted if you leave.`, { title: 'Leave this empty audit?', confirmLabel: 'Leave and delete', cancelLabel: 'Stay', danger: true });
  if (!leave || findAudit(audit.id) !== audit || auditHasWork(audit)) return false;
  return discardEmptyAudit(audit);
}

export const completingOrDeleting = () => {
  const p = useProgress.getState();
  return p.completing || p.deleting;
};

export function ensureIndividual(auditId: string, name: string) {
  const audit = findAudit(auditId);
  if (!audit || isLiveAudit(audit) || Object.hasOwn(audit.individuals, name)) return;
  const next = structuredClone(audit);
  Object.defineProperty(next.individuals, name, { value: { notes: '', entries: [] }, writable: true, enumerable: true, configurable: true });
  useAudits.setState((s) => ({ audits: s.audits.map((a) => (a.id === auditId ? next : a)) }));
}
