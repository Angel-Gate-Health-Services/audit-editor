import { useEffect, useMemo } from 'react';
import { fmtRange, fmtShort } from '../../domain/audits/model.ts';
import {
  DEFAULT_LOW_HOURS, MISMATCH_LABELS, clockChecks, fmtHours, hoursForPeriod, personKey, type ClockCheck, type EmployeeHours,
} from '../../domain/timeclock/hours.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { StatTile } from '../../components/ui/basics.tsx';
import { useClock, useData } from '../../app/store/stores.ts';
import { allSites } from '../../app/runtime/people.ts';
import { importsFor, loadClockForPeople, loadClockImports, peopleCacheKey, periodsWithData } from './clock-data.ts';
import type { Employee, Finding, PayPeriod } from '../../types/audit.ts';

const MAX_PERIODS = 6;

export interface PeriodHours {
  period: PayPeriod;
  hours: EmployeeHours | null;
  partial: boolean;
}

export function useEmployeeClock(employee: Employee | null, name: string, findings: Finding[]) {
  const imports = useClock((s) => s.imports);
  const importsError = useClock((s) => s.importsError);
  const people = useClock((s) => s.people);
  const peopleError = useClock((s) => s.peopleError);
  const lowHours = useClock((s) => s.lowHours) || DEFAULT_LOW_HOURS;
  const homes = useData((s) => s.homes);
  const keys = useMemo(() => {
    const names = employee ? [employee.name, ...(employee.aliases || [])] : [name];
    return [...new Set(names.map(personKey).filter(Boolean))];
  }, [employee, name]);
  const cacheKey = peopleCacheKey(keys);
  useEffect(() => {
    void loadClockImports();
  }, []);
  useEffect(() => {
    if (imports?.length && !importsError) void loadClockForPeople(keys);
  }, [imports, importsError, keys]);
  const rows = people.get(cacheKey) || null;
  const sites = useMemo(() => (homes ? allSites() : []), [homes]);
  const periods = useMemo<PeriodHours[]>(() => {
    if (!rows || !imports) return [];
    return periodsWithData(imports).slice(0, MAX_PERIODS).map((period) => {
      const periodImports = importsFor(period, imports);
      const mine = rows.filter((r) => r.work_date >= period.start && r.work_date <= period.end);
      const { people: list, weeks } = hoursForPeriod({ period, shifts: mine, imports: periodImports, employees: employee?.active ? [employee] : [], homes: sites, lowHours });
      return { period, hours: list[0] || null, partial: weeks.some((w) => !w.covered) };
    });
  }, [rows, imports, employee, sites, lowHours]);
  const checks = useMemo(() => {
    const map = new Map<string, ClockCheck>();
    if (!rows || !imports) return map;
    const list = clockChecks({ findings, shifts: rows, imports, employees: employee ? [employee] : [], homes: sites });
    for (const c of list) map.set(c.id, c);
    return map;
  }, [rows, imports, findings, employee, sites]);
  const ready = imports !== null && (Boolean(importsError) || !imports.length || rows !== null);
  return { imports, error: importsError || peopleError, rows, periods, checks, ready, lowHours };
}

export function HoursTile({ clock }: { clock: ReturnType<typeof useEmployeeClock> }) {
  if (!clock.imports?.length || clock.error) return null;
  const latest = clock.periods.find((p) => p.hours && !p.hours.noClock);
  if (!clock.rows) return <StatTile label="Hours worked" value="…" sub="Loading clock-ins" />;
  if (!latest?.hours) return <StatTile label="Hours worked" value="0" sub="No clock-ins in uploaded schedules" />;
  const h = latest.hours;
  return (
    <StatTile
      label="Hours worked"
      value={`${fmtHours(h.minutes)} h`}
      sub={`Pay period #${latest.period.number}${h.overtime ? ` · +${fmtHours(h.overtime)} h overtime` : h.low ? ' · low hours' : ''}`}
    />
  );
}

function Status({ h, partial, lowHours }: { h: EmployeeHours | null; partial: boolean; lowHours: number }) {
  if (!h || h.noClock) return <span className="Label">No clock-ins</span>;
  return (
    <span className="ClockRow-tags">
      {h.overtime ? <span className="Label Label--attention">Overtime +{fmtHours(h.overtime)} h</span> : null}
      {h.low ? <span className="Label Label--accent">Under {lowHours} h a week</span> : null}
      {h.longest >= 16 * 60 ? <span className="Label">{fmtHours(h.longest)} h straight</span> : null}
      {!h.overtime && !h.low && h.longest < 16 * 60 ? <span className="Label Label--success">OK</span> : null}
      {partial ? <span className="Label">Partial data</span> : null}
    </span>
  );
}

