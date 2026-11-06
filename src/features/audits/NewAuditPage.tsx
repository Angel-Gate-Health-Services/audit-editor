import { useEffect } from 'react';
import { currentPayPeriod, fmtLong, fmtRange, lastPayPeriod } from '../../domain/audits/model.ts';
import { canReopenCompletion } from '../../domain/audits/progress.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, plural, shortDate, useTitle } from '../../components/ui/basics.tsx';
import { useAdmin, useAudits, useData, useProgress, useSession, useStatus, useUi } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites, auditorName, isAdmin, refreshHomes } from '../../app/runtime/people.ts';
import { services } from '../../app/runtime/services.ts';
import { auditHasWork } from '../../app/runtime/audit-access.ts';
import { href } from '../../app/navigation/route.ts';
import { completionOf, completionsFor, periodNumber, viewedPayPeriod } from '../progress/progress.ts';
import { useProgressInputs } from '../progress/ProgressArea.tsx';
import { reopenHome } from '../progress/actions.ts';
import { pickSite, refreshActivity } from './audit-actions.ts';
import { PeriodNote } from './AuditsPage.tsx';
import type { Audit } from '../../types/audit.ts';

const pick = action('pickSite', pickSite);
const reopen = action('reopenHome', reopenHome);
const retry = action('refreshActivity', refreshActivity);

export function periodTakenReason(audit: Audit, start: string) {
  const profile = useSession.getState().profile!;
  const other = services.auditWatcher?.snapshot().list.find((r) => r.home_id === audit.siteId && r.pay_period_start === start && r.user_id !== profile.id);
  if (other) return `${auditorName(other.user_id) || 'someone else'} is auditing it`;
  if (completionsFor(start).list?.some((r) => r.home_id === audit.siteId)) return 'already audited';
  if (useAudits.getState().audits.some((a) => a.id !== audit.id && a.siteId === audit.siteId && a.payStart === start)) return 'you have another audit for it';
  return '';
}

export function payPeriodChoices(audit: Audit) {
  const status = completionsFor(audit.payStart);
  const completed = Boolean(completionOf(audit) || ((status.loading || status.error) && (audit.completionId || audit.completedAt)));
  const choices: { label: string; start: string; payDate?: string; taken?: string }[] = ([['Last pay period', lastPayPeriod()], ['Current pay period', currentPayPeriod()]] as const)
    .map(([label, p]) => {
      const taken = audit.payStart === p.start ? '' : periodTakenReason(audit, p.start);
      return { label: `${label} · #${p.number} · ${fmtRange(p.start, p.end)}${taken ? ` · ${taken}` : ''}`, start: p.start, payDate: p.payDate, taken };
    });
  if (audit.payStart && !choices.some((c) => c.start === audit.payStart)) {
    choices.unshift({ label: `Saved pay period · ${fmtRange(audit.payStart, audit.payEnd || audit.payStart)}`, start: audit.payStart });
  }
  const selected = choices.find((c) => c.start === audit.payStart) || choices[0];
  return { choices, selected, completed };
}

