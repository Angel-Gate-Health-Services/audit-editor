import { m, useReducedMotionConfig } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { currentPayPeriod, fmtRange, payPeriodAt, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { canReopenCompletion } from '../../domain/audits/progress.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { shortDate } from '../../components/ui/basics.tsx';
import { useData, useProgress, useSession, useUi } from '../../app/store/stores.ts';
import { useRouteParts } from '../../app/navigation/hooks.ts';
import { findAnyAudit } from '../../app/runtime/audit-access.ts';
import { allSites } from '../../app/runtime/people.ts';
import { action } from '../../app/runtime/actions.ts';
import { isReady, periodTag, progressState, viewedPayPeriod, type ProgressState } from './progress.ts';
import { adminCompleteHome, refreshProgress, reopenHome, stepPeriod, toggleProgress } from './actions.ts';
import type { Completion, Home, PayPeriod } from '../../types/audit.ts';

export function useProgressInputs() {
  useProgress((s) => s.completions);
  useProgress((s) => s.progressPeriod);
  useData((s) => s.homes);
  return useSession((s) => s.profile);
}

export function ProgressBar({ st, small = false }: { st: { done: number; total: number; pct: number }; small?: boolean }) {
  return (
    <div className={`ProgressBar ${small ? 'ProgressBar--small' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={st.total} aria-valuenow={st.done} aria-label={`${st.done} of ${st.total} sites audited`}>
      <span className="ProgressBar-fill" style={{ width: `${st.pct}%` }} />
    </div>
  );
}

const reopen = action('reopenHome', reopenHome);
const complete = action('adminCompleteHome', adminCompleteHome);

export function homeAction(home: Home, period: PayPeriod, record: Completion | undefined, profile: ReturnType<typeof useSession.getState>['profile'], completing: boolean) {
  if (canReopenCompletion(record, profile)) {
    return <button className="LinkBtn" aria-label={`Undo ${home.name} audit completion`} disabled={completing} onClick={() => reopen(record!.id, period.start)}>Undo</button>;
  }
  if (profile?.is_admin && !record) {
    return <button className="LinkBtn" aria-label={`Mark ${home.name} as audited`} disabled={completing} onClick={() => complete(home.id, period.start)}>Mark complete</button>;
  }
  return null;
}

export function ProgressHomeItem({ home, record, tip, children }: { home: Home; record: Completion | undefined; tip: string; children?: ReactNode }) {
  return (
    <li className={`ProgressHomes-item ${record ? 'is-done' : ''} ${children ? 'has-action' : ''}`} title={tip}>
      <span className="sr-only">{tip}: </span>
      <Icon name={record ? 'check-circle' : 'clock'} size={12} />
      <span className="ProgressHomes-label"><span className="ProgressHomes-name">{home.name}</span>{children}</span>
    </li>
  );
}

function CompactProgress({ period }: { period: PayPeriod }) {
  useProgressInputs();
  const st = progressState(period);
  if (!isReady(st) || !st.total) return null;
  return (
    <div className="ProgressDisclosure ProgressDisclosure--compact" data-variant="compact">
      <a className={`ProgressStrip ${st.complete ? 'is-complete' : ''}`} href="#/pay-periods" title="See every pay period">
        <span className="ProgressStrip-label">{st.complete ? '🎉' : <Icon name="checklist" />} Pay period #{period.number}</span>
        <ProgressBar st={st} small />
        <span className="ProgressStrip-count">{st.complete ? 'All sites audited' : <><strong>{st.done}</strong>/{st.total} sites</>}</span>
      </a>
    </div>
  );
}

const step = action('progressPeriod', (dir: number) => stepPeriod(dir, useUi.getState().pickingSite));

function PeriodNav({ period, st }: { period: PayPeriod; st: ProgressState | null }) {
  const latest = currentPayPeriod().index;
  const tag = periodTag(period);
  const arrow = (dir: number, target: number) => {
    const disabled = target < 0 || target > latest;
    const label = dir < 0 ? 'Previous pay period' : 'Next pay period';
    return (
      <button className="ProgressPeriodNav-btn" type="button" data-dir={dir} aria-label={`${label}${disabled ? '' : ` (#${payPeriodAt(target).number})`}`} disabled={disabled} onClick={() => step(dir)}>
        <Icon name={dir < 0 ? 'chevron-left' : 'chevron-right'} />
      </button>
    );
  };
  const status = !st ? <span className="ProgressPeriodNav-status">Loading…</span>
    : st.complete ? <span className="Label Label--success ProgressPeriodNav-status"><Icon name="check-circle" size={12} />Fully audited</span>
      : <span className="ProgressPeriodNav-status"><strong>{st.done}</strong> of {st.total} sites audited</span>;
  return (
    <div className="ProgressPeriodNav">
      {arrow(-1, period.index - 1)}
      <div className="ProgressPeriodNav-label" aria-live="polite">
        <strong>Pay period #{period.number}{period.year !== currentPayPeriod().year ? ` · ${period.year}` : ''}</strong>
        <span>{fmtRange(period.start, period.end)}{tag ? ` · ${tag}` : ''}</span>
        {status}
      </div>
      {arrow(1, period.index + 1)}
    </div>
  );
}

const toggle = action('toggleProgress', toggleProgress);
const retry = action('refreshProgress', refreshProgress);

function ProgressDisclosure() {
  const profile = useProgressInputs();
  const open = useProgress((s) => s.progressOpen);
  const slide = useProgress((s) => s.progressSlide);
  const progressPeriod = useProgress((s) => s.progressPeriod);
  const msg = useProgress((s) => s.completeMsg);
  const completing = useProgress((s) => s.completing);
  const homesLoaded = useData((s) => s.homes !== null);
  const reduce = useReducedMotionConfig();
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      useProgress.setState({ progressOpen: false });
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const period = viewedPayPeriod();
  const loaded = progressState(period);
  if (loaded && 'missingTable' in loaded) return profile?.is_admin ? <div className="flash flash-warn ProgressNotice"><Icon name="alert" /><span>Shared progress is off.</span></div> : null;
  if (loaded && 'error' in loaded) return <div className="flash flash-error ProgressNotice" role="alert"><Icon name="alert" /><span>Couldn’t load audit progress.</span><button className="btn btn-sm" onClick={() => retry()}>Retry</button></div>;
  const st: ProgressState | null = isReady(loaded) ? loaded : (progressPeriod !== null && homesLoaded ? { period, loading: true, homes: allSites(), doneBy: new Map(), done: 0, total: allSites().length, pct: 0, complete: false } : null);
  if (!st) return <div className="ProgressDisclosure"><div className="ProgressStrip is-loading" role="status"><Icon name="sync" /><span>Loading audit progress…</span></div></div>;
  if (!st.total) return null;
  const { homes, doneBy, done, total, complete } = st;
  return (
    <section className={`ProgressDisclosure ${open ? 'is-open' : ''}`} data-variant="full" aria-label="Pay period progress">
      <button ref={toggleRef} className={`ProgressStrip ${complete ? 'is-complete' : ''}`} type="button" aria-expanded={open} aria-controls="progress-details" onClick={() => toggle()}>
        <span className="ProgressStrip-label">{complete ? '🎉' : <Icon name="checklist" />} Pay period #{period.number}</span>
        <ProgressBar st={st} small />
        <span className="ProgressStrip-count">{st.loading ? 'Loading…' : complete ? 'All sites audited' : <><strong>{done}</strong>/{total} sites</>}</span>
        <span className="ProgressStrip-toggle" aria-hidden="true"><Icon name="chevron-down" /></span>
      </button>
      <div className="ProgressDropShell" id="progress-details" aria-hidden={!open} inert={!open}>
        <div className="ProgressDropdown">
          <div className="Box-body">
            {msg && <p className={msg.ok ? 'color-fg-success' : 'color-fg-danger'} role="status">{msg.text}</p>}
            <PeriodNav period={period} st={st.loading ? null : st} />
            <m.div
              key={period.index}
              className="ProgressPeriodBody"
              initial={reduce || !slide ? false : { opacity: 0, x: slide < 0 ? -16 : 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {complete && <p className="ProgressCard-congrats" role="status">🎉 Congratulations! Every site has been audited for pay period #{period.number}.</p>}
              <ul className={`ProgressHomes ${st.loading ? 'is-loading' : ''}`}>
                {homes.map((h) => {
                  const record = doneBy.get(h.id);
                  const tip = st.loading ? 'Loading…' : record ? `Completed by ${record.completed_by_name || 'a user'} on ${shortDate(record.completed_at)}` : 'Not audited yet';
                  return <ProgressHomeItem key={h.id} home={h} record={record} tip={tip}>{st.loading ? null : homeAction(h, period, record, profile, completing)}</ProgressHomeItem>;
                })}
              </ul>
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProgressArea() {
  const signedIn = useSession((s) => Boolean(s.profile));
  const [area, id] = useRouteParts();
  useProgress((s) => s.completions);
  if (!signedIn) return null;
  if (area === 'audits' || area === 'new') return <ProgressDisclosure />;
  if (area === 'a') {
    const audit = findAnyAudit(id);
    if (audit?.payStart) return <CompactProgress period={payPeriodAt(payPeriodIndexFor(audit.payStart))} />;
  }
  return <CompactProgress period={currentPayPeriod()} />;
}
