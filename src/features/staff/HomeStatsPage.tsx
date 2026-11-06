import { useEffect } from 'react';
import { useParams } from 'react-router';
import { fmtDate, fmtRange, lastPayPeriod } from '../../domain/audits/model.ts';
import { coverage, employeeStats, staffBreakdown, summarizeHome } from '../../domain/employees/stats.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, RateBar, StatTile, percentText, plural, shortDate, useTitle } from '../../components/ui/basics.tsx';
import { useData, useSession, useStaff } from '../../app/store/stores.ts';
import { refreshEmployees, refreshHomes } from '../../app/runtime/people.ts';
import { href } from '../../app/navigation/route.ts';
import { MissingPage } from '../../app/shell/pages.tsx';
import { homeData, watchStaff } from './staff-data.ts';
import { StaffNotice } from './StaffNotice.tsx';
import { BarList, LoadingStats, ShiftsTable, StaffMessage, StaffRangeSelect, TrendChart, WorkPattern, unlistedHref } from './components.tsx';

export default function HomeStatsPage() {
  const key = useParams().key || '';
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const homesState = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  const st = useStaff();
  useEffect(() => {
    watchStaff();
    if (homesState === null && !homesError) void refreshHomes();
    if (employees === null && !employeesError) void refreshEmployees();
  });
  const ready = st.findings !== null && homesState !== null && employees !== null;
  const data = ready ? homeData() : null;
  const home = data?.byHome.get(key);
  useTitle(!ready ? 'Site' : home ? `${home.name} · Sites` : 'Not found');
  if (!ready) return <LoadingStats crumbs={<><Breadcrumbs items={[['Home', '#/'], ['Sites', '#/sites'], ['…']]} remember /><StaffNotice /></>} />;
  if (!home) return <MissingPage />;
  const { orgRate } = data!;
  const s = employeeStats(home.rows, { reviews: st.reviews, orgRate });
  const staff = staffBreakdown(home.rows, employees, { reviews: st.reviews });
  const cover = home.id ? coverage(st.completions, home.id, lastPayPeriod().index) : null;
  const site = home.site;
  const vsCompany = s.complete && orgRate !== null ? (s.rate > orgRate + 0.05 ? `${percentText(s.rate - orgRate)} above the company` : s.rate < orgRate - 0.05 ? `${percentText(orgRate - s.rate)} below the company` : 'About the company average') : '—';
  const facts = site ? [
    site.address ? <><Icon name="location" size={14} />{site.address}</> : null,
    site.manager ? <><Icon name="person" size={14} />{site.managerTitle || 'Lead/Manager'}: {site.manager}</> : null,
    <><Icon name="people" size={14} />{plural(site.residents.length, 'individual')}</>,
  ].filter(Boolean) : [];
  const flaggedStaff = staff.filter((p) => p.s.flagged).length;
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Sites', '#/sites'], [home.name]]} remember />
      <StaffNotice />
      <StaffMessage />
      <div className="EmployeeHero">
        <span className="InitialsAvatar InitialsAvatar--hero HomeAvatar"><Icon name="home" size={32} /></span>
        <div className="EmployeeHero-main">
          <h1 className="EmployeeHero-name">{home.name}</h1>
          <div className="EmployeeHero-labels">
            {site ? null : <span className="Label">Removed from the site list</span>}
            {cover && cover.missedInRow >= 2 ? <span className="Label Label--danger"><Icon name="alert" size={12} />Not audited the last {cover.missedInRow} pay periods</span> : null}
            {s.streak >= 2 ? <span className="Label Label--danger"><Icon name="alert" size={12} />Flags {s.streak} pay periods in a row</span> : null}
          </div>
          {facts.length ? <p className="EmployeeHero-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</p> : null}
        </div>
        <div className="EmployeeHero-actions">
          <StaffRangeSelect />
          {admin && site ? <a className="btn" href={href('dashboard', 'site', site.id)}><Icon name="pencil" />Edit site</a> : null}
        </div>
      </div>
      <div className="Box SummaryBox">
        <div className="Box-header AuditsHeader"><h2 className="Box-title"><Icon name="note" />Summary</h2><span className="f6 color-fg-muted">Written from the numbers below and kept up to date as audits change.</span></div>
        <div className="Box-body"><p className="SummaryBox-text">{summarizeHome(home.name, s, { staff, cover })}</p></div>
      </div>
      <div className="StatGrid" data-stagger="">
        <StatTile label="Shifts audited" value={s.complete} sub={s.inProgress ? `${s.inProgress} more in progress` : plural(s.auditors, 'auditor')} />
        <StatTile label="Flagged shifts" value={s.flagged} sub={s.excused ? `${s.excused} excused` : `${s.clean} with no issues`} />
        <StatTile label="Flag rate" value={s.complete ? percentText(s.rate) : '—'} sub={vsCompany} />
        <StatTile label="Staff audited" value={staff.filter((p) => p.s.complete).length} sub={flaggedStaff ? `${flaggedStaff} with flags` : 'None flagged'} />
        <StatTile label="Audit coverage" value={cover ? `${cover.audited}/${cover.total}` : '—'} sub="Of the last 6 pay periods" />
        <StatTile label="Last audited" value={s.last ? fmtDate(s.last) : '—'} sub={s.first && s.first !== s.last ? `First ${fmtDate(s.first)}` : ''} small />
      </div>
      <div className="EmployeeGrid" data-stagger="">
        <div className="Box"><div className="Box-header"><h2 className="Box-title">Most flagged for</h2></div><div className="Box-body"><BarList items={s.topReasons.slice(0, 7)} total={s.flagged} empty="Nothing flagged in this range." /></div></div>
        <div className="Box"><div className="Box-header"><h2 className="Box-title">Flag rate by pay period</h2></div><div className="Box-body"><TrendChart s={s} /></div></div>
        <div className="Box">
          <div className="Box-header AuditsHeader"><h2 className="Box-title">Staff at this site</h2><span className="f6 color-fg-muted">Most flagged first</span></div>
          <div className="Box-body">{staff.length ? (
            <>
              <ul className="HomeStats">{staff.slice(0, 12).map((p) => (
                <li key={p.key}>
                  <span className="HomeStats-name"><a href={p.listed ? href('employees', p.id!) : unlistedHref(p.key)}>{p.name}</a>{p.listed ? null : <> <span className="Label">Not on list</span></>}</span>
                  <span className="HomeStats-count">{plural(p.s.complete, 'shift')}</span>
                  <span className="StaffRow-rate"><RateBar rate={p.s.rate} label={`${percentText(p.s.rate)} flagged`} /><span>{p.s.flagged} flagged</span></span>
                </li>
              ))}</ul>
              {staff.length > 12 ? <p className="f6 color-fg-muted mt-2 mb-0">And {plural(staff.length - 12, 'more staff member')}.</p> : null}
            </>
          ) : <p className="color-fg-muted m-0">No staff audited here yet.</p>}</div>
        </div>
        <div className="Box">
          <div className="Box-header AuditsHeader"><h2 className="Box-title">Pay period audits</h2><span className="f6 color-fg-muted">Marked complete on the progress bar</span></div>
          <div className="Box-body">{cover ? (cover.total ? (
            <ul className="CoverageList">{cover.periods.map((p) => (
              <li key={p.index} className={`CoverageList-item ${p.completion ? 'is-done' : ''}`}>
                <span className="CoverageList-icon"><Icon name={p.completion ? 'check-circle' : 'x-circle'} size={14} /></span>
                <span className="CoverageList-period"><strong>#{p.period.number}</strong> {fmtRange(p.period.start, p.period.end)}</span>
                <span className="CoverageList-who">{p.completion ? `Audited by ${p.completion.completed_by_name || 'a user'}${p.completion.completed_at ? ` · ${shortDate(p.completion.completed_at)}` : ''}` : 'Not audited'}</span>
              </li>
            ))}</ul>
          ) : <p className="color-fg-muted m-0">No finished pay periods yet.</p>) : <p className="color-fg-muted m-0">This site is no longer on the list.</p>}</div>
        </div>
        <div className="Box">
          <div className="Box-header"><h2 className="Box-title">Work pattern</h2></div>
          <div className="Box-body"><WorkPattern s={s} extra={<div><dt>Auditors</dt><dd>{s.auditors}</dd></div>} /></div>
        </div>
        <div className="Box"><div className="Box-header"><h2 className="Box-title">Flags by question</h2></div><div className="Box-body"><BarList items={s.byQuestion.map((q) => ({ label: q.label, count: q.count }))} total={s.flagged} empty="Nothing flagged in this range." /></div></div>
      </div>
      <div className="Box">
        <div className="Box-header AuditsHeader"><h2 className="Box-title">Audited shifts</h2><span className="Counter">{s.rows.length}</span>{admin ? <span className="f6 color-fg-muted">Excuse a flag to stop it counting. Everyone can see that it was excused, by whom and why.</span> : null}</div>
        <ShiftsTable s={s} canReview={admin} column="employee" />
      </div>
      <div className="NavBar"><a className="btn" href="#/sites"><Icon name="chevron-left" />All sites</a></div>
    </>
  );
}
