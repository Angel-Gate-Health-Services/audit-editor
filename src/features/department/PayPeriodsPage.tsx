import { useEffect, useMemo, type SyntheticEvent } from 'react';
import { currentPayPeriod, fmtLong, fmtRange, fmtShort, payPeriodAt, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, StatTile, percentText, shortDate, useTitle } from '../../components/ui/basics.tsx';
import { useAudits, useData, useStaff, useStatus, useUi } from '../../app/store/stores.ts';
import { allSites, refreshHomes } from '../../app/runtime/people.ts';
import { action } from '../../app/runtime/actions.ts';
import { href } from '../../app/navigation/route.ts';
import { openPeriodInAudits } from '../progress/actions.ts';
import { watchStaff } from '../staff/staff-data.ts';
import { StaffNotice } from '../staff/StaffNotice.tsx';
import type { Completion, Finding, PayPeriod } from '../../types/audit.ts';

const openInAudits = action('openPeriodInAudits', openPeriodInAudits);

interface PeriodRowData { period: PayPeriod; rows: Finding[]; done: Map<string, Completion>; flagged: number; mine: number; audited: number }

export function PayPeriodsPage() {
  useTitle('Pay periods');
  const st = useStaff();
  const homesState = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  const audits = useAudits((s) => s.audits);
  const hubActivity = useUi((s) => s.hub.activity);
  const watcherList = useStatus((s) => s.watcher?.list);
  const periodsOpen = useUi((s) => s.periodsOpen);
  useEffect(() => {
    watchStaff();
    if (homesState === null && !homesError) void refreshHomes();
  });
  const current = currentPayPeriod();
  useEffect(() => {
    if (!useUi.getState().periodsOpen) useUi.setState({ periodsOpen: new Set([current.index]) });
  }, [current.index]);
  const open = useMemo(() => periodsOpen || new Set([current.index]), [periodsOpen, current.index]);

  const header = (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Pay periods']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Pay periods</h1>
          <p className="PageHeader-description">Every pay period so far, with the sites audited and the shifts reviewed in each.</p>
        </div>
      </div>
    </>
  );
  if (st.findings === null || homesState === null) {
    return <>{header}<StaffNotice /><div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Loading pay periods…</p></div></div></>;
  }
  const homes = allSites();
  const byPeriod = new Map<number, Finding[]>();
  for (const f of st.findings) {
    if (!f.pay_period_start || !f.complete) continue;
    const index = payPeriodIndexFor(f.pay_period_start);
    if (!byPeriod.has(index)) byPeriod.set(index, []);
    byPeriod.get(index)!.push(f);
  }
  const completionsBy = new Map<number, Map<string, Completion>>();
  for (const c of st.completions || []) {
    if (!c.pay_period_start) continue;
    const index = payPeriodIndexFor(c.pay_period_start);
    if (!completionsBy.has(index)) completionsBy.set(index, new Map());
    completionsBy.get(index)!.set(c.home_id, c);
  }
  const reserved = new Map((hubActivity || watcherList || []).map((r) => [`${payPeriodIndexFor(r.pay_period_start || current.start)}:${r.home_id}`, r]));
  const excused = (f: Finding) => st.reviews.get(f.id)?.excused;
  const periods: PeriodRowData[] = [];
  for (let i = current.index; i >= 0; i -= 1) {
    const period = payPeriodAt(i);
    const rows = byPeriod.get(i) || [];
    const done = completionsBy.get(i) || new Map<string, Completion>();
    const flagged = rows.filter((f) => f.flagged && !excused(f)).length;
    const mine = audits.filter((a) => a.payStart === period.start).length;
    periods.push({ period, rows, done, flagged, mine, audited: homes.filter((h) => done.has(h.id)).length });
  }
  const finished = periods.filter((p) => p.period.index < current.index);
  const full = finished.filter((p) => homes.length && p.audited === homes.length).length;
  const avg = finished.length && homes.length ? finished.reduce((n, p) => n + p.audited / homes.length, 0) / finished.length : 0;
  const years: { year: string; periods: PeriodRowData[] }[] = [];
  for (const p of periods) {
    const year = p.period.year;
    if (!years.length || years.at(-1)!.year !== year) years.push({ year, periods: [] });
    years.at(-1)!.periods.push(p);
  }
  const onToggle = (index: number) => (ev: SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = ev.currentTarget.open;
    const next = new Set(useUi.getState().periodsOpen || open);
    if (isOpen) next.add(index);
    else next.delete(index);
    useUi.setState({ periodsOpen: next });
  };
  const homeRows = (p: PeriodRowData) => homes.map((h) => {
    const c = p.done.get(h.id);
    const rows = p.rows.filter((f) => f.home_id === h.id);
    const flagged = rows.filter((f) => f.flagged && !excused(f)).length;
    const live = reserved.get(`${p.period.index}:${h.id}`);
    const status = c
      ? <><span className="Label Label--success"><Icon name="check" size={12} />Audited</span><span className="PeriodHomes-who">{c.completed_by_name || 'a user'}{c.completed_at ? ` · ${shortDate(c.completed_at)}` : ''}</span></>
      : live ? <span className="Label Label--attention"><Icon name="eye" size={12} />Being audited</span>
        : p.period.index === current.index ? <span className="Label">Not yet</span> : <span className="Label Label--danger"><Icon name="x" size={12} />Not audited</span>;
    return (
      <tr key={h.id}>
        <td><a href={href('sites', h.id)}>{h.name}</a></td>
        <td className="PeriodHomes-status">{status}</td>
        <td>{rows.length}</td>
        <td>{flagged ? <span className="color-fg-danger">{flagged}</span> : '0'}</td>
      </tr>
    );
  });
  return (
    <>
      {header}
      <StaffNotice />
      <div className="StatGrid" data-stagger="">
        <StatTile label="Pay periods so far" value={periods.length} sub={`Since ${fmtLong(payPeriodAt(0).start)}`} />
        <StatTile label="Fully audited" value={`${full} of ${finished.length}`} sub="Finished periods with every site audited" />
        <StatTile label="Average coverage" value={finished.length ? percentText(avg) : '—'} sub="Sites audited per finished period" />
        <StatTile label="Shifts audited" value={st.findings.filter((f) => f.complete).length} sub="Across every pay period" />
      </div>
      {years.map((y) => (
        <div className="Box PeriodYear" key={y.year}>
          <div className="Box-header AuditsHeader"><h2 className="Box-title">{y.year}</h2><span className="Counter">{y.periods.length}</span><span className="f6 color-fg-muted">Numbered by the year they’re paid in</span></div>
          {y.periods.map((p) => {
            const isCurrent = p.period.index === current.index;
            const pct = homes.length ? p.audited / homes.length : 0;
            return (
              <details key={p.period.index} className={`PeriodRow ${isCurrent ? 'is-current' : ''}`} data-period={p.period.index} open={open.has(p.period.index)} onToggle={onToggle(p.period.index)}>
                <summary className="PeriodRow-summary">
                  <span className="PeriodRow-main">
                    <span className="PeriodRow-title">Pay period #{p.period.number}{isCurrent ? <> <span className="Label Label--accent">Current</span></> : null}</span>
                    <span className="PeriodRow-dates">{fmtRange(p.period.start, p.period.end)} · Paid {fmtShort(p.period.payDate)}</span>
                  </span>
                  <span className="PeriodRow-coverage">
                    <span className="RateBar RateBar--good"><span className="RateBar-fill" style={{ width: `${Math.round(pct * 100)}%` }} /></span>
                    <span><strong>{p.audited}</strong>/{homes.length} sites</span>
                  </span>
                  <span className="StaffRow-stat"><strong>{p.rows.length}</strong><span>shifts</span></span>
                  <span className={`StaffRow-stat ${p.flagged ? 'is-flagged' : ''}`}><strong>{p.flagged}</strong><span>flagged</span></span>
                  <span className="StaffRow-stat"><strong>{p.mine}</strong><span>yours</span></span>
                  <span className="PeriodRow-chevron"><Icon name="chevron-down" /></span>
                </summary>
                <div className="PeriodRow-body">
                  <div className="TableScroll"><table className="DataTable PeriodHomes">
                    <thead><tr><th>Site</th><th>Status</th><th>Shifts</th><th>Flagged</th></tr></thead>
                    <tbody>{homeRows(p)}</tbody>
                  </table></div>
                  <div className="PeriodRow-actions">
                    <button className="btn btn-sm" onClick={() => openInAudits(p.period.index)}><Icon name="file-badge" />Open in audits</button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ))}
    </>
  );
}
