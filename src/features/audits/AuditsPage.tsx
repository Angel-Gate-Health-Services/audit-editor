import { useEffect } from 'react';
import { AUDIT_SORTS, allEntries, entryFlagged, fmtLong, fmtRange, payPeriod, payPeriodAt, payPeriodIndexFor, sortAudits } from '../../domain/audits/model.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, clockTime, plural, useTitle } from '../../components/ui/basics.tsx';
import { useAudits, useData, useSession, useUi } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites } from '../../app/runtime/people.ts';
import { href } from '../../app/navigation/route.ts';
import { completionOf, periodTag, viewedPayPeriod } from '../progress/progress.ts';
import { useProgressInputs } from '../progress/ProgressArea.tsx';
import { showPeriod } from '../progress/actions.ts';
import { deleteAudit, exportAudit } from './audit-actions.ts';
import { othersAudits, watchOthers } from './others.ts';
import { auditSort, setAuditSort } from './sort.ts';
import type { Audit, OthersLiveAudit, PayPeriod } from '../../types/audit.ts';

const sortAction = action('sortAudits', (value: string, select: HTMLSelectElement) => {
  setAuditSort(value);
  requestAnimationFrame(() => select.focus({ preventScroll: true }));
});
const removeAudit = action('deleteAudit', deleteAudit);
const backup = action('exportAudit', exportAudit);
const showPeriodAction = action('showPeriod', showPeriod);

export function PeriodNote({ period }: { period: PayPeriod }) {
  const tag = periodTag(period);
  return <p className="PeriodNote"><Icon name="calendar" /><span>Showing pay period <strong>#{period.number}</strong> · {fmtRange(period.start, period.end)}{tag ? ` · ${tag}` : ''}.</span></p>;
}