export function NewAuditPage() {
  useTitle('New audit');
  const homesState = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  const activity = useStatus((s) => s.watcher);
  const audits = useAudits((s) => s.audits);
  const profile = useSession((s) => s.profile)!;
  const picking = useUi((s) => s.pickingSite);
  const completing = useProgress((s) => s.completing);
  useAdmin((s) => s.users);
  useProgressInputs();
  useEffect(() => {
    if (homesState === null && !homesError) void refreshHomes();
  }, [homesState, homesError]);
  const header = (
    <>
      <Breadcrumbs items={[['Audits', '#/audits'], ['New audit']]} />
      <div className="PageHeader"><div><h1 className="PageHeader-title">Which site are you auditing?</h1></div></div>
    </>
  );
  if (homesState === null) {
    return (
      <>
        {header}
        {homesError
          ? <div className="flash flash-error"><Icon name="alert" /><span>Couldn’t load sites: {homesError}</span></div>
          : <div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Loading sites…</p></div></div>}
      </>
    );
  }
  const sites = allSites();
  const period = viewedPayPeriod();
  const doneList = completionsFor(period.start).list || [];
  const admin = isAdmin();
  const tiles = sites.map((s) => {
    const rec = doneList.find((r) => r.home_id === s.id);
    const held = activity?.list.filter((r) => r.home_id === s.id) || [];
    const occupied = held.find((r) => r.pay_period_start === period.start);
    const blocked = Boolean(occupied && occupied.user_id !== profile.id);
    const ownAudit = audits.find((a) => a.siteId === s.id && a.payStart === period.start && !completionOf(a));
    const started = Boolean(ownAudit && auditHasWork(ownAudit));
    const inProgress = Boolean(occupied || (started && !rec));
    const mine = [...new Set(audits.filter((a) => a.siteId === s.id && a.payStart && a.payStart !== period.start).map((a) => a.payStart))];
    const others = held.filter((r) => r.pay_period_start !== period.start && r.user_id !== profile.id);
    const content = (
      <>
        {rec && <span className="Label Label--success HomeTile-badge" title={`Completed by ${rec.completed_by_name || 'a user'} on ${shortDate(rec.completed_at)}`}><Icon name="check" />Audited #{period.number}</span>}
        <span className="HomeTile-name">{s.name}</span>
        {inProgress && <span className="HomeTile-warning"><Icon name="alert-circle" /> {blocked ? (admin && auditorName(occupied!.user_id) ? `${auditorName(occupied!.user_id)} is auditing this site` : 'This site is already being audited') : 'You’re auditing this site'}</span>}
        <span className="HomeTile-line"><Icon name="location" /><span>{s.address || 'No address'}</span></span>
        {s.manager ? <span className="HomeTile-line"><Icon name="person" /><span>{s.managerTitle || 'Lead/Manager'}: {s.manager}</span></span> : null}
        <span className="HomeTile-line"><Icon name="people" /><span>{plural(s.residents.length, 'resident')}</span></span>
        {mine.map((start) => <span key={`m${start}`} className="HomeTile-line HomeTile-elsewhere"><Icon name="file-badge" /><span>You have an audit of this site for pay period #{periodNumber(start)}</span></span>)}
        {others.map((r) => <span key={`o${r.pay_period_start}`} className="HomeTile-line HomeTile-elsewhere"><Icon name="info" /><span>{auditorName(r.user_id) || 'Someone'} is auditing pay period #{periodNumber(r.pay_period_start)}</span></span>)}
      </>
    );
    if (blocked && admin && occupied!.audit_id && !rec) {
      return (
        <div className="HomeTile-wrap" key={s.id}>
          <a className="HomeTile is-auditing is-viewable" href={href('a', String(occupied!.audit_id))}>
            {content}
            <span className="HomeTile-go HomeTile-go--view"><Icon name="eye" /> View audit <Icon name="arrow-right" /></span>
          </a>
        </div>
      );
    }
    if (rec) {
      return (
        <div className="HomeTile-wrap" key={s.id}>
          <div className={`HomeTile HomeTile--static is-done ${occupied ? 'is-auditing' : ''}`} aria-disabled="true">
            {content}
            <div className="HomeTile-footer">
              <span className="HomeTile-go HomeTile-go--complete"><Icon name="check-circle" /> Completed by {rec.completed_by_name || 'a user'}</span>
              {canReopenCompletion(rec, profile) && <button className="LinkBtn HomeTile-undo" aria-label={`Undo ${s.name} audit completion`} disabled={completing || picking} onClick={() => reopen(rec.id, period.start)}><Icon name="undo" /> Undo</button>}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="HomeTile-wrap" key={s.id}>
        <button className={`HomeTile ${inProgress ? 'is-auditing' : ''}`} aria-disabled={blocked ? 'true' : undefined} disabled={picking} onClick={() => pick(s.id)}>
          {content}
          <span className={`HomeTile-go ${started && !blocked ? 'HomeTile-go--continue' : ''}`}>{blocked ? <><Icon name="alert-circle" /> Site in use</> : started ? <>Continue audit <Icon name="arrow-right" /></> : <>Start audit <Icon name="arrow-right" /></>}</span>
        </button>
      </div>
    );
  });
  return (
    <>
      {header}
      <PeriodNote period={period} />
      {activity?.error
        ? <div className="flash flash-warn" role="status"><Icon name="alert-circle" /><span>Couldn’t check site availability. Please try again.</span><button className="btn btn-sm" onClick={() => retry()}>Retry</button></div>
        : !activity?.loaded ? <p className="color-fg-muted" role="status">Checking site availability…</p> : null}
      {sites.length ? <div className="HomeGrid" data-stagger="">{tiles}</div> : (
        <div className="Box"><div className="blankslate">
          <span className="blankslate-icon"><Icon name="home" size={24} /></span>
          <h2 className="blankslate-heading">No sites yet</h2>
          <p>{admin ? 'Add sites in the admin dashboard.' : 'Your administrator hasn’t added any sites yet.'}</p>
          {admin && <a className="btn btn-primary blankslate-action" href="#/dashboard/sites"><Icon name="shield-lock" />Open admin dashboard</a>}
        </div></div>
      )}
    </>
  );
}

export const payDateCaption = (payDate?: string) => (payDate ? `Paid ${fmtLong(payDate)}. ` : '');
