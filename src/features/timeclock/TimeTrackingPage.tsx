import { useEffect, useMemo } from 'react';
import { fmtDate, fmtRange, fmtShort } from '../../domain/audits/model.ts';
import {
  DEFAULT_LOW_HOURS, LOW_HOUR_OPTIONS, MISMATCH_LABELS, documentationMismatches, fmtClock, fmtHours, hoursForPeriod, personKey, toMinutes,
  type EmployeeHours, type Mismatch,
} from '../../domain/timeclock/hours.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, StatTile, plural, useTitle } from '../../components/ui/basics.tsx';
import { useClock, useData, useSession, useStaff } from '../../app/store/stores.ts';
import { allSites, refreshEmployees, refreshHomes } from '../../app/runtime/people.ts';
import { loadStaff } from '../staff/staff-data.ts';
import { SortSelect, employeeHref, unlistedHref } from '../staff/components.tsx';
import { importsFor, loadClockImports, loadClockPeriod, periodKey } from './clock-data.ts';
import { ClockNotice, PeriodSelect, usePeriodChoice } from './components.tsx';

const SORTS = [['name', 'Name (A–Z)'], ['most', 'Most hours'], ['overtime', 'Most overtime'], ['fewest', 'Fewest hours'], ['issues', 'Most mismatches']] as const;

const VIEWS = [['all', 'Everyone'], ['overtime', 'Overtime'], ['low', 'Low hours'], ['mismatch', 'Doesn’t match documentation']] as const;

const hoursText = (minutes: number) => `${fmtHours(minutes)} h`;

const personHref = (p: { employee: EmployeeHours['employee']; name: string }) => (p.employee ? employeeHref(p.employee) : unlistedHref(personKey(p.name)));

function WeekCell({ minutes, covered, lowHours }: { minutes: number; covered: boolean; lowHours: number }) {
  const over = minutes > 40 * 60;
  const low = covered && minutes < lowHours * 60;
  return (
    <span className={`HoursCell ${over ? 'is-over' : low ? 'is-low' : ''} ${covered ? '' : 'is-partial'}`}>
      <strong>{fmtHours(minutes)}</strong><span>{covered ? 'h' : 'h · partial'}</span>
    </span>
  );
}

