import { useEffect } from 'react';
import { useParams } from 'react-router';
import { fmtDate, fmtLong } from '../../domain/audits/model.ts';
import { employeeIndex, employeeStats, nameKey, summarize } from '../../domain/employees/stats.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Avatar, Breadcrumbs, RateBar, StatTile, initials, percentText, plural, useTitle } from '../../components/ui/basics.tsx';
import { useData, useSession, useStaff } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites, refreshEmployees } from '../../app/runtime/people.ts';
import { navigateHash } from '../../app/navigation/navigator.ts';
import { MissingPage } from '../../app/shell/pages.tsx';
import type { Finding } from '../../types/audit.ts';
import { staffData, watchStaff } from './staff-data.ts';
import { addUnlistedEmployee, aliasUnlisted, editEmployeeProfile } from './staff-actions.ts';
import { StaffNotice } from './StaffNotice.tsx';
import { ClockCell, HoursBox, HoursTile, useEmployeeClock } from '../timeclock/EmployeeHours.tsx';
import {
  BarList, EmployeeEditForm, EmployeeNotesBox, LoadingStats, ShiftsTable, StaffMessage, StaffRangeSelect, TrendChart, WorkPattern, employeeHref, homeHref,
} from './components.tsx';

const NO_ROWS: Finding[] = [];

const edit = action('editEmployeeProfile', editEmployeeProfile);
const addUnlisted = action('addUnlistedEmployee', addUnlistedEmployee);
const alias = action('aliasUnlisted', aliasUnlisted);

