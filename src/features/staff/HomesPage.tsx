import { useEffect } from 'react';
import { fmtDate, lastPayPeriod } from '../../domain/audits/model.ts';
import { coverage, employeeStats } from '../../domain/employees/stats.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, RateBar, StatTile, percentText, plural, useTitle } from '../../components/ui/basics.tsx';
import { useData, useSession, useStaff } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites, refreshHomes } from '../../app/runtime/people.ts';
import { HOME_SORTS, homeData, watchStaff } from './staff-data.ts';
import { sortHomes } from './staff-actions.ts';
import { StaffNotice } from './StaffNotice.tsx';
import { LoadingStats, SortSelect, StaffRangeSelect, homeHref } from './components.tsx';

const sortAction = action('sortHomes', sortHomes);

export default function HomesPage() {
  useTitle('Sites');
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const homesState = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  useData((s) => s.employees);
  const st = useStaff();
  useEffect(() => {
    watchStaff();
    if (st.findings === null || homesState === null) {
      if (homesState === null && !homesError) void refreshHomes();
    }
  });
  const header = (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Sites']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Sites</h1>
          <p className="PageHeader-description">Audit statistics for every site: flags, staff, coverage and trends.</p>
        </div>
        {admin ? <div className="PageHeader-actions"><a className="btn" href="#/dashboard/sites"><Icon name="pencil" />Manage sites</a></div> : null}
      </div>
    </>
  );
  if (st.findings === null || homesState === null) return <LoadingStats crumbs={<>{header}<StaffNotice /></>} />;
  const { findings, orgRate, byHome } = homeData();
  const lastIndex = lastPayPeriod().index;
  const homes = [...byHome.values()].map((h) => ({ h, s: employeeStats(h.rows, { reviews: st.reviews, orgRate }), cover: h.id ? coverage(st.completions, h.id, lastIndex) : null }));
  type Row = (typeof homes)[number];
  const sorters: Record<string, (a: Row, b: Row) => number> = {
    flagged: (a, b) => b.s.flagged - a.s.flagged || b.s.rate - a.s.rate,
    rate: (a, b) => b.s.rate - a.s.rate || b.s.flagged - a.s.flagged,
    audited: (a, b) => b.s.complete - a.s.complete,
    coverage: (a, b) => (a.cover?.audited ?? 99) - (b.cover?.audited ?? 99),
    name: (a, b) => a.h.name.localeCompare(b.h.name),
  };
  const sorted = [...homes].sort((a, b) => (sorters[st.homeSort] || sorters.flagged)(a, b) || a.h.name.localeCompare(b.h.name));
  const done = findings.filter((f) => f.complete);
  const worst = [...homes].filter((x) => x.s.complete >= 3).sort((a, b) => b.s.rate - a.s.rate)[0];
  const fullyCovered = homes.filter((x) => x.cover && x.cover.audited === x.cover.total && x.cover.total).length;
  return (
    <>
      {header}
      <StaffNotice />
      <div className="StatGrid" data-stagger="">
        <StatTile label="Sites audited" value={homes.filter((x) => x.s.complete).length} sub={`of ${plural(allSites().length, 'site')}`} />
        <StatTile label="Shifts audited" value={done.length} sub={plural(new Set(done.map((f) => f.employee_key)).size, 'staff member')} />
        <StatTile label="Company flag rate" value={orgRate === null ? '—' : percentText(orgRate)} sub="All sites together" />
        <StatTile label="Highest flag rate" value={worst ? worst.h.name : '—'} sub={worst ? `${percentText(worst.s.rate)} of ${plural(worst.s.complete, 'shift')}` : 'Needs 3+ audited shifts'} small />
        <StatTile label="Audited every period" value={`${fullyCovered} of ${homes.filter((x) => x.cover).length}`} sub="Sites audited in each of the last 6 pay periods" />
      </div>
      <div className="Box">
        <div className="Box-header StaffToolbar">
          <h2 className="Box-title">Sites</h2><span className="Counter">{homes.length}</span>
          <span className="StaffSearch" />
          <StaffRangeSelect />
          <SortSelect label="Sort sites" value={st.homeSort} options={HOME_SORTS} onChange={(v) => sortAction(v)} />
        </div>
        {sorted.length ? sorted.map(({ h, s, cover }) => (
          <a key={h.key} className="Box-row Box-row--hover StaffRow" href={homeHref(h.key)}>
            <span className="AuditRow-icon"><Icon name="home" /></span>
            <span className="StaffRow-main">
              <span className="StaffRow-name">{h.name}{h.site ? null : <> <span className="Label">Removed</span></>}</span>
              <span className="StaffRow-meta">{[h.site ? plural(h.site.residents.length, 'individual') : '', s.last ? `Last audited ${fmtDate(s.last)}` : 'No shifts audited yet'].filter(Boolean).join(' · ')}</span>
            </span>
            {s.complete ? (
              <>
                <span className="StaffRow-stat"><strong>{s.complete}</strong><span>audited</span></span>
                <span className={`StaffRow-stat ${s.flagged ? 'is-flagged' : ''}`}><strong>{s.flagged}</strong><span>flagged</span></span>
                <span className="StaffRow-rate"><RateBar rate={s.rate} label={`${percentText(s.rate)} flagged`} /><span>{percentText(s.rate)}</span></span>
              </>
            ) : <span className="StaffRow-empty">No data</span>}
            {cover ? <span className={`StaffRow-stat ${cover.audited < cover.total ? 'is-flagged' : ''}`} title={`Marked audited in ${cover.audited} of the last ${cover.total} pay periods`}><strong>{cover.audited}/{cover.total}</strong><span>periods</span></span> : null}
            <span className="StaffRow-issue">{s.topReasons[0] ? s.topReasons[0].label : s.complete ? <span className="color-fg-success">No issues</span> : null}</span>
            <span className="StaffRow-go"><Icon name="chevron-right" /></span>
          </a>
        )) : <div className="blankslate blankslate--narrow"><p>No sites yet.</p></div>}
      </div>
    </>
  );
}
