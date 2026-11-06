import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { allEntries } from '../../domain/audits/model.ts';
import { APP_VERSION, GITHUB_URL } from '../../domain/audits/config.ts';
import { LOGOUT_WARNING_MS } from '../../services/session/lifecycle.ts';
import { describeDevice, fmtDuration } from '../../services/session/monitor.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Avatar, Breadcrumbs, clockTime, plural, useTitle } from '../../components/ui/basics.tsx';
import { Field } from '../../components/ui/Field.tsx';
import { useAdmin, useAudits, useData, useSession } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites, isEmployee, loadUsers, refreshEmployees, refreshHomes } from '../../app/runtime/people.ts';
import { SESSION_DURATION_SECONDS } from '../../app/runtime/session-runtime.ts';
import { href } from '../../app/navigation/route.ts';
import { RouteLayer } from '../../app/motion/RouteLayer.tsx';
import { TabIndicator } from '../../app/motion/TabIndicator.tsx';
import { MissingPage } from '../../app/shell/pages.tsx';
import { ThemeChoices, Fact } from '../settings/SettingsPage.tsx';
import { PhotoControls } from './PhotoControls.tsx';
import { ADMIN_SECTIONS, AdminFlash } from './shared.tsx';
import {
  adminAddEmployees, adminAddEmployeesFromAudits, adminAddUser, adminCancelEditEmployee, adminCancelEditUser, adminCancelUser, adminCreateUser,
  adminDeleteEmployee, adminDeleteUser, adminEditEmployee, adminEditUser, adminImportHomes, adminSaveEmployee, adminSaveUser, refreshSessions,
  saveAccount, signOutSession, signOutUser, watchSessions,
} from './admin-actions.ts';
import type { Profile, TrackedSession } from '../../types/audit.ts';

const a = {
  importHomes: action('adminImportHomes', adminImportHomes),
  addUser: action('adminAddUser', adminAddUser),
  cancelUser: action('adminCancelUser', adminCancelUser),
  createUser: action('adminCreateUser', adminCreateUser),
  deleteUser: action('adminDeleteUser', adminDeleteUser),
  editUser: action('adminEditUser', adminEditUser),
  cancelEditUser: action('adminCancelEditUser', adminCancelEditUser),
  saveUser: action('adminSaveUser', adminSaveUser),
  addEmployees: action('adminAddEmployees', adminAddEmployees),
  addFromAudits: action('adminAddEmployeesFromAudits', adminAddEmployeesFromAudits),
  deleteEmployee: action('adminDeleteEmployee', adminDeleteEmployee),
  editEmployee: action('adminEditEmployee', adminEditEmployee),
  cancelEditEmployee: action('adminCancelEditEmployee', adminCancelEditEmployee),
  saveEmployee: action('adminSaveEmployee', adminSaveEmployee),
  refreshSessions: action('refreshSessions', refreshSessions),
  signOutUser: action('signOutUser', signOutUser),
  signOutSession: action('signOutSession', signOutSession),
  saveAccount: action('saveAccount', saveAccount),
};

const Loading = ({ text }: { text: string }) => <div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>{text}</p></div></div>;

function HomesBody() {
  const homesState = useData((s) => s.homes);
  useEffect(() => {
    if (homesState === null) void refreshHomes();
  }, [homesState]);
  if (homesState === null) return <Loading text="Loading sites…" />;
  const homes = allSites();
  return (
    <div className="Box">
      <div className="Box-header">
        <h2 className="Box-title">Sites</h2>
        <div className="Box-headerActions">
          <label className="btn btn-sm btn-file" title="Add sites from an AGHS homes.json file"><Icon name="upload" />Import file
            <input type="file" accept="application/json,.json" onChange={(ev) => a.importHomes(ev.currentTarget)} />
          </label>
          <a className="btn btn-sm btn-primary" href={href('dashboard', 'site', 'new')}><Icon name="plus" />Add site</a>
        </div>
      </div>
      {homes.length ? homes.map((h) => (
        <a key={h.id} className="Box-row Box-row--link" href={href('dashboard', 'site', h.id)}>
          <span className="AuditRow-icon"><Icon name="home" /></span>
          <span className="PersonRow-main">
            <span className="PersonRow-name d-block">{h.name}</span>
            <span className="PersonRow-meta">{h.address || 'No address'}{h.manager ? ` · ${h.managerTitle}: ${h.manager}` : ''}</span>
          </span>
          <span className="Label"><Icon name="people" />{plural(h.residents.length, 'individual')}</span>
          <span className="PersonRow-chevron"><Icon name="chevron-right" /></span>
        </a>
      )) : <div className="blankslate blankslate--narrow"><p>No sites yet. Add one, or import your AGHS homes.json.</p></div>}
    </div>
  );
}

