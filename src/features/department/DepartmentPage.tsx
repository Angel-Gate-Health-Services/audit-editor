import { useEffect, type ReactNode } from 'react';
import { allEntries, currentPayPeriod, entryFlagged, fmtRange, fmtShort, lastPayPeriod, parseISO, payPeriod, sortAudits, todayISO } from '../../domain/audits/model.ts';
import { ORG } from '../../domain/audits/config.ts';
import { employeeStats, groupByHome } from '../../domain/employees/stats.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { percentText, plural, shortDate, useTitle } from '../../components/ui/basics.tsx';
import { useAdmin, useAudits, useClock, useData, useSession, useStaff, useUi } from '../../app/store/stores.ts';
import { allSites, auditorName, isAdmin, refreshEmployees, refreshHomes } from '../../app/runtime/people.ts';
import { SESSION_DURATION_SECONDS } from '../../app/runtime/session-runtime.ts';
import { completionOf, isReady, periodNumber, progressState } from '../progress/progress.ts';
import { ProgressBar, useProgressInputs } from '../progress/ProgressArea.tsx';
import { staffData, watchStaff } from '../staff/staff-data.ts';
import { themeInfo, useTheme } from '../settings/theme.ts';
import { watchHub } from './hub.ts';
import { loadClockImports, periodsWithData } from '../timeclock/clock-data.ts';

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const daysUntil = (iso: string) => Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86400000);

export function HubCard({ cardKey, size, link, ic, label, desc, children, go = 'Open' }: { cardKey: string; size: string; link: string; ic: string; label: ReactNode; desc: ReactNode; children: ReactNode; go?: string }) {
  return (
    <a className={`AdminCard DeptCard DeptCard--${cardKey} ${size}`} href={link}>
      <span className="AdminCard-icon"><Icon name={ic} size={20} /></span>
      <span className="AdminCard-label">{label}</span>
      <span className="AdminCard-desc">{desc}</span>
      <span className="AdminCard-body">{children}</span>
      <span className="AdminCard-go">{go} <Icon name="arrow-right" /></span>
    </a>
  );
}

export const Stat = ({ value, label }: { value: ReactNode; label: string }) => <span className="AdminCard-stat"><strong>{value}</strong><span>{label}</span></span>;

const Loading = () => <span className="AdminCard-muted">Loading…</span>;

