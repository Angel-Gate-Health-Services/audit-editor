import { useEffect } from 'react';
import { fmtDate } from '../../domain/audits/model.ts';
import { employeeStats, type EmployeeStats } from '../../domain/employees/stats.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Avatar, Breadcrumbs, RateBar, StatTile, initials, percentText, plural, useTitle } from '../../components/ui/basics.tsx';
import { useData, useSession, useStaff } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { refreshEmployees } from '../../app/runtime/people.ts';
import { STAFF_SORTS, staffData, watchStaff } from './staff-data.ts';
import { sortStaff } from './staff-actions.ts';
import { StaffNotice } from './StaffNotice.tsx';
import { LoadingStats, SortSelect, StaffRangeSelect, employeeHref, unlistedHref } from './components.tsx';
import type { Employee } from '../../types/audit.ts';

const sortAction = action('sortStaff', sortStaff);

type Person = { employee: Employee; s: EmployeeStats };

export default function EmployeesPage() {
  useTitle('Employees');
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  const st = useStaff();
  useEffect(() => {
    watchStaff();
    if (employees === null && !employeesError) void refreshEmployees();
  });
  const header = (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Employees']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Employees</h1>
          <p className="PageHeader-description">Audit statistics for every DSP staff member, from every auditor’s shifts.</p>
        </div>
        {admin ? <div className="PageHeader-actions"><a className="btn" href="#/dashboard/employees"><Icon name="pencil" />Manage list</a></div> : null}
      </div>
    </>
  );
  if (st.findings === null || employees === null) return <LoadingStats crumbs={<>{header}<StaffNotice /></>} />;
  const { findings, grouped, orgRate } = staffData();
  const people: Person[] = employees.map((e) => ({ employee: e, s: employeeStats(grouped.byEmployee.get(e.id) || [], { reviews: st.reviews, orgRate }) }));
  const sorters: Record<string, (a: Person, b: Person) => number> = {
    flagged: (a, b) => b.s.flagged - a.s.flagged || b.s.rate - a.s.rate,
    rate: (a, b) => b.s.rate - a.s.rate || b.s.flagged - a.s.flagged,
    audited: (a, b) => b.s.complete - a.s.complete,
    recent: (a, b) => (b.s.last || '').localeCompare(a.s.last || ''),
    name: (a, b) => a.employee.name.localeCompare(b.employee.name),
  };
  const sorted = [...people].sort((a, b) => (Number(Boolean(b.s.total)) - Number(Boolean(a.s.total))) || (sorters[st.sort] || sorters.flagged)(a, b) || a.employee.name.localeCompare(b.employee.name));
  const done = findings.filter((f) => f.complete);
  const flaggedAll = done.filter((f) => f.flagged && !st.reviews.get(f.id)?.excused);
  const orgStats = employeeStats(findings, { reviews: st.reviews });
  const q = st.search.trim().toLowerCase();
  const match = (key: string) => !q || key.includes(q);
  const shown = sorted.filter((p) => match([p.employee.name, ...(p.employee.aliases || [])].join(' ').toLowerCase())).length;
  const unlisted = [...grouped.unlisted.values()].map((u) => ({ u, s: employeeStats(u.rows, { reviews: st.reviews, orgRate }) })).sort((a, b) => b.s.complete - a.s.complete);
  const unlistedShown = unlisted.filter(({ u }) => match(u.key)).length;
  return (
    <>
      {header}
      <StaffNotice />
      <div className="StatGrid" data-stagger="">
        <StatTile label="Employees audited" value={people.filter((p) => p.s.complete).length + grouped.unlisted.size} sub={`of ${plural(employees.length, 'employee')} on the list`} />
        <StatTile label="Shifts audited" value={done.length} sub={plural(new Set(done.map((f) => f.audit_id)).size, 'audit')} />
        <StatTile label="Company flag rate" value={orgRate === null ? '—' : percentText(orgRate)} sub={plural(flaggedAll.length, 'flagged shift')} />
        <StatTile label="Most common issue" value={orgStats.topReasons[0] ? orgStats.topReasons[0].label : '—'} sub={orgStats.topReasons[0] ? plural(orgStats.topReasons[0].count, 'time') : 'Nothing flagged yet'} small />
      </div>
      <div className="Box">
        <div className="Box-header StaffToolbar">
          <h2 className="Box-title">Staff</h2><span className="Counter">{people.length}</span>
          <input className="form-control input-sm StaffSearch" type="search" placeholder="Search names" aria-label="Search employees" data-staff-search="" value={st.search} onChange={(ev) => useStaff.setState({ search: ev.target.value })} />
          <StaffRangeSelect />
          <SortSelect label="Sort employees" value={st.sort} options={STAFF_SORTS} onChange={(v) => sortAction(v)} />
        </div>
        {sorted.length ? sorted.map(({ employee: e, s }) => (
          <a key={e.id} className="Box-row Box-row--hover StaffRow" href={employeeHref(e)} data-staff-name={[e.name, ...(e.aliases || [])].join(' ').toLowerCase()} hidden={!match([e.name, ...(e.aliases || [])].join(' ').toLowerCase())}>
            <Avatar kind="employees" id={e.id} name={e.name} />
            <span className="StaffRow-main">
              <span className="StaffRow-name">{e.name}{e.active ? null : <> <span className="Label">Inactive</span></>}</span>
              <span className="StaffRow-meta">{[e.title || '', s.last ? `Last audited ${fmtDate(s.last)}` : 'No shifts audited yet'].filter(Boolean).join(' · ')}</span>
            </span>
            {s.complete ? (
              <>
                <span className="StaffRow-stat"><strong>{s.complete}</strong><span>audited</span></span>
                <span className={`StaffRow-stat ${s.flagged ? 'is-flagged' : ''}`}><strong>{s.flagged}</strong><span>flagged</span></span>
                <span className="StaffRow-rate"><RateBar rate={s.rate} label={`${percentText(s.rate)} flagged`} /><span>{percentText(s.rate)}</span></span>
                <span className="StaffRow-issue">{s.topReasons[0] ? s.topReasons[0].label : <span className="color-fg-success">No issues</span>}</span>
              </>
            ) : <span className="StaffRow-empty">No data</span>}
            <span className="StaffRow-go"><Icon name="chevron-right" /></span>
          </a>
        )) : <div className="blankslate blankslate--narrow"><p>No employees on the list yet.{admin ? ' Add them in the admin dashboard.' : ''}</p></div>}
        <p className="Box-row StaffEmpty" hidden={shown + unlistedShown > 0 || !q}>No employees match that search.</p>
      </div>
      {unlisted.length ? (
        <div className="Box">
          <div className="Box-header AuditsHeader"><h2 className="Box-title">Not on the employee list</h2><span className="Counter">{unlisted.length}</span>
            <span className="f6 color-fg-muted">Names typed as a shift author that don’t match anyone on the list.{admin ? ' Open one to add it, or count it as another spelling of someone.' : ''}</span></div>
          {unlisted.map(({ u, s }) => (
            <a key={u.key} className="Box-row Box-row--hover StaffRow" href={unlistedHref(u.key)} data-staff-name={u.key} hidden={!match(u.key)}>
              <span className="InitialsAvatar">{initials(u.name)}</span>
              <span className="StaffRow-main"><span className="StaffRow-name">{u.name}</span><span className="StaffRow-meta">{s.last ? `Last audited ${fmtDate(s.last)}` : 'In progress'}</span></span>
              <span className="StaffRow-stat"><strong>{s.complete}</strong><span>audited</span></span>
              <span className={`StaffRow-stat ${s.flagged ? 'is-flagged' : ''}`}><strong>{s.flagged}</strong><span>flagged</span></span>
              <span className="StaffRow-rate"><RateBar rate={s.rate} label={`${percentText(s.rate)} flagged`} /><span>{percentText(s.rate)}</span></span>
              <span className="StaffRow-issue">{s.topReasons[0] ? s.topReasons[0].label : ''}</span>
              <span className="StaffRow-go"><Icon name="chevron-right" /></span>
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
}
