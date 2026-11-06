import { useEffect, useMemo, useRef } from 'react';
import { fmtLong, fmtRange, payPeriodAt, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { fmtClock, fmtHours, personKey, titleName, toMinutes } from '../../domain/timeclock/hours.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, plural, useTitle } from '../../components/ui/basics.tsx';
import { useClock, useData, useSession } from '../../app/store/stores.ts';
import { refreshEmployees } from '../../app/runtime/people.ts';
import { action } from '../../app/runtime/actions.ts';
import { loadClockImports, loadClockPeriod, periodKey } from './clock-data.ts';
import { removeImport, submitSchedule } from './clock-submit.ts';
import { ClockNotice, PeriodSelect, usePeriodChoice } from './components.tsx';
import type { ClockShift } from '../../types/audit.ts';

const submitAction = action('submitSchedule', submitSchedule);
const removeAction = action('removeClockImport', removeImport);

const uploadedAt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function SubmitButton() {
  const busy = useClock((s) => s.busy);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn btn-primary" type="button" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
        <Icon name={busy ? 'sync' : 'upload'} />{busy ? 'Reading schedule…' : 'Submit schedule'}
      </button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        tabIndex={-1}
        aria-label="Schedule PDF"
        data-schedule-file=""
        onChange={(ev) => {
          const file = ev.currentTarget.files?.[0];
          ev.currentTarget.value = '';
          if (file) submitAction(file);
        }}
      />
    </>
  );
}

export default function ShiftsPage() {
  useTitle('Shifts');
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const clock = useClock();
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  const { period, options } = usePeriodChoice();
  const shifts = clock.shifts.get(periodKey(period));
  useEffect(() => {
    void loadClockImports();
    if (employees === null && !employeesError) void refreshEmployees();
  }, [employees, employeesError]);
  useEffect(() => {
    if (clock.imports && !clock.importsError) void loadClockPeriod(period);
  }, [clock.imports, clock.importsError, period]);

  const days = useMemo(() => {
    const q = clock.shiftSearch.trim().toLowerCase();
    const map = new Map<string, ClockShift[]>();
    for (const r of shifts || []) {
      if (q && !`${r.employee_name} ${r.site_name}`.toLowerCase().includes(q)) continue;
      map.set(r.work_date, [...(map.get(r.work_date) || []), r]);
    }
    return [...map].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rows]) => [date, rows.sort((a, b) => a.site_name.localeCompare(b.site_name) || a.clock_in.localeCompare(b.clock_in) || a.employee_name.localeCompare(b.employee_name))] as const);
  }, [shifts, clock.shiftSearch]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees || []) for (const n of [e.name, ...(e.aliases || [])]) if (!map.has(personKey(n))) map.set(personKey(n), e.name);
    return map;
  }, [employees]);
  const nameFor = (raw: string) => names.get(personKey(raw)) || titleName(raw);

  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Shifts']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Shifts</h1>
          <p className="PageHeader-description">Clock-in schedules submitted by admins. Everyone sees the same hours on the Time tracking page.</p>
        </div>
        <div className="PageHeader-actions">
          <a className="btn" href="#/time"><Icon name="clock" />Time tracking</a>
          {admin ? <SubmitButton /> : null}
        </div>
      </div>
      {clock.message ? (
        <div className={`flash ClockFlash ${clock.message.ok ? 'flash-success' : 'flash-error'}`} role={clock.message.ok ? 'status' : 'alert'}>
          <Icon name={clock.message.ok ? 'check-circle' : 'alert'} /><span>{clock.message.text}</span>
        </div>
      ) : null}
      <ClockNotice error={clock.importsError} />
      {admin ? (
        <p className="ClockHint"><Icon name="info" />Export the <strong>Employee Worked By Site</strong> report as a PDF and submit it here once per pay period. Submitting dates that already have clock-ins asks before replacing them.</p>
      ) : null}
      <div className="Box">
        <div className="Box-header AuditsHeader">
          <h2 className="Box-title">Submitted schedules</h2><span className="Counter">{clock.imports?.length ?? 0}</span>
        </div>
        {clock.imports === null ? <p className="Box-row color-fg-muted m-0">Loading…</p>
          : clock.imports.length ? clock.imports.map((i) => {
            const first = payPeriodAt(payPeriodIndexFor(i.range_start));
            const last = payPeriodAt(payPeriodIndexFor(i.range_end));
            return (
              <div key={i.id} className="Box-row ImportRow">
                <span className="ImportRow-icon"><Icon name="file" /></span>
                <span className="ImportRow-main">
                  <strong>{fmtRange(i.range_start, i.range_end)}</strong>
                  <span>Pay period #{first.number}{last.index !== first.index ? `–#${last.number}` : ''} · {plural(i.shift_count, 'clock-in')} · {plural(i.employee_count, 'employee')}</span>
                  <span className="ImportRow-meta">{i.file_name || 'Schedule'} · submitted by {i.uploader_name || 'an admin'} on {uploadedAt(i.uploaded_at)}</span>
                </span>
                {admin ? <button className="btn btn-sm btn-danger" type="button" disabled={clock.busy} onClick={() => removeAction(i.id)} aria-label={`Remove the schedule for ${fmtRange(i.range_start, i.range_end)}`}><Icon name="trash" />Remove</button> : null}
              </div>
            );
          }) : <div className="blankslate blankslate--narrow"><p>No schedules yet.{admin ? ' Use “Submit schedule” to upload the first one.' : ' An admin will upload them.'}</p></div>}
      </div>
      {clock.imports?.length ? (
        <div className="Box">
          <div className="Box-header StaffToolbar">
            <h2 className="Box-title">Clock-ins</h2><span className="Counter">{shifts?.length ?? 0}</span>
            <input className="form-control input-sm StaffSearch" type="search" placeholder="Search names or sites" aria-label="Search clock-ins" value={clock.shiftSearch} onChange={(ev) => useClock.setState({ shiftSearch: ev.target.value })} />
            <PeriodSelect period={period} options={options} />
          </div>
          {clock.shiftsError ? <div className="Box-row"><ClockNotice error={clock.shiftsError} /></div>
            : !shifts ? <p className="Box-row color-fg-muted m-0">Loading clock-ins…</p>
              : days.length ? days.map(([date, rows]) => (
                <section key={date} className="ShiftDay" aria-label={fmtLong(date)}>
                  <h3 className="ShiftDay-title">{fmtLong(date)}<span className="Counter">{rows.length}</span></h3>
                  <table className="ClockTable">
                    <thead><tr><th scope="col">Employee</th><th scope="col">Site</th><th scope="col">In</th><th scope="col">Out</th><th scope="col">Hours</th></tr></thead>
                    <tbody>
                      {rows.map((r, n) => (
                        <tr key={r.id ?? n}>
                          <td>{nameFor(r.employee_name)}</td>
                          <td>{r.site_name || '—'}</td>
                          <td>{fmtClock(toMinutes(r.clock_in))}</td>
                          <td>{r.clock_out === '23:59' ? '11:59 PM' : fmtClock(toMinutes(r.clock_out))}</td>
                          <td>{fmtHours(r.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )) : <p className="Box-row color-fg-muted m-0">{clock.shiftSearch ? 'No clock-ins match that search.' : 'No clock-ins in this pay period.'}</p>}
        </div>
      ) : null}
    </>
  );
}