function PersonDetail({ person, mismatches }: { person: EmployeeHours; mismatches: Mismatch[] }) {
  const rows = [...person.rows].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.clock_in.localeCompare(b.clock_in));
  return (
    <div className="ClockDetail" id={`clock-${person.key}`}>
      {mismatches.length ? (
        <ul className="ClockDetail-alerts">
          {mismatches.map((m) => <li key={m.id}><span className="Label Label--danger">{MISMATCH_LABELS[m.kind]}</span><span>{m.date ? `${fmtDate(m.date)} · ` : ''}{m.detail}</span></li>)}
        </ul>
      ) : null}
      {rows.length ? (
        <table className="ClockTable">
          <caption className="sr-only">Clock-ins for {person.name}</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">In</th><th scope="col">Out</th><th scope="col">Hours</th><th scope="col">Site</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i}>
                <td>{fmtDate(r.work_date)}</td>
                <td>{fmtClock(toMinutes(r.clock_in))}</td>
                <td>{r.clock_out === '23:59' ? '11:59 PM' : fmtClock(toMinutes(r.clock_out))}</td>
                <td>{fmtHours(r.minutes)}</td>
                <td>{r.site_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="color-fg-muted m-0">No clock-ins this pay period.</p>}
      <a className="btn btn-sm" href={personHref(person)}>Open employee page <Icon name="arrow-right" /></a>
    </div>
  );
}

export default function TimeTrackingPage() {
  useTitle('Time tracking');
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const clock = useClock();
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  const homes = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  const findings = useStaff((s) => s.findings);
  const { period, options } = usePeriodChoice();
  const key = periodKey(period);
  const shifts = clock.shifts.get(key);
  useEffect(() => {
    void loadClockImports();
    void loadStaff();
    if (employees === null && !employeesError) void refreshEmployees();
    if (homes === null && !homesError) void refreshHomes();
  }, [employees, employeesError, homes, homesError]);
  useEffect(() => {
    if (clock.imports && !clock.importsError) void loadClockPeriod(period);
  }, [clock.imports, clock.importsError, period]);

  const periodImports = useMemo(() => importsFor(period, clock.imports), [period, clock.imports]);
  const sites = useMemo(() => (homes ? allSites() : []), [homes]);
  const lowHours = clock.lowHours || DEFAULT_LOW_HOURS;
  const summary = useMemo(
    () => (shifts ? hoursForPeriod({ period, shifts, imports: periodImports, employees: employees || [], homes: sites, lowHours }) : null),
    [period, shifts, periodImports, employees, sites, lowHours],
  );
  const mismatches = useMemo(() => {
    if (!shifts || !findings) return [];
    const inPeriod = findings.filter((f) => (f.shift_date ? f.shift_date >= period.start && f.shift_date <= period.end : f.pay_period_start === period.start));
    return documentationMismatches({ findings: inPeriod, shifts, imports: periodImports, employees: employees || [], homes: sites });
  }, [shifts, findings, period, periodImports, employees, sites]);

  const header = (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Time tracking']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Time tracking</h1>
          <p className="PageHeader-description">Hours from the clock-in schedule: who worked overtime, who is short on hours, and documentation that doesn’t match the clock.</p>
        </div>
        <div className="PageHeader-actions"><a className="btn" href="#/shifts"><Icon name="calendar" />{admin ? 'Shifts & uploads' : 'See shifts'}</a></div>
      </div>
    </>
  );

  if (clock.importsError) return <>{header}<ClockNotice error={clock.importsError} /></>;
  if (clock.imports === null) return <>{header}<div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Loading clock-in data…</p></div></div></>;
  if (!clock.imports.length) {
    return (
      <>
        {header}
        <div className="Box"><div className="blankslate">
          <span className="blankslate-icon"><Icon name="clock" size={24} /></span>
          <h2 className="blankslate-heading">No clock-in data yet</h2>
          <p>{admin ? 'Submit the “Employee Worked By Site” report on the Shifts page and everyone’s hours will show up here.' : 'An admin needs to submit the clock-in schedule first.'}</p>
          {admin ? <a className="btn btn-primary" href="#/shifts"><Icon name="upload" />Submit schedule</a> : null}
        </div></div>
      </>
    );
  }

  const toolbar = (
    <div className="ClockToolbar">
      <PeriodSelect period={period} options={options} />
      <SortSelect label="Sort employees" value={clock.sort} options={SORTS} onChange={(v) => useClock.setState({ sort: v })} />
      <label className="SortMenu">
        <span className="SortMenu-label"><Icon name="clock" size={14} />Low hours</span>
        <select className="form-select select-sm" aria-label="Low hours threshold" value={lowHours} onChange={(ev) => useClock.setState({ lowHours: Number(ev.target.value) })}>
          {LOW_HOUR_OPTIONS.map((h) => <option key={h} value={h}>Under {h} h a week</option>)}
        </select>
      </label>
    </div>
  );

  if (!summary || clock.shiftsError) {
    return <>{header}{toolbar}{clock.shiftsError ? <ClockNotice error={clock.shiftsError} /> : <div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Loading hours…</p></div></div>}</>;
  }

  const { people, weeks } = summary;
  const worked = people.filter((p) => !p.noClock);
  const overtime = people.filter((p) => p.overtime > 0);
  const low = people.filter((p) => p.low);
  const byPerson = new Map<string, Mismatch[]>();
  for (const m of mismatches) byPerson.set(m.personKey, [...(byPerson.get(m.personKey) || []), m]);
  const known = new Set(people.map((p) => p.key));
  const q = clock.search.trim().toLowerCase();
  const issuesOf = (p: EmployeeHours) => byPerson.get(p.key)?.length || 0;
  const sorters: Record<string, (a: EmployeeHours, b: EmployeeHours) => number> = {
    most: (a, b) => b.minutes - a.minutes,
    overtime: (a, b) => b.overtime - a.overtime || b.minutes - a.minutes,
    fewest: (a, b) => a.minutes - b.minutes,
    issues: (a, b) => issuesOf(b) - issuesOf(a),
  };
  const ordered = sorters[clock.sort] ? [...people].sort((a, b) => sorters[clock.sort](a, b) || a.name.localeCompare(b.name)) : people;
  const visible = ordered.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (clock.view === 'overtime') return p.overtime > 0;
    if (clock.view === 'low') return p.low;
    if (clock.view === 'mismatch') return byPerson.has(p.key);
    return true;
  });
  const totalMinutes = worked.reduce((sum, p) => sum + p.minutes, 0);
  const overtimeMinutes = overtime.reduce((sum, p) => sum + p.overtime, 0);
  const counts: Record<string, number> = { all: people.length, overtime: overtime.length, low: low.length, mismatch: [...byPerson.keys()].filter((k) => known.has(k)).length };
  const partial = weeks.some((w) => !w.covered);
  const unmatched = mismatches.filter((m) => !known.has(m.personKey));

  return (
    <>
      {header}
      {toolbar}
      {partial ? <div className="flash flash-warn" role="status"><Icon name="info" /><span>Clock-in data covers only part of this pay period ({periodImports.map((i) => fmtRange(i.range_start, i.range_end)).join(', ')}). Weeks without full data aren’t marked as low hours.</span></div> : null}
      <div className="StatGrid" data-stagger="">
        <StatTile label="Hours worked" value={fmtHours(totalMinutes)} sub={`${plural(worked.length, 'employee')} clocked in`} />
        <StatTile label="Overtime" value={overtime.length} sub={overtime.length ? `${hoursText(overtimeMinutes)} over 40 h in a week` : 'Nobody over 40 h in a week'} />
        <StatTile label="Low hours" value={low.length} sub={`Under ${lowHours} h in a full week`} />
        <StatTile label="Documentation mismatches" value={mismatches.length} sub={findings === null ? 'Loading audited shifts…' : `${plural(byPerson.size, 'employee')} affected`} />
      </div>
      <div className="Box">
        <div className="Box-header ClockHeader">
          <h2 className="Box-title">Hours by employee</h2>
          <div className="ClockViews" role="group" aria-label="Show">
            {VIEWS.map(([v, label]) => (
              <button key={v} type="button" className={`ClockView ${clock.view === v ? 'is-selected' : ''}`} aria-pressed={clock.view === v} onClick={() => useClock.setState({ view: v, open: null })}>
                {label}<span className="Counter">{counts[v]}</span>
              </button>
            ))}
          </div>
          <input className="form-control input-sm StaffSearch" type="search" placeholder="Search names" aria-label="Search employees" value={clock.search} onChange={(ev) => useClock.setState({ search: ev.target.value })} />
        </div>
        <div className="ClockRow ClockRow--head" aria-hidden="true">
          <span>Employee</span>
          {weeks.map((w, i) => <span key={w.start} className="ClockRow-num">Week {i + 1}<small>{fmtShort(w.start)}–{fmtShort(w.end)}</small></span>)}
          <span className="ClockRow-num">Total</span>
          <span>Status</span>
        </div>
        {visible.length ? visible.map((p) => {
          const open = clock.open === p.key;
          const issues = byPerson.get(p.key) || [];
          return (
            <div key={p.key} className={`ClockPerson ${open ? 'is-open' : ''}`}>
              <button type="button" className="ClockRow" aria-expanded={open} aria-controls={`clock-${p.key}`} onClick={() => useClock.setState({ open: open ? null : p.key })}>
                <span className="ClockRow-name">
                  <strong>{p.name}</strong>
                  <span>{p.noClock ? 'No clock-ins this pay period' : `${plural(p.days, 'day')} · ${p.sites.slice(0, 2).map((s) => s.site).join(', ')}${p.sites.length > 2 ? ` +${p.sites.length - 2}` : ''}`}{p.employee ? '' : ' · Not on the employee list'}</span>
                </span>
                {p.weeks.map((w) => <WeekCell key={w.start} minutes={w.minutes} covered={w.covered} lowHours={lowHours} />)}
                <span className="HoursCell HoursCell--total"><strong>{fmtHours(p.minutes)}</strong><span>h</span></span>
                <span className="ClockRow-tags">
                  {p.overtime ? <span className="Label Label--attention">Overtime +{hoursText(p.overtime)}</span> : null}
                  {p.low ? <span className="Label Label--accent">Low hours</span> : null}
                  {issues.length ? <span className="Label Label--danger">{plural(issues.length, 'mismatch')}</span> : null}
                  {p.longest >= 16 * 60 ? <span className="Label">{fmtHours(p.longest)} h straight</span> : null}
                  {!p.overtime && !p.low && !issues.length && p.longest < 16 * 60 ? <span className="Label Label--success">OK</span> : null}
                </span>
                <span className="ClockRow-go" aria-hidden="true"><Icon name="chevron-down" /></span>
              </button>
              {open ? <PersonDetail person={p} mismatches={issues} /> : null}
            </div>
          );
        }) : <p className="Box-row color-fg-muted m-0">{q ? 'No employees match that search.' : clock.view === 'all' ? 'No hours for this pay period.' : 'Nobody in this group for this pay period.'}</p>}
      </div>
      <div className="Box">
        <div className="Box-header AuditsHeader">
          <h2 className="Box-title">Documentation vs. clock-ins</h2><span className="Counter">{mismatches.length}</span>
          <span className="f6 color-fg-muted">Audited shifts where the employee wasn’t clocked in, was clocked in at another site, or the times don’t match (more than 15 minutes off).</span>
        </div>
        {findings === null ? <p className="Box-row color-fg-muted m-0">Loading audited shifts…</p>
          : mismatches.length ? mismatches.map((m) => (
            <div key={m.id} className="Box-row MismatchRow">
              <span className={`Label ${m.kind === 'off-hours' ? 'Label--attention' : 'Label--danger'}`}>{MISMATCH_LABELS[m.kind]}</span>
              <span className="MismatchRow-main">
                <strong>{m.person}</strong> · {m.homeName}{m.date ? ` · ${fmtDate(m.date)}` : ''}
                <span className="MismatchRow-detail">{m.detail}</span>
              </span>
              <span className="MismatchRow-compare">
                <span><small>Documented</small>{m.documented}</span>
                <span><small>Clocked</small>{m.clocked}</span>
              </span>
            </div>
          )) : <p className="Box-row color-fg-success m-0"><Icon name="check-circle" /> Every audited shift in this pay period matches the clock-in data.</p>}
        {unmatched.length ? <p className="Box-row f6 color-fg-muted m-0">{plural(unmatched.length, 'mismatch')} belong to names that aren’t in the clock-in data at all. Check the spelling on the employee list or add an alias.</p> : null}
      </div>
    </>
  );
}