export function HoursBox({ clock, checks }: { clock: ReturnType<typeof useEmployeeClock>; checks: Map<string, ClockCheck> }) {
  if (!clock.imports) return null;
  const header = (
    <div className="Box-header AuditsHeader">
      <h2 className="Box-title"><Icon name="clock" />Hours worked</h2>
      <span className="f6 color-fg-muted">From the clock-in schedules admins submit. Overtime is over 40 hours in a Sunday–Saturday week.</span>
      <a className="btn btn-sm EmployeeHours-link" href="#/time">Time tracking <Icon name="arrow-right" /></a>
    </div>
  );
  if (clock.error) return <div className="Box">{header}<p className="Box-row color-fg-muted m-0">{clock.error === 'missing-table' ? 'Clock-in tracking isn’t set up yet.' : `Couldn’t load clock-ins: ${clock.error}`}</p></div>;
  if (!clock.imports.length) return <div className="Box">{header}<p className="Box-row color-fg-muted m-0">No clock-in schedules have been submitted yet.</p></div>;
  if (!clock.rows) return <div className="Box">{header}<p className="Box-row color-fg-muted m-0">Loading clock-ins…</p></div>;
  const all = [...checks.values()];
  const matched = all.filter((c) => c.kind === 'match').length;
  const mismatched = all.length - matched;
  return (
    <div className="Box EmployeeHours">
      {header}
      <div className="TableScroll">
        <table className="DataTable HoursTable">
          <thead><tr><th scope="col">Pay period</th><th scope="col" className="is-num">Week 1</th><th scope="col" className="is-num">Week 2</th><th scope="col" className="is-num">Total</th><th scope="col">Days · sites</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {clock.periods.map(({ period, hours, partial }) => (
              <tr key={period.index}>
                <th scope="row"><strong>#{period.number}</strong><span className="HoursTable-sub">{fmtRange(period.start, period.end)}</span></th>
                {[0, 1].map((w) => {
                  const week = hours?.weeks[w];
                  const over = week && week.minutes > 40 * 60;
                  const low = week && week.covered && week.minutes < clock.lowHours * 60;
                  return (
                    <td key={w} className="is-num">
                      <span className={`HoursCell ${over ? 'is-over' : low ? 'is-low' : ''} ${week?.covered === false ? 'is-partial' : ''}`}>
                        <strong>{fmtHours(week?.minutes || 0)}</strong><span>h</span>
                      </span>
                      {week ? <span className="HoursTable-sub">{fmtShort(week.start)}–{fmtShort(week.end)}</span> : null}
                    </td>
                  );
                })}
                <td className="is-num"><span className="HoursCell HoursCell--total"><strong>{fmtHours(hours?.minutes || 0)}</strong><span>h</span></span></td>
                <td>{hours && !hours.noClock ? <>{hours.days} days<span className="HoursTable-sub">{hours.sites.map((x) => `${x.site} ${fmtHours(x.minutes)} h`).join(' · ')}</span></> : '—'}</td>
                <td><Status h={hours} partial={partial} lowHours={clock.lowHours} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {all.length ? (
        <p className="Box-row f6 m-0 EmployeeHours-summary">
          <Icon name={mismatched ? 'alert' : 'check-circle'} />
          {matched} audited {matched === 1 ? 'shift matches' : 'shifts match'} the clock-ins{mismatched ? `; ${mismatched} ${mismatched === 1 ? 'doesn’t' : 'don’t'}. See the Clock-in column below.` : '.'}
        </p>
      ) : null}
    </div>
  );
}

export function ClockCell({ check }: { check: ClockCheck | undefined }) {
  if (!check) return <span className="color-fg-muted">No clock data</span>;
  if (check.kind === 'match') {
    return <span className="ClockMatch is-match" title={check.detail}><Icon name="check-circle" size={14} />{check.clocked}</span>;
  }
  return (
    <span className="ClockMatch" title={check.detail}>
      <span className={`Label ${check.kind === 'off-hours' ? 'Label--attention' : 'Label--danger'}`}>{MISMATCH_LABELS[check.kind]}</span>
      <span className="ClockMatch-detail">{check.clocked}</span>
    </span>
  );
}
