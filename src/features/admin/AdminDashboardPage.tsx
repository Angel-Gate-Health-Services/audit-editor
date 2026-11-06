import { useEffect, type ReactNode } from 'react';
import { Icon } from '../../components/icons/Icon.tsx';
import { Avatar, Breadcrumbs, useTitle } from '../../components/ui/basics.tsx';
import { useAdmin, useData } from '../../app/store/stores.ts';
import { allSites, loadUsers, refreshEmployees, refreshHomes } from '../../app/runtime/people.ts';
import { SESSION_DURATION_SECONDS } from '../../app/runtime/session-runtime.ts';
import { href } from '../../app/navigation/route.ts';
import { isReady, progressState } from '../progress/progress.ts';
import { ProgressBar, useProgressInputs } from '../progress/ProgressArea.tsx';
import { themeInfo, useTheme } from '../settings/theme.ts';
import { Stat } from '../department/DepartmentPage.tsx';
import { ADMIN_SECTIONS, AdminFlash } from './shared.tsx';
import { watchSessions } from './admin-actions.ts';

const Loading = () => <span className="AdminCard-muted">Loading…</span>;

function Card({ cardKey, cls, children }: { cardKey: string; cls: string; children: ReactNode }) {
  const [, label, ic, description] = ADMIN_SECTIONS.find(([k]) => k === cardKey)!;
  return (
    <a className={`AdminCard AdminCard--${cardKey} ${cls}`} href={href('dashboard', cardKey)}>
      <span className="AdminCard-icon"><Icon name={ic} size={20} /></span>
      <span className="AdminCard-label">{label}</span>
      <span className="AdminCard-desc">{description}</span>
      <span className="AdminCard-body">{children}</span>
      <span className="AdminCard-go">Open <Icon name="arrow-right" /></span>
    </a>
  );
}

export default function AdminDashboardPage() {
  useTitle('Admin dashboard');
  const homesState = useData((s) => s.homes);
  const homesError = useData((s) => s.homesError);
  const employees = useData((s) => s.employees);
  const ad = useAdmin();
  const mode = useTheme((s) => s.mode);
  useProgressInputs();
  useEffect(() => {
    if (homesState === null && !homesError) void refreshHomes();
    if (employees === null) void refreshEmployees();
    if (useAdmin.getState().users === null && !useAdmin.getState().busy) void loadUsers();
    watchSessions();
  });
  const homes = allSites();
  const individuals = homes.reduce((n, h) => n + h.residents.length, 0);
  const progressRaw = progressState();
  const progress = isReady(progressRaw) ? progressRaw : null;
  const online = ad.sessions?.filter((x) => x.online) || null;
  const onlinePeople = online ? [...new Map(online.map((x) => [x.userId, x])).values()] : [];
  const theme = themeInfo(mode);
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Admin dashboard']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Admin dashboard</h1>
          <p className="PageHeader-description">Manage the sites, people and accounts everyone signs in to. Changes apply to all users right away.</p>
        </div>
      </div>
      <AdminFlash />
      <div className="AdminGrid" data-stagger="">
        <Card cardKey="sites" cls="AdminCard--feature">{homesState === null ? <Loading /> : (
          <>
            <span className="AdminCard-stats"><Stat value={homes.length} label={homes.length === 1 ? 'site' : 'sites'} /><Stat value={individuals} label={individuals === 1 ? 'individual' : 'individuals'} /></span>
            {progress?.total ? (
              <span className="AdminCard-progress">
                <span className="AdminCard-progressText"><strong>{progress.done}</strong> of {progress.total} audited · pay period #{progress.period.number}</span>
                <ProgressBar st={progress} small />
              </span>
            ) : null}
            <span className="AdminCard-list">
              {homes.slice(0, 8).map((h) => {
                const done = progress?.doneBy?.has(h.id);
                return <span key={h.id} className={`AdminCard-listRow ${done ? 'is-done' : ''}`}><Icon name={done ? 'check-circle' : 'home'} size={12} /><span className="AdminCard-listName">{h.name}</span><span className="AdminCard-listMeta">{h.residents.length} {h.residents.length === 1 ? 'individual' : 'individuals'}</span></span>;
              })}
              {homes.length > 8 ? <span className="AdminCard-listMore">+{homes.length - 8} more sites</span> : null}
            </span>
          </>
        )}</Card>
        <Card cardKey="sessions" cls="AdminCard--wide">{online === null
          ? (ad.sessionsError ? <span className="AdminCard-muted">Not available</span> : <Loading />)
          : (
            <>
              <span className="AdminCard-live"><span className="AdminCard-dot" aria-hidden="true" /><strong>{onlinePeople.length}</strong> {onlinePeople.length === 1 ? 'person' : 'people'} online</span>
              <span className="AdminCard-faces">{onlinePeople.slice(0, 6).map((x) => <Avatar key={x.userId} kind="users" id={x.userId} name={x.displayName || x.username} />)}</span>
            </>
          )}</Card>
        <Card cardKey="users" cls="AdminCard--square">{ad.users === null ? <Loading /> : <Stat value={ad.users.length} label={`${ad.users.length === 1 ? 'account' : 'accounts'} · ${ad.users.filter((u) => u.is_admin).length} admin`} />}</Card>
        <Card cardKey="employees" cls="AdminCard--square">{employees === null ? <Loading /> : <Stat value={employees.filter((x) => x.active).length} label="active" />}</Card>
        <Card cardKey="settings" cls="AdminCard--banner">
          <span className="AdminCard-chips">
            <span className="Label"><Icon name={theme[2]} size={12} />{theme[1]} theme</span>
            <span className="Label"><Icon name="clock" size={12} />Signs out after {SESSION_DURATION_SECONDS / 60} min idle</span>
            <span className="Label"><Icon name="key" size={12} />Your account</span>
          </span>
        </Card>
      </div>
    </>
  );
}