function EmployeesBody() {
  const employees = useData((s) => s.employees);
  const employeesError = useData((s) => s.employeesError);
  const audits = useAudits((s) => s.audits);
  const ad = useAdmin();
  if (employeesError === 'missing-table') {
    return <div className="flash flash-warn"><Icon name="alert" /><span>The employee list isn’t set up yet. Run <code>supabase/employees.sql</code> in the Supabase SQL Editor, then refresh.</span></div>;
  }
  if (employees === null) return <Loading text="Loading employees…" />;
  if (employeesError) {
    return <div className="flash flash-error"><Icon name="alert" /><span>Couldn’t load employees: {employeesError}. {/permission denied/i.test(employeesError) ? <>Run <code>supabase/employees.sql</code> again in the Supabase SQL Editor, then refresh.</> : null}</span></div>;
  }
  const fromAudits = [...new Set(audits.flatMap((x) => allEntries(x).map((e) => e.author.trim())).filter(Boolean))].filter((n) => !isEmployee(n));
  const patchDraft = (p: Partial<NonNullable<typeof ad.empDraft>>) => useAdmin.setState((s) => ({ empDraft: s.empDraft ? { ...s.empDraft, ...p } : s.empDraft }));
  return (
    <>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Add employees</h2></div>
        <div className="Box-body">
          <Field bind="empAdd:text" label="Names" type="textarea" value={ad.empAdd.text} placeholder="One full name per line" hint="Paste a whole list at once. Names already on the list are skipped."
            onCommit={(text) => useAdmin.setState({ empAdd: { text } })} />
        </div>
        <div className="Box-footer">
          {fromAudits.length ? <button className="btn btn-sm" title={fromAudits.join(', ')} onClick={() => a.addFromAudits()}><Icon name="download" />Add {plural(fromAudits.length, 'name')} from my audits</button> : null}
          <div className="NavBar-end"><button className="btn btn-primary" disabled={ad.busy} onClick={() => a.addEmployees()}><Icon name="plus" />Add to list</button></div>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Employees</h2><span className="Counter">{employees.length}</span>
          <span className="f6 color-fg-muted ml-2">Shown in the Author dropdown on every shift. Inactive names are hidden from it.</span></div>
        {employees.length ? employees.map((p) => {
          const editing = ad.editEmp === p.id;
          return (
            <Fragment key={p.id}>
              <div className={`Box-row UserRow ${editing ? 'is-editing' : ''}`}>
                <Avatar kind="employees" id={p.id} name={p.name} />
                <span className="PersonRow-main"><a className="PersonRow-name" href={href('employees', p.id)} title={`See ${p.name}’s statistics`}>{p.name}</a></span>
                {p.active ? null : <span className="Label">Inactive</span>}
                {editing ? null : <button className="btn btn-sm" aria-label={`Edit ${p.name}`} onClick={() => a.editEmployee(p.id)}><Icon name="pencil" />Edit</button>}
              </div>
              {editing && ad.empDraft ? (
                <div className="Box-row EditPanel">
                  <div className="EditPanel-photo">
                    <Avatar kind="employees" id={p.id} name={p.name} className="InitialsAvatar--xl" />
                    <div className="EditPanel-photoActions"><PhotoControls kind="employees" id={p.id} name={p.name} /></div>
                  </div>
                  <div className="EditPanel-fields">
                    <div className="FormGrid">
                      <Field bind="empDraft:name" label="Full name" value={ad.empDraft.name} hint="Audits already written keep the old spelling." autoFocus wide onCommit={(name) => patchDraft({ name })} />
                      <div className="FormField wide">
                        <span className="FormField-label">Author dropdown</span>
                        <label className="CheckRow">
                          <input type="checkbox" checked={ad.empDraft.active} onChange={(ev) => patchDraft({ active: ev.target.checked })} />
                          <span className="CheckRow-text"><span className="CheckRow-label">Active</span><span className="CheckRow-caption">Inactive employees are hidden from the Author dropdown but kept on the list.</span></span>
                        </label>
                      </div>
                    </div>
                    <div className="EditPanel-actions">
                      <button className="btn btn-danger" onClick={() => a.deleteEmployee(p.id)}><Icon name="trash" />Remove employee</button>
                      <div className="NavBar-end">
                        <button className="btn" onClick={() => a.cancelEditEmployee()}>Cancel</button>
                        <button className="btn btn-primary" disabled={ad.busy} onClick={() => a.saveEmployee(p.id)}><Icon name="check" />Save changes</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Fragment>
          );
        }) : <div className="blankslate blankslate--narrow"><p>No employees yet. Add names above.</p></div>}
      </div>
    </>
  );
}

function UserEditor({ u, self }: { u: Profile; self: boolean }) {
  const d = useAdmin((s) => s.userDraft)!;
  const busy = useAdmin((s) => s.busy);
  const name = u.display_name || u.username;
  const patch = (p: Partial<typeof d>) => useAdmin.setState((s) => ({ userDraft: s.userDraft ? { ...s.userDraft, ...p } : s.userDraft }));
  return (
    <div className="Box-row EditPanel">
      <div className="EditPanel-photo">
        <Avatar kind="users" id={u.id} name={name} className="InitialsAvatar--xl" />
        <div className="EditPanel-photoActions"><PhotoControls kind="users" id={u.id} name={name} /></div>
      </div>
      <div className="EditPanel-fields">
        <div className="FormGrid">
          <Field bind="userDraft:displayName" label="Full name" value={d.displayName} placeholder="e.g. Jordan Smith" hint="Fills “Audit by” on their audits." autoFocus onCommit={(displayName) => patch({ displayName })} />
          <div className="FormField">
            <span className="FormField-label">Username</span>
            <p className="EditPanel-static">{u.username}</p>
            <p className="FormField-caption">What they sign in with.</p>
          </div>
          <div className="FormField wide">
            <span className="FormField-label">Permissions</span>
            <label className="CheckRow">
              <input type="checkbox" checked={d.isAdmin} disabled={self} onChange={(ev) => patch({ isAdmin: ev.target.checked })} />
              <span className="CheckRow-text"><span className="CheckRow-label">Admin</span><span className="CheckRow-caption">{self ? 'You can’t remove your own admin access.' : 'Can manage sites, individuals, employees and users.'}</span></span>
            </label>
            <label className="CheckRow mt-2">
              <input type="checkbox" checked={d.active} disabled={self} onChange={(ev) => patch({ active: ev.target.checked })} />
              <span className="CheckRow-text"><span className="CheckRow-label">Account active</span><span className="CheckRow-caption">{self ? 'You can’t disable your own account.' : 'Turn off to sign them out and block sign-in.'}</span></span>
            </label>
          </div>
          <Field bind="userDraft:password" label="New password" optional type="password" value={d.password} placeholder="Leave blank to keep the current one" hint="At least 6 characters. Share it with them privately." input={{ autoComplete: 'new-password' }} wide onCommit={(password) => patch({ password })} />
        </div>
        <div className="EditPanel-actions">
          {self ? null : <button className="btn btn-danger" onClick={() => a.deleteUser(u.id)}><Icon name="trash" />Delete user</button>}
          <div className="NavBar-end">
            <button className="btn" onClick={() => a.cancelEditUser()}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => a.saveUser(u.id)}><Icon name="check" />Save changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersBody() {
  const ad = useAdmin();
  const me = useSession((s) => s.profile!.id);
  if (ad.users === null) return <Loading text="Loading users…" />;
  const online = (id: string) => (ad.sessions || []).filter((x) => x.online && x.userId === id).length;
  const n = ad.newUser;
  const patch = (p: Partial<NonNullable<typeof n>>) => useAdmin.setState((s) => ({ newUser: s.newUser ? { ...s.newUser, ...p } : s.newUser }));
  return (
    <>
      {n ? (
        <div className="Box">
          <div className="Box-header"><h2 className="Box-title">Add a user</h2></div>
          <div className="Box-body">
            <div className="FormGrid">
              <Field bind="newUser:username" label="Username" value={n.username} hint="3–32 letters, numbers, dots, dashes or underscores. Not case-sensitive." autoFocus
                input={{ autoComplete: 'off', autoCapitalize: 'none', spellCheck: false }} onCommit={(username) => patch({ username })} />
              <Field bind="newUser:displayName" label="Full name" value={n.displayName} hint="Fills “Audit by” on their audits." onCommit={(displayName) => patch({ displayName })} />
              <Field bind="newUser:password" label="Password" type="password" value={n.password} hint="At least 6 characters. Share it with them privately." input={{ autoComplete: 'new-password' }} onCommit={(password) => patch({ password })} />
              <div className="FormField">
                <span className="FormField-label">Permissions</span>
                <label className="CheckRow">
                  <input type="checkbox" checked={n.isAdmin} onChange={(ev) => patch({ isAdmin: ev.target.checked })} />
                  <span className="CheckRow-text"><span className="CheckRow-label">Admin</span><span className="CheckRow-caption">Can manage sites, individuals and users.</span></span>
                </label>
              </div>
            </div>
          </div>
          <div className="Box-footer Box-footer--end">
            <button className="btn" onClick={() => a.cancelUser()}>Cancel</button>
            <button className="btn btn-primary" disabled={ad.busy} onClick={() => a.createUser()}><Icon name="plus" />Create user</button>
          </div>
        </div>
      ) : null}
      <div className="Box">
        <div className="Box-header">
          <h2 className="Box-title">Users</h2>
          <div className="Box-headerActions">{n ? null : <button className="btn btn-sm btn-primary" onClick={() => a.addUser()}><Icon name="plus" />Add user</button>}</div>
        </div>
        {ad.users.map((u) => {
          const self = u.id === me;
          const editing = ad.editUser === u.id;
          const count = online(u.id);
          return (
            <Fragment key={u.id}>
              <div className={`Box-row UserRow ${editing ? 'is-editing' : ''}`}>
                <Avatar kind="users" id={u.id} name={u.display_name || u.username} />
                <div className="PersonRow-main">
                  <span className="PersonRow-name">{u.display_name || u.username}</span>
                  <span className="PersonRow-meta"> · {u.username}</span>
                  <div className="UserRow-labels">
                    {u.is_admin ? <span className="Label Label--accent"><Icon name="shield-lock" />Admin</span> : <span className="Label">User</span>}
                    {u.active ? null : <span className="Label Label--danger">Disabled</span>}
                    {self ? <span className="Label Label--success">You</span> : null}
                    {count ? <span className="Label Label--success"><Icon name="device-desktop" size={12} />Online{count > 1 ? ` · ${count} sessions` : ''}</span> : null}
                  </div>
                </div>
                <div className="UserRow-actions">
                  {count && !self ? <button className="btn btn-sm btn-danger" aria-label={`Sign ${u.username} out of every session`} onClick={() => a.signOutUser(u.id)}>Sign out</button> : null}
                  {editing ? null : <button className="btn btn-sm" aria-label={`Edit ${u.username}`} onClick={() => a.editUser(u.id)}><Icon name="pencil" />Edit</button>}
                </div>
              </div>
              {editing && ad.userDraft ? <UserEditor u={u} self={self} /> : null}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}

function SessionRow({ s, now }: { s: TrackedSession; now: number }) {
  const me = useSession((st) => st.profile!.id);
  const name = s.displayName || s.username;
  return (
    <div className={`Box-row SessionRow ${s.online ? 'is-online' : ''}`}>
      <span className="SessionRow-avatar"><Avatar kind="users" id={s.userId} name={name} />{s.online ? <span className="SessionRow-dot" aria-hidden="true" /> : null}</span>
      <div className="SessionRow-main">
        <div className="SessionRow-who">
          <span className="PersonRow-name">{name}</span>
          <span className="PersonRow-meta">{s.username}</span>
          {s.isAdmin ? <span className="Label Label--accent"><Icon name="shield-lock" />Admin</span> : null}
          {s.userId === me ? <span className="Label Label--success">You</span> : null}
        </div>
        <dl className="SessionRow-facts">
          <div className="SessionRow-fact"><dt>IP address</dt><dd>{s.ip ? <code>{s.ip}</code> : <span className="color-fg-muted">Unknown</span>}</dd></div>
          <div className="SessionRow-fact"><dt>Location</dt><dd>{s.location ? s.location : <span className="color-fg-muted">Unknown</span>}</dd></div>
          {s.online ? <div className="SessionRow-fact"><dt>Auditing</dt><dd>{s.auditing.length
            ? s.auditing.map((h, i) => (typeof h === 'string'
              ? <span key={i} className="Label"><Icon name="home" size={12} />{h}</span>
              : <a key={i} className="Label Label--attention SessionRow-audit" href={href('a', h.auditId)} title="View this audit"><Icon name="eye" size={12} />{h.home}</a>))
            : <span className="color-fg-muted">Not auditing a site</span>}</dd></div> : null}
          <div className="SessionRow-fact"><dt>Device</dt><dd>{describeDevice(s.userAgent || '')}</dd></div>
        </dl>
      </div>
      <div className="SessionRow-time">
        {s.online
          ? <><strong>{fmtDuration(now - Date.parse(s.startedAt))}</strong><span>Since {clockTime(s.startedAt)}</span></>
          : <><strong>{fmtDuration(Date.parse(s.endedAt!) - Date.parse(s.startedAt))}</strong><span>Signed out {clockTime(s.endedAt!)}</span></>}
        {s.online && s.canSignOut && !s.current ? <button className="btn btn-sm btn-danger SessionRow-kick" onClick={() => a.signOutSession(s.id, s.userId)}>Sign out</button> : null}
        {s.current ? <span className="SessionRow-current">This device</span> : null}
      </div>
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function SessionsBody() {
  const ad = useAdmin();
  const clock = useNow(5000);
  if (ad.sessionsError === 'not-deployed') {
    return <div className="flash flash-warn"><Icon name="alert" /><span>Signed-in tracking isn’t set up yet. Run <code>supabase/sessions.sql</code> in the Supabase SQL Editor, then deploy the <code>session-monitor</code> Edge Function (see SETUP.md).</span></div>;
  }
  if (ad.sessions === null) {
    return ad.sessionsError
      ? <div className="flash flash-error" role="alert"><Icon name="alert" /><span>Couldn’t load signed-in users. {ad.sessionsError}</span><button className="btn btn-sm" onClick={() => a.refreshSessions()}>Retry</button></div>
      : <Loading text="Loading signed-in users…" />;
  }
  const now = clock + ad.sessionsClock;
  const online = ad.sessions.filter((s) => s.online).sort((x, y) => Date.parse(x.startedAt) - Date.parse(y.startedAt));
  const recent = ad.sessions.filter((s) => !s.online).sort((x, y) => Date.parse(y.endedAt!) - Date.parse(x.endedAt!));
  return (
    <>
      {ad.sessionsError ? <div className="flash flash-error" role="alert"><Icon name="alert" /><span>Couldn’t refresh. {ad.sessionsError}</span></div> : null}
      <p className="SessionsNote"><Icon name="shield-lock" /><span>Only admins can see this page. IP addresses and locations are recorded by the server, and other users can’t read them. Locations are approximate, based on the IP address.</span></p>
      <div className="Box">
        <div className="Box-header">
          <h2 className="Box-title">Signed in now <span className="Counter">{online.length}</span></h2>
          <div className="Box-headerActions">
            <span className="SessionsUpdated">Updates every 15 seconds</span>
            <button className="btn btn-sm" disabled={ad.sessionsLoading} onClick={() => a.refreshSessions()}><Icon name="sync" />Refresh</button>
          </div>
        </div>
        {online.length ? online.map((s) => <SessionRow key={s.id} s={s} now={now} />) : <div className="blankslate blankslate--narrow"><p>Nobody is signed in right now.</p></div>}
      </div>
      {recent.length ? (
        <div className="Box">
          <div className="Box-header"><h2 className="Box-title">Signed out in the last 24 hours <span className="Counter">{recent.length}</span></h2></div>
          {recent.map((s) => <SessionRow key={s.id} s={s} now={now} />)}
        </div>
      ) : null}
    </>
  );
}

function SettingsBody() {
  const me = useSession((s) => s.profile)!;
  const acct = useAdmin((s) => s.acct);
  const busy = useAdmin((s) => s.busy);
  const [initial] = useState(() => ({ displayName: me.display_name || '', password: '' }));
  const d = acct || initial;
  const patch = (p: Partial<typeof d>) => useAdmin.setState((s) => ({ acct: { ...(s.acct || initial), ...p } }));
  const minutes = LOGOUT_WARNING_MS / 60000;
  return (
    <>
      <ThemeChoices />
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Your account</h2></div>
        <div className="Box-body">
          <div className="FormGrid">
            <Field bind="acct:username" label="Username" value={me.username} readOnly hint="Usernames can’t be changed." onCommit={() => {}} />
            <Field bind="acct:displayName" label="Full name" value={d.displayName} hint="Fills “Audit by” on your new audits." onCommit={(displayName) => patch({ displayName })} />
            <Field bind="acct:password" label="New password" type="password" value={d.password} hint="At least 6 characters. Leave blank to keep your current password." input={{ autoComplete: 'new-password' }} onCommit={(password) => patch({ password })} />
          </div>
        </div>
        <div className="Box-footer Box-footer--end">
          <button className="btn btn-primary" disabled={busy} onClick={() => a.saveAccount()}><Icon name="check" />Save account</button>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Sign-in protection</h2><span className="Label"><Icon name="lock" size={12} />Always on</span></div>
        <div className="Box-body">
          <dl className="HomeFacts">
            <Fact label="Automatic sign-out">After {SESSION_DURATION_SECONDS / 60} minutes without activity, with a warning in the last {minutes === 1 ? 'minute' : `${minutes} minutes`}</Fact>
            <Fact label="New tabs and links">Always ask for sign-in again</Fact>
            <Fact label="Account checks">Every 30 seconds; disabled accounts are signed out</Fact>
            <Fact label="Signed-in tracking">Admins only, enforced by the server</Fact>
          </dl>
          <p className="FormField-caption">These are built into the site so nobody can switch them off from a browser.</p>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">About</h2></div>
        <div className="Box-body">
          <dl className="HomeFacts">
            <Fact label="Version">v{APP_VERSION}</Fact>
            <Fact label="Source">{GITHUB_URL ? <a href={GITHUB_URL}>GitHub repository</a> : 'Not published yet'}</Fact>
          </dl>
        </div>
      </div>
    </>
  );
}

export default function AdminTabsPage() {
  const section = useParams().section || '';
  const known = ADMIN_SECTIONS.some(([key]) => key === section);
  const employees = useData((s) => s.employees);
  const homesCount = useData((s) => s.homes?.length ?? 0);
  const users = useAdmin((s) => s.users);
  const busy = useAdmin((s) => s.busy);
  const sessions = useAdmin((s) => s.sessions);
  useEffect(() => {
    if (!known) return;
    useAdmin.setState({ tab: section, editHome: null });
    if (section === 'employees' && useData.getState().employees === null) void refreshEmployees();
    if (section === 'users' && useAdmin.getState().users === null && !useAdmin.getState().busy) void loadUsers();
    if (section === 'sessions' || section === 'users') watchSessions();
  }, [known, section, busy]);
  const label = ADMIN_SECTIONS.find(([key]) => key === section)?.[1] || 'Admin';
  useTitle(known ? `${label} · Admin` : 'Not found');
  if (!known) return <MissingPage />;
  const [, , , description] = ADMIN_SECTIONS.find(([key]) => key === section)!;
  const counts: Record<string, number | null> = {
    sites: homesCount,
    employees: employees ? employees.length : null,
    users: users ? users.length : null,
    sessions: sessions ? sessions.filter((x) => x.online).length : null,
    settings: null,
  };
  const body = section === 'users' ? <UsersBody /> : section === 'employees' ? <EmployeesBody /> : section === 'sessions' ? <SessionsBody /> : section === 'settings' ? <SettingsBody /> : <HomesBody />;
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Admin dashboard', '#/dashboard'], [label]]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">{label}</h1>
          <p className="PageHeader-description">{description}</p>
        </div>
      </div>
      <nav className="UnderlineNav has-indicator" aria-label="Admin sections">
        {ADMIN_SECTIONS.map(([key, name, ic]) => (
          <a key={key} className="UnderlineNav-item" href={href('dashboard', key)} aria-current={key === section ? 'page' : undefined}>
            <Icon name={ic} /><span>{name}</span>{counts[key] != null ? <span className="Counter">{counts[key]}</span> : null}
          </a>
        ))}
        <TabIndicator activeKey={section} />
      </nav>
      <AdminFlash />
      <RouteLayer scope="admin" layerKey={section} className="AdminTabBody">
        {body}
      </RouteLayer>
    </>
  );
}

export function useFormSubmit(fn: (form: HTMLFormElement) => void) {
  return (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    fn(ev.currentTarget);
  };
}