export default function EmployeePage() {
  const params = useParams();
  const unlistedKey = params.key !== undefined ? nameKey(params.key) : null;
  const id = params.id || null;
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  useData((s) => s.homes);
  const st = useStaff();
  useEffect(() => {
    watchStaff();
    if (employees === null && !employeesError) void refreshEmployees();
  });
  const ready = st.findings !== null && employees !== null;
  const { grouped, orgRate } = ready ? staffData() : { grouped: null, orgRate: null };
  const employee = ready && !unlistedKey ? employees.find((e) => e.id === id) || null : null;
  const unlisted = ready && unlistedKey
    ? grouped!.unlisted.get(unlistedKey) || (employeeIndex(employees).get(unlistedKey) ? null : { key: unlistedKey, name: unlistedKey, rows: [] })
    : null;
  const redirect = ready && unlistedKey && !unlisted ? employeeIndex(employees).get(unlistedKey) : null;
  useEffect(() => {
    if (redirect) navigateHash(employeeHref(redirect), { replace: true });
  }, [redirect]);
  const name = employee?.name || unlisted?.name || '';
  const statsRows = ready && (employee || unlisted) ? (employee ? grouped!.byEmployee.get(employee.id) || [] : unlisted!.rows) : NO_ROWS;
  const clock = useEmployeeClock(employee, name, statsRows);
  useTitle(!ready ? 'Employee' : name ? `${name} · Employees` : 'Not found');
  if (!ready) return <LoadingStats crumbs={<><Breadcrumbs items={[['Home', '#/'], ['Employees', '#/employees'], ['…']]} remember /><StaffNotice /></>} />;
  if (redirect) return null;
  if (!employee && !unlisted) return <MissingPage />;
  const s = employeeStats(statsRows, { reviews: st.reviews, orgRate });
  const home = employee?.primary_home_id ? allSites().find((h) => h.id === employee.primary_home_id) : null;
  const facts = employee ? [
    employee.title ? <><Icon name="person" size={14} />{employee.title}</> : null,
    employee.hire_date ? <><Icon name="calendar" size={14} />Started {fmtLong(employee.hire_date)}</> : null,
    home ? <><Icon name="home" size={14} />Mainly at {home.name}</> : null,
    employee.aliases?.length ? <><Icon name="note" size={14} />Also recorded as {employee.aliases.join(', ')}</> : null,
  ].filter(Boolean) : [];
  const vsCompany = s.complete && orgRate !== null ? (s.rate > orgRate + 0.05 ? `${percentText(s.rate - orgRate)} above the company` : s.rate < orgRate - 0.05 ? `${percentText(orgRate - s.rate)} below the company` : 'About the company average') : '—';
  const editing = Boolean(employee && admin && st.editing === employee.id && st.draft);
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Employees', '#/employees'], [name]]} remember />
      <StaffNotice />
      <StaffMessage />
      <div className="EmployeeHero">
        {employee ? <Avatar kind="employees" id={employee.id} name={name} className="InitialsAvatar--hero" /> : <span className="InitialsAvatar InitialsAvatar--hero">{initials(name)}</span>}
        <div className="EmployeeHero-main">
          <h1 className="EmployeeHero-name">{name}</h1>
          <div className="EmployeeHero-labels">
            {employee ? (employee.active ? <span className="Label Label--success">Active</span> : <span className="Label">Inactive</span>) : <span className="Label Label--attention">Not on the employee list</span>}
            {s.streak >= 2 ? <span className="Label Label--danger"><Icon name="alert" size={12} />Flagged {s.streak} pay periods in a row</span> : null}
          </div>
          {facts.length ? <p className="EmployeeHero-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</p> : null}
        </div>
        <div className="EmployeeHero-actions">
          <StaffRangeSelect />
          {employee && admin && !editing ? <button className="btn" onClick={() => edit(employee.id)}><Icon name="pencil" />Edit</button> : null}
        </div>
      </div>
      {unlisted && admin ? (
        <div className="flash flash-warn UnlistedActions"><Icon name="alert" />
          <div className="flex-1"><strong>{name} isn’t on the employee list.</strong> Add them, or count these shifts as another spelling of someone who is.</div>
          <div className="UnlistedActions-buttons">
            <button className="btn btn-sm btn-primary" disabled={st.busy} onClick={() => addUnlisted(name)}><Icon name="plus" />Add to list</button>
            <select className="form-select select-sm" aria-label="Count as another spelling of" defaultValue="" onChange={(ev) => alias(name, ev.currentTarget)}>
              <option value="">Another spelling of…</option>
              {(employees || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
      ) : null}
      {editing && employee ? <EmployeeEditForm e={employee} /> : null}
      <div className="Box SummaryBox">
        <div className="Box-header AuditsHeader"><h2 className="Box-title"><Icon name="note" />Summary</h2><span className="f6 color-fg-muted">Written from the numbers below and kept up to date as audits change.</span></div>
        <div className="Box-body"><p className="SummaryBox-text">{summarize(name, s)}</p></div>
      </div>
      <div className="StatGrid" data-stagger="">
        <StatTile label="Shifts audited" value={s.complete} sub={s.inProgress ? `${s.inProgress} more in progress` : plural(s.auditors, 'auditor')} />
        <StatTile label="Flagged shifts" value={s.flagged} sub={s.excused ? `${s.excused} excused` : `${s.clean} with no issues`} />
        <StatTile label="Flag rate" value={s.complete ? percentText(s.rate) : '—'} sub={vsCompany} />
        <StatTile label="Sites" value={s.homes.length} sub={s.homes[0] ? `Most at ${s.homes[0].name}` : '—'} />
        <StatTile label="Pay periods" value={s.periods.length} sub={s.streak >= 2 ? `Flagged ${s.streak} in a row` : s.periods.length ? `Since #${s.periods[0].period.number}` : '—'} />
        <StatTile label="Last audited" value={s.last ? fmtDate(s.last) : '—'} sub={s.first && s.first !== s.last ? `First ${fmtDate(s.first)}` : ''} small />
        <HoursTile clock={clock} />
      </div>
      <HoursBox clock={clock} checks={clock.checks} />
      <div className="EmployeeGrid" data-stagger="">
        <div className="Box"><div className="Box-header"><h2 className="Box-title">Most flagged for</h2></div><div className="Box-body"><BarList items={s.topReasons.slice(0, 7)} total={s.flagged} empty="Nothing flagged in this range." /></div></div>
        <div className="Box"><div className="Box-header"><h2 className="Box-title">Flag rate by pay period</h2></div><div className="Box-body"><TrendChart s={s} /></div></div>
        <div className="Box">
          <div className="Box-header"><h2 className="Box-title">Sites worked</h2></div>
          <div className="Box-body">{s.homes.length ? (
            <ul className="HomeStats">{s.homes.map((h) => (
              <li key={h.id || h.name}><span className="HomeStats-name">{h.id ? <a href={homeHref(h.id)}>{h.name}</a> : h.name}</span><span className="HomeStats-count">{plural(h.shifts, 'shift')}</span>
                <span className="StaffRow-rate"><RateBar rate={h.flagged / h.shifts} label={`${percentText(h.flagged / h.shifts)} flagged at ${h.name}`} /><span>{percentText(h.flagged / h.shifts)} flagged</span></span></li>
            ))}</ul>
          ) : <p className="color-fg-muted m-0">No sites yet.</p>}</div>
        </div>
        <div className="Box">
          <div className="Box-header"><h2 className="Box-title">Work pattern</h2></div>
          <div className="Box-body"><WorkPattern s={s} extra={<div><dt>Flagged by question</dt><dd>{s.byQuestion.length ? s.byQuestion.map((q) => `${q.label} ${q.count}`).join(' · ') : '—'}</dd></div>} /></div>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header AuditsHeader"><h2 className="Box-title">Audited shifts</h2><span className="Counter">{s.rows.length}</span>{admin ? <span className="f6 color-fg-muted">Excuse a flag to stop it counting against them. Everyone can see that it was excused, by whom and why.</span> : null}</div>
        <ShiftsTable s={s} canReview={admin} clockCell={clock.imports?.length && clock.rows ? (f) => <ClockCell check={clock.checks.get(f.id)} /> : undefined} />
      </div>
      {employee ? <EmployeeNotesBox e={employee} /> : null}
      <div className="NavBar"><a className="btn" href="#/employees"><Icon name="chevron-left" />All employees</a></div>
    </>
  );
}