export function DepartmentPage() {
  useTitle('Auditing Department');
  const me = useSession((s) => s.profile)!;
  const audits = useAudits((s) => s.audits);
  const homesState = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  const st = useStaff();
  const activity = useUi((s) => s.hub.activity);
  const mode = useTheme((s) => s.mode);
  useAdmin((s) => s.users);
  useProgressInputs();
  const clockImports = useClock((s) => s.imports);
  const clockError = useClock((s) => s.importsError);
  useEffect(() => {
    void loadClockImports();
    watchHub();
    watchStaff();
    if (homesState === null && !homesError) void refreshHomes();
    if (employees === null && !employeesError) void refreshEmployees();
  });

  const first = (me.display_name || me.username || 'there').split(' ')[0];
  const current = currentPayPeriod();
  const last = lastPayPeriod();
  const progressRaw = progressState(current);
  const progress = isReady(progressRaw) ? progressRaw : null;
  const lastProgressRaw = progressState(last);
  const lastProgress = isReady(lastProgressRaw) ? lastProgressRaw : null;
  const homes = allSites();

  const mine = audits.filter((a) => a.payStart === current.start);
  const open = audits.filter((a) => !completionOf(a) && !a.completedAt);
  const recent = sortAudits(audits, 'edited').slice(0, 4);
  const auditsInner = (
    <>
      <span className="AdminCard-stats"><Stat value={mine.length} label="this pay period" /><Stat value={open.length} label="in progress" /></span>
      {recent.length ? (
        <span className="AdminCard-list">{recent.map((a) => {
          const flagged = allEntries(a).filter(entryFlagged).length;
          const done = Boolean(completionOf(a) || a.completedAt);
          return (
            <span key={a.id} className={`AdminCard-listRow ${done ? 'is-done' : ''}`}>
              <Icon name={done ? 'check-circle' : 'file-badge'} size={12} />
              <span className="AdminCard-listName">{a.site.name}</span>
              <span className="AdminCard-listMeta">{payPeriod(a) || ''}{flagged ? <> · <span className="color-fg-danger">{flagged} flagged</span></> : null}</span>
            </span>
          );
        })}</span>
      ) : (
        <span className="AdminCard-steps">
          <span className="AdminCard-step"><span className="AdminCard-stepNum">1</span><span><strong>Pick a site</strong> for the pay period you’re auditing.</span></span>
          <span className="AdminCard-step"><span className="AdminCard-stepNum">2</span><span><strong>Review each individual’s shifts</strong> and flag what’s inadequate.</span></span>
          <span className="AdminCard-step"><span className="AdminCard-stepNum">3</span><span><strong>Build the PDF</strong> and mark the site audited.</span></span>
        </span>
      )}
    </>
  );

  const left = daysUntil(current.end);
  const periodInner = progress?.total ? (
    <>
      <span className="AdminCard-progress">
        <span className="AdminCard-progressText"><strong>{progress.done}</strong> of {progress.total} sites audited{progress.complete ? ' 🎉' : ''}</span>
        <ProgressBar st={progress} small />
      </span>
      <span className="AdminCard-chips">
        <span className="Label"><Icon name="clock" size={12} />{left > 0 ? `${plural(left, 'day')} left` : left === 0 ? 'Ends today' : 'Ended'}</span>
        <span className="Label"><Icon name="calendar" size={12} />Paid {fmtShort(current.payDate)}</span>
        {lastProgress?.total ? <span className={`Label ${lastProgress.complete ? 'Label--success' : ''}`}><Icon name={lastProgress.complete ? 'check' : 'checklist'} size={12} />#{last.number}: {lastProgress.done}/{lastProgress.total}</span> : null}
      </span>
    </>
  ) : progressRaw === null ? <Loading /> : <span className="AdminCard-muted">Progress isn’t available yet.</span>;

  const staffReady = st.findings !== null && employees !== null;
  const { findings, grouped, orgRate } = staffReady ? staffData() : { findings: [], grouped: null, orgRate: null };
  const employeesInner = !staffReady ? (st.error === 'missing-table' ? <span className="AdminCard-muted">Not set up yet</span> : <Loading />) : (
    <>
      <span className="AdminCard-stats"><Stat value={employees.filter((e) => e.active).length} label="active" /></span>
      <span className="AdminCard-muted"><strong className="color-fg-default">{orgRate === null ? '—' : percentText(orgRate)}</strong> flag rate · {grouped!.byEmployee.size} with audited shifts{grouped!.unlisted.size ? ` · ${grouped!.unlisted.size} not on the list` : ''}</span>
    </>
  );

  const byHome = staffReady ? groupByHome(findings) : new Map<string, ReturnType<typeof groupByHome> extends Map<string, infer V> ? V : never>();
  const worst = [...byHome.values()].map((h) => ({ h, s: employeeStats(h.rows, { reviews: st.reviews }) })).filter((x) => x.s.complete >= 3).sort((a, b) => b.s.rate - a.s.rate)[0];
  const individuals = homes.reduce((n, h) => n + h.residents.length, 0);
  const homesInner = homesState === null ? <Loading /> : (
    <>
      <span className="AdminCard-stats"><Stat value={homes.length} label={homes.length === 1 ? 'site' : 'sites'} /></span>
      <span className="AdminCard-muted">{plural(individuals, 'individual')}{worst ? <> · Highest flag rate: <strong className="color-fg-default">{worst.h.name}</strong> {percentText(worst.s.rate)}</> : null}</span>
    </>
  );

  const remaining = progress?.total ? progress.total - progress.done : null;
  const startInner = remaining === null ? null : remaining
    ? <span className="AdminCard-muted"><strong className="color-fg-default">{plural(remaining, 'site')}</strong> still need an audit for pay period #{current.number}.</span>
    : <span className="AdminCard-muted">Every site is audited for pay period #{current.number}.</span>;

  const nowInner = activity === null || activity === undefined ? <Loading /> : activity.length ? (
    <>
      <span className="AdminCard-live"><span className="AdminCard-dot" aria-hidden="true" /><strong>{activity.length}</strong> {activity.length === 1 ? 'audit' : 'audits'} open</span>
      <span className="AdminCard-list">{activity.slice(0, 4).map((r) => {
        const home = homes.find((h) => h.id === r.home_id);
        const who = r.user_id === me.id ? 'You' : (isAdmin() && auditorName(r.user_id)) || 'Another auditor';
        return (
          <span key={`${r.home_id}:${r.pay_period_start}`} className="AdminCard-listRow">
            <Icon name="eye" size={12} />
            <span className="AdminCard-listName">{home?.name || 'A site'}</span>
            <span className="AdminCard-listMeta">{who} · #{r.pay_period_start ? periodNumber(r.pay_period_start) : '?'}</span>
          </span>
        );
      })}</span>
    </>
  ) : <span className="AdminCard-muted">No one is auditing right now.</span>;

  const reviewed = audits.reduce((n, a) => n + allEntries(a).length, 0);
  const completed = audits.filter((a) => completionOf(a) || a.completedAt).length;
  const lastWork = sortAudits(audits, 'edited')[0];
  const youInner = (
    <>
      <span className="AdminCard-stats"><Stat value={reviewed} label={reviewed === 1 ? 'shift reviewed' : 'shifts reviewed'} /></span>
      <span className="AdminCard-muted">{plural(completed, 'audit')} completed{lastWork?.updatedAt ? ` · last worked on ${shortDate(new Date(lastWork.updatedAt).toISOString())}` : ''}</span>
    </>
  );

  const theme = themeInfo(mode);
  const adminBanner = me.is_admin
    ? (
      <HubCard cardKey="admin" size="AdminCard--banner" link="#/dashboard" ic="shield-lock" label="Admin dashboard" desc="Manage sites, employees, user accounts, who’s signed in and app settings.">
        <span className="AdminCard-chips"><span className="Label"><Icon name="home" size={12} />Sites</span><span className="Label"><Icon name="people" size={12} />Employees</span><span className="Label"><Icon name="person" size={12} />Users</span><span className="Label"><Icon name="device-desktop" size={12} />Signed in</span><span className="Label"><Icon name="gear" size={12} />Settings</span></span>
      </HubCard>
    ) : (
      <HubCard cardKey="admin" size="AdminCard--banner" link="#/settings" ic="gear" label="Settings" desc="Your theme, your password and how sign-in protection works.">
        <span className="AdminCard-chips"><span className="Label"><Icon name={theme[2]} size={12} />{theme[1]} theme</span><span className="Label"><Icon name="key" size={12} />Your account</span><span className="Label"><Icon name="clock" size={12} />Signs out after {SESSION_DURATION_SECONDS / 60} min idle</span></span>
      </HubCard>
    );

  const latestClockPeriod = periodsWithData(clockImports)[0];
  const latestImport = clockImports?.[0];
  const clockLoaded = clockImports !== null;
  const timeInner = clockError
    ? <span className="AdminCard-muted">{clockError === 'missing-table' ? 'Not set up yet.' : 'Couldn’t load clock-ins.'}</span>
    : !clockLoaded ? <Loading />
      : latestClockPeriod ? (
        <span className="AdminCard-stats">
          <Stat value={`#${latestClockPeriod.number}`} label="latest pay period" />
          <Stat value={(clockImports || []).filter((i) => i.range_start <= latestClockPeriod.end && i.range_end >= latestClockPeriod.start).reduce((n, i) => n + i.shift_count, 0)} label="clock-ins" />
        </span>
      ) : <span className="AdminCard-muted">No clock-in data yet.</span>;
  const shiftsInner = clockError ? <span className="AdminCard-muted">{clockError === 'missing-table' ? 'Not set up yet.' : 'Couldn’t load schedules.'}</span>
    : !clockLoaded ? <Loading />
      : latestImport ? <span className="AdminCard-muted">Last schedule: {fmtRange(latestImport.range_start, latestImport.range_end)}, submitted by {latestImport.uploader_name || 'an admin'} on {new Date(latestImport.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</span>
        : <span className="AdminCard-muted">{me.is_admin ? 'Submit the first clock-in schedule.' : 'No schedules submitted yet.'}</span>;

  const today = parseISO(todayISO()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <>
      <div className="PageHeader DeptHeader">
        <div>
          <p className="DeptHeader-eyebrow">{ORG.name} · {ORG.department}</p>
          <h1 className="PageHeader-title">{greeting()}, {first}</h1>
          <p className="PageHeader-description">{today} · Pay period #{current.number} ({fmtRange(current.start, current.end)})</p>
        </div>
        <div className="PageHeader-actions">
          <a className="btn btn-primary" href="#/new"><Icon name="plus" />New audit</a>
        </div>
      </div>
      <div className="AdminGrid DeptGrid" data-stagger="">
        <HubCard cardKey="audits" size="AdminCard--feature" link="#/audits" ic="file-badge" label="Documentation audits" desc="Review DSP shifts, flag documentation and build audit PDFs.">{auditsInner}</HubCard>
        <HubCard cardKey="period" size="AdminCard--wide" link="#/pay-periods" ic="calendar" label={`Pay period #${current.number}`} desc={`${fmtRange(current.start, current.end)} · current pay period`} go="See every pay period">{periodInner}</HubCard>
        <HubCard cardKey="employees" size="AdminCard--square" link="#/employees" ic="people" label="Employees" desc="Flags, issues and trends for each DSP.">{employeesInner}</HubCard>
        <HubCard cardKey="homes" size="AdminCard--square" link="#/sites" ic="home" label="Sites" desc="Coverage, staff and flags for each site.">{homesInner}</HubCard>
        <HubCard cardKey="start" size="AdminCard--square" link="#/new" ic="plus" label="Start a new audit" desc="Pick a site and start reviewing shifts." go="Start">{startInner}</HubCard>
        <HubCard cardKey="now" size="AdminCard--wide" link={me.is_admin ? '#/dashboard/sessions' : '#/new'} ic="eye" label="Happening now" desc="Sites being audited at this moment. Updates every 10 seconds." go={me.is_admin ? 'See who’s signed in' : 'See sites'}>{nowInner}</HubCard>
        <HubCard cardKey="you" size="AdminCard--square" link="#/my-audits" ic="person" label="Your work" desc="Every audit you’ve made, across all pay periods." go="See your audits">{youInner}</HubCard>
        <HubCard cardKey="time" size="AdminCard--wide" link="#/time" ic="clock" label="Time tracking" desc="Hours per employee, overtime, low hours and documentation that doesn’t match the clock." go="See hours">{timeInner}</HubCard>
        <HubCard cardKey="shifts" size="AdminCard--wide" link="#/shifts" ic="calendar" label="Shifts" desc={me.is_admin ? 'Submit the clock-in schedule and see who worked where.' : 'Who was clocked in, where and when.'} go={me.is_admin ? 'Submit or view schedules' : 'See shifts'}>{shiftsInner}</HubCard>
        {adminBanner}
      </div>
    </>
  );
}