export function SortMenu({ count }: { count: number }) {
  const sort = useUi((s) => s.auditSort) || auditSort();
  if (count < 2) return null;
  return (
    <label className="SortMenu">
      <span className="SortMenu-label"><Icon name="sort-desc" size={14} />Sort</span>
      <select className="form-select select-sm" aria-label="Sort audits" value={sort} onChange={(ev) => sortAction(ev.target.value, ev.currentTarget)}>
        {AUDIT_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}

export function AuditRow({ audit: a }: { audit: Audit }) {
  const entries = allEntries(a);
  const flagged = entries.filter(entryFlagged).length;
  return (
    <div className="Box-row Box-row--hover AuditRow">
      <span className="AuditRow-icon"><Icon name="file-badge" /></span>
      <div className="AuditRow-main">
        <div className="AuditRow-titleLine">
          <a className="AuditRow-title" href={href('a', a.id)}>{a.site.name}</a>
          <span className="Label">{payPeriod(a) || 'No pay period'}</span>
          {completionOf(a) && <span className="Label Label--success"><Icon name="check" />Complete</span>}
          {entries.length ? <span className={`Label ${flagged ? 'Label--danger' : 'Label--success'}`}>{flagged ? `${flagged} flagged` : 'No issues'}</span> : null}
        </div>
        <div className="AuditRow-meta">Dated {fmtLong(a.auditDate)}{a.auditor ? ` · ${a.auditor}` : ''} · {plural(a.site.residents.length, 'individual')} · {plural(entries.length, 'shift')} reviewed</div>
      </div>
      <div className="AuditRow-actions">
        <a className="btn btn-sm" href={href('a', a.id, 'pdf')}><Icon name="file" />PDF</a>
        <button className="btn btn-sm" title="Download a backup of this audit" onClick={() => backup(a.id)}><Icon name="download" />Backup</button>
        <button className="btn-octicon btn-octicon-danger" aria-label={`Delete ${a.site.name} audit`} title="Delete audit" onClick={() => removeAudit(a.id)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}

function OthersAuditRow({ o }: { o: OthersLiveAudit }) {
  const a = o.audit || ({} as Audit);
  const entries = a.individuals ? allEntries(a) : [];
  const flagged = entries.filter(entryFlagged).length;
  const home = allSites().find((h) => h.id === o.homeId);
  const name = home?.name || a.site?.name || 'Unknown site';
  const residents = a.site?.residents?.length || 0;
  return (
    <div className="Box-row Box-row--hover AuditRow AuditRow--viewOnly">
      <span className="AuditRow-icon"><Icon name="eye" /></span>
      <div className="AuditRow-main">
        <div className="AuditRow-titleLine">
          <a className="AuditRow-title" href={href('a', o.auditId)}>{name}</a>
          <span className="Label">{payPeriod(a) || 'No pay period'}</span>
          <span className="Label Label--attention"><Icon name="lock" size={12} />View only</span>
          {entries.length ? <span className={`Label ${flagged ? 'Label--danger' : 'Label--success'}`}>{flagged ? `${flagged} flagged` : 'No issues'}</span> : null}
        </div>
        <div className="AuditRow-meta"><strong>{o.ownerName}</strong> is editing · last change {clockTime(o.updatedAt)} · {plural(residents, 'individual')} · {plural(entries.length, 'shift')} reviewed</div>
      </div>
      <div className="AuditRow-actions">
        <a className="btn btn-sm" href={href('a', o.auditId)}><Icon name="eye" />View</a>
        <a className="btn btn-sm" href={href('a', o.auditId, 'pdf')}><Icon name="file" />PDF</a>
      </div>
    </div>
  );
}

function OthersAuditsBox() {
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const o = useUi((s) => s.othersAudits);
  useUi((s) => s.auditSort);
  useEffect(() => { watchOthers(); });
  if (!admin) return null;
  const list = othersAudits();
  const empty = o.list === null
    ? <div className="Box-row OthersAudits-empty" role="status"><Icon name="sync" /><span>Checking for audits from others…</span></div>
    : o.error && o.error !== 'missing-table'
      ? <div className="Box-row OthersAudits-empty"><Icon name="alert" /><span>Couldn’t load audits from others. Trying again…</span></div>
      : o.error === 'missing-table'
        ? <div className="Box-row OthersAudits-empty"><Icon name="alert" /><span>Run <code>supabase/live-audits.sql</code> in Supabase to see audits from others.</span></div>
        : <div className="Box-row OthersAudits-empty"><Icon name="eye" /><span>No other auditors are working on an audit for this pay period right now.</span></div>;
  return (
    <div className="Box OthersAudits">
      <div className="Box-header OthersAudits-header">
        <h2 className="Box-title"><Icon name="eye" />Audits from others</h2>
        <span className="Counter">{list.length}</span>
        <span className="OthersAudits-note">View only. Updates every 5 seconds.</span>
      </div>
      {list.length ? list.map((x) => <OthersAuditRow key={x.auditId} o={x} />) : empty}
    </div>
  );
}

function OtherPeriodAudits({ period, audits }: { period: PayPeriod; audits: Audit[] }) {
  const groups = new Map<number, Audit[]>();
  for (const a of audits) {
    if (!a.payStart || a.payStart === period.start) continue;
    const index = payPeriodIndexFor(a.payStart);
    groups.set(index, [...(groups.get(index) || []), a]);
  }
  if (!groups.size) return null;
  return (
    <div className="OtherPeriods">
      <span className="OtherPeriods-label">Your audits in other pay periods:</span>
      {[...groups.entries()].sort(([a], [b]) => b - a).map(([index, list]) => {
        const p = payPeriodAt(index);
        const names = [...new Set(list.map((a) => a.site?.name || 'Audit'))].join(', ');
        return (
          <button key={index} className="OtherPeriods-link" type="button" onClick={() => showPeriodAction(index)}>
            <Icon name="calendar" size={12} /><strong>#{p.number}</strong><span>{names}</span><Icon name="arrow-right" size={12} />
          </button>
        );
      })}
    </div>
  );
}

export function AuditsPage() {
  useTitle('Audits');
  const allAudits = useAudits((s) => s.audits);
  useUi((s) => s.auditSort);
  useData((s) => s.homes);
  useProgressInputs();
  const period = viewedPayPeriod();
  const audits = sortAudits(allAudits.filter((a) => a.payStart === period.start), auditSort());
  const body = audits.length ? (
    <div className="Box">
      <div className="Box-header AuditsHeader"><h2 className="Box-title">Your audits</h2><span className="Counter">{audits.length}</span><SortMenu count={audits.length} /></div>
      {audits.map((a) => <AuditRow key={a.id} audit={a} />)}
    </div>
  ) : allAudits.length ? (
    <div className="Box"><div className="blankslate">
      <span className="blankslate-icon"><Icon name="calendar" size={24} /></span>
      <h2 className="blankslate-heading">No audits for pay period #{period.number}</h2>
      <p>Your other audits are in different pay periods. Open one below, or start one for this period.</p>
      <a className="btn btn-primary blankslate-action" href="#/new"><Icon name="plus" />Start a new audit</a>
    </div></div>
  ) : (
    <div className="Box"><div className="blankslate">
      <span className="blankslate-icon"><Icon name="file-badge" size={24} /></span>
      <h2 className="blankslate-heading">No audits yet? Start here!</h2>
      <p>Audits are saved to your account, so they show up wherever you sign in. Completed sites are shared with everyone.</p>
      <a className="btn btn-primary blankslate-action" href="#/new"><Icon name="plus" />Start a new audit</a>
    </div></div>
  );
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Documentation audits']]} className="AuditsBreadcrumbs" />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Documentation audits</h1>
          <p className="PageHeader-description">Review submitted documentation and create new audits.</p>
        </div>
        <div className="PageHeader-actions">
          <a className="btn btn-primary" href="#/new"><Icon name="plus" />New audit</a>
        </div>
      </div>
      <PeriodNote period={period} />
      {body}
      <OtherPeriodAudits period={period} audits={allAudits} />
      <OthersAuditsBox />
    </>
  );
}
