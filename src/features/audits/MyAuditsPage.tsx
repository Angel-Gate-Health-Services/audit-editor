import { allEntries, entryFlagged, fmtRange, payPeriodAt, payPeriodIndexFor, sortAudits } from '../../domain/audits/model.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, StatTile, percentText, plural, useTitle } from '../../components/ui/basics.tsx';
import { useAudits, useUi } from '../../app/store/stores.ts';
import { completionOf } from '../progress/progress.ts';
import { useProgressInputs } from '../progress/ProgressArea.tsx';
import { AuditRow, SortMenu } from './AuditsPage.tsx';
import { auditSort } from './sort.ts';
import type { Audit } from '../../types/audit.ts';

export function MyAuditsPage() {
  useTitle('Your audits');
  const audits = useAudits((s) => s.audits);
  useUi((s) => s.auditSort);
  useProgressInputs();
  const entries = audits.flatMap((a) => allEntries(a));
  const completed = audits.filter((a) => completionOf(a) || a.completedAt).length;
  const header = (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Your audits']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Your audits</h1>
          <p className="PageHeader-description">Every audit you’ve made, across all pay periods. They’re saved to your account, so they show up wherever you sign in.</p>
        </div>
        <div className="PageHeader-actions"><a className="btn btn-primary" href="#/new"><Icon name="plus" />New audit</a></div>
      </div>
    </>
  );
  if (!audits.length) {
    return (
      <>
        {header}
        <div className="Box"><div className="blankslate">
          <span className="blankslate-icon"><Icon name="file-badge" size={24} /></span>
          <h2 className="blankslate-heading">You haven’t made any audits yet</h2>
          <p>Start one and it will show up here, grouped by pay period.</p>
          <a className="btn btn-primary blankslate-action" href="#/new"><Icon name="plus" />Start a new audit</a>
        </div></div>
      </>
    );
  }
  const groups = new Map<number, Audit[]>();
  for (const a of sortAudits(audits, auditSort())) {
    const index = a.payStart ? payPeriodIndexFor(a.payStart) : -1;
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index)!.push(a);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => b - a);
  const flaggedShifts = entries.filter(entryFlagged).length;
  return (
    <>
      {header}
      <div className="StatGrid" data-stagger="">
        <StatTile label="Audits" value={audits.length} sub={plural(groups.size, 'pay period')} />
        <StatTile label="Completed" value={completed} sub={`${audits.length - completed} in progress`} />
        <StatTile label="Shifts reviewed" value={entries.length} sub={`${new Set(entries.map((e) => e.author.trim()).filter(Boolean)).size} staff members`} />
        <StatTile label="Flagged shifts" value={flaggedShifts} sub={entries.length ? `${percentText(flaggedShifts / entries.length)} of shifts` : '—'} />
      </div>
      {ordered.map(([index, list], i) => (
        <div className="Box" key={index}>
          <div className="Box-header AuditsHeader">
            <h2 className="Box-title">{index < 0 ? 'No pay period' : `Pay period #${payPeriodAt(index).number}`}</h2>
            <span className="Counter">{list.length}</span>
            {index < 0 ? null : <span className="f6 color-fg-muted">{fmtRange(payPeriodAt(index).start, payPeriodAt(index).end)}</span>}
            {i === 0 ? <SortMenu count={audits.length} /> : null}
          </div>
          {list.map((a) => <AuditRow key={a.id} audit={a} />)}
        </div>
      ))}
    </>
  );
}
