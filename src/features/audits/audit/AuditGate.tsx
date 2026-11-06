import { useEffect, useMemo, useRef } from 'react';
import { NavigationType, Outlet, useBlocker } from 'react-router';
import { SITE_BUSY_MESSAGE } from '../../../services/live-audit/audit-watcher.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { Breadcrumbs, useTitle } from '../../../components/ui/basics.tsx';
import { useAudits, useData, useSession, useStatus } from '../../../app/store/stores.ts';
import { useRouteParts } from '../../../app/navigation/hooks.ts';
import { partsOf } from '../../../app/navigation/route.ts';
import { navigateHash } from '../../../app/navigation/navigator.ts';
import { action } from '../../../app/runtime/actions.ts';
import { auditHasWork, confirmDiscardEmptyAudit, findAudit, isLiveAudit, needsReservation, publishViewer } from '../../../app/runtime/audit-access.ts';
import { services } from '../../../app/runtime/services.ts';
import { MissingPage } from '../../../app/shell/pages.tsx';
import { useProgressInputs } from '../../progress/ProgressArea.tsx';
import { retryActivity } from '../audit-actions.ts';
import { AuditContext } from './context.tsx';
import type { ViewerState } from '../../../services/live-audit/live-audit.ts';

const retry = action('retryActivity', retryActivity);

function LiveAuditStatus({ watching }: { watching: ViewerState | null }) {
  useTitle(watching && watching.status !== 'loading' ? 'Audit' : 'Loading audit');
  if (!watching || watching.status === 'loading') {
    return <div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Opening this audit…</p></div></div>;
  }
  const message = watching.status === 'missing-table'
    ? <>Watching audits isn’t set up yet. Run <code>supabase/live-audits.sql</code> in the Supabase SQL Editor.</>
    : watching.status === 'error' ? `Couldn’t open this audit. ${watching.error}`
      : 'Nobody is working on this audit right now, so there’s nothing to view. Audits stay in the auditor’s own browser once they leave.';
  return (
    <>
      <Breadcrumbs items={[['Audits', '#/audits'], ['Audit']]} />
      <div className={`flash ${watching.status === 'gone' ? 'flash-warn' : 'flash-error'}`}><Icon name="alert" /><span>{message}</span></div>
      <div className="NavBar"><a className="btn" href="#/new"><Icon name="chevron-left" />Back to sites</a></div>
    </>
  );
}

function Availability({ name }: { name: string }) {
  useTitle(name);
  const homesLoaded = useData((s) => s.homes !== null);
  const activity = useStatus((s) => s.watcher);
  const checking = !homesLoaded || activity?.status === 'checking' || !activity;
  return (
    <>
      <Breadcrumbs items={[['Audits', '#/audits'], [name]]} />
      <div className="flash flash-warn" role="status"><Icon name="alert-circle" /><span>{checking ? 'Checking site availability…' : activity.status === 'blocked' ? SITE_BUSY_MESSAGE : 'Couldn’t verify site availability. Please try again.'}</span></div>
      <div className="NavBar"><a className="btn" href="#/new">Choose a site</a>{checking ? null : <button className="btn btn-primary" onClick={() => retry()}>Retry</button>}</div>
    </>
  );
}

function useEmptyAuditGuard(auditId: string) {
  const attempt = useRef<{ action: NavigationType; to: string } | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) => {
    if (historyAction === NavigationType.Replace || currentLocation.pathname === nextLocation.pathname) return false;
    const [area, id] = partsOf(`#${nextLocation.pathname}`);
    if (area === 'a' && id === auditId) return false;
    const audit = findAudit(auditId);
    const block = Boolean(useSession.getState().profile && audit && !isLiveAudit(audit) && !auditHasWork(audit));
    if (block) attempt.current = { action: historyAction, to: `${nextLocation.pathname}${nextLocation.search}` };
    return block;
  });
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const audit = findAudit(auditId) || null;
    const target = attempt.current;
    void confirmDiscardEmptyAudit(audit).then((leave) => {
      if (blocker.state === 'blocked') blocker.reset();
      if (!leave || !target) return;
      if (target.action === NavigationType.Pop) history.back();
      else navigateHash(`#${target.to}`);
    });
  }, [blocker, auditId]);
}

export function AuditGate() {
  const parts = useRouteParts();
  const id = parts[1];
  const audits = useAudits((s) => s.audits);
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const viewer = useStatus((s) => s.viewer);
  useStatus((s) => s.watcher);
  useData((s) => s.homes);
  useProgressInputs();
  useEmptyAuditGuard(id);
  const local = audits.find((a) => a.id === id);
  const viewerState = services.liveViewer?.state || null;
  const watching = viewerState?.auditId === id ? viewerState : null;
  const wantsLive = !local && admin && Boolean(services.liveViewer);
  useEffect(() => {
    if (!wantsLive || services.liveViewer?.state?.auditId === id) return;
    services.liveViewer?.open(id);
    publishViewer();
  }, [wantsLive, id, viewer]);
  const liveAudit = !local && watching?.live ? watching.live.audit : null;
  const audit = local || liveAudit;
  const contextValue = useMemo(() => (audit ? { audit, live: Boolean(liveAudit) && isLiveAudit(liveAudit) } : null), [audit, liveAudit]);
  if (wantsLive && !watching?.live) return <LiveAuditStatus watching={watching} />;
  if (!audit || !contextValue) return <MissingPage />;
  const watcher = services.auditWatcher;
  const homesLoaded = useData.getState().homes !== null;
  if (!contextValue.live && watcher && (!homesLoaded || (needsReservation(audit) && !watcher.owns(audit.siteId, audit.id, audit.payStart)))) {
    return <Availability name={audit.site.name} />;
  }
  return (
    <AuditContext.Provider value={contextValue}>
      <Outlet />
    </AuditContext.Provider>
  );
}

export const auditIdFromHash = (hash: string) => partsOf(hash)[1];
