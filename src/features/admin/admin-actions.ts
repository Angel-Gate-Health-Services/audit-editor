import * as api from '../../services/api/api.ts';
import { allEntries } from '../../domain/audits/model.ts';
import { describeDevice } from '../../services/session/monitor.ts';
import { askConfirm } from '../../components/dialog/dialog.ts';
import { plural } from '../../components/ui/basics.tsx';
import { useAdmin, useAudits, useData, useSession, type HomeDraft } from '../../app/store/stores.ts';
import { allSites, generation, isAdmin, refreshEmployees, refreshHomes } from '../../app/runtime/people.ts';
import { clearInterval_, timers } from '../../app/runtime/services.ts';
import { scrollToFlash } from '../../app/runtime/feedback.ts';
import { parseRoute } from '../../app/navigation/route.ts';
import { go } from '../../app/navigation/navigator.ts';
import type { HomeInput, UserChanges } from '../../services/api/api.ts';

const set = useAdmin.setState;

export const clearAdminMessages = () => set({ notice: '', error: '' });

export function adminFail(msg: string) {
  set({ notice: '', error: msg });
  scrollToFlash('.flash-error', 'center');
}

export async function adminRun(task: () => Promise<string | void>) {
  const gen = generation();
  clearAdminMessages();
  set({ busy: true });
  try {
    const notice = (await task()) || '';
    if (gen === generation()) set({ notice });
  } catch (err) {
    if (gen === generation()) set({ error: (err as Error).message });
  }
  if (gen !== generation()) return;
  set({ busy: false });
  scrollToFlash('.flash', 'nearest');
}

export const onSessionsTab = () => isAdmin() && parseRoute()[0] === 'dashboard' && [undefined, 'sessions', 'users'].includes(parseRoute()[1]);

export async function loadSessions() {
  const ad = useAdmin.getState();
  if (ad.sessionsLoading || !isAdmin()) return;
  const gen = generation();
  set({ sessionsLoading: true });
  try {
    const res = await api.listSignedInSessions();
    if (gen !== generation()) return;
    set({ sessions: res.sessions || [], sessionsClock: Date.parse(res.now) - Date.now() || 0, sessionsError: '' });
  } catch (err) {
    if (gen !== generation()) return;
    const status = (err as { status?: number }).status;
    set({ sessionsError: status === 404 ? 'not-deployed' : (err as Error).message });
  } finally {
    if (gen === generation()) set({ sessionsLoading: false });
  }
}

export function watchSessions() {
  const ad = useAdmin.getState();
  if (!ad.sessionsLoading && (ad.sessions === null || ad.sessionsError)) void loadSessions();
  if (timers.sessions) return;
  timers.sessions = setInterval(() => {
    if (!onSessionsTab()) {
      clearInterval_('sessions');
      return;
    }
    void loadSessions();
  }, 15000);
}

export function homeDraftFor(id: string | undefined): HomeDraft {
  const home = allSites().find((h) => h.id === id);
  return {
    name: home?.name || '', address: home?.address || '', phone: home?.phone || '',
    managerTitle: home?.managerTitle || 'Lead', manager: home?.manager || '',
    cell: home?.cell || '', email: home?.email || '', supervisor: home?.supervisor || '',
  };
}

export async function adminSaveHome(id: string) {
  const d = useAdmin.getState().draft;
  if (!d || !d.name.trim()) return adminFail('Give the site a name.');
  await adminRun(async () => {
    if (id === 'new') {
      const newId = await api.createHome(d);
      await refreshHomes();
      set({ draftFor: null });
      go('dashboard', 'site', newId);
      return `${d.name.trim()} was created. Now add its individuals.`;
    }
    await api.updateHome(id, d);
    await refreshHomes();
    set({ editHome: null });
    return 'Site saved.';
  });
}

export function adminEditHome(id: string) {
  clearAdminMessages();
  set({ editHome: id, draftFor: null });
}

export function adminCancelEditHome() {
  clearAdminMessages();
  set({ editHome: null, draftFor: null });
}

export async function adminDeleteHome(id: string) {
  const home = allSites().find((h) => h.id === id);
  if (!home) return;
  if (!(await askConfirm(`${home.name} and all ${plural(home.residents.length, 'individual')} in it will be deleted. Everyone will stop seeing it. Audits already started keep their copy.`, { title: `Delete ${home.name}?`, confirmLabel: 'Delete site', danger: true }))) return;
  await adminRun(async () => {
    await api.deleteHome(id);
    await refreshHomes();
    go('dashboard', 'sites');
    return `${home.name} was deleted.`;
  });
}

export async function adminAddResident(id: string, raw: string, clear: () => void) {
  const name = raw.trim();
  if (!name) return;
  await adminRun(async () => {
    await api.addResident(id, name);
    await refreshHomes();
    clear();
    return `${name} was added.`;
  });
}

export async function adminRenameResident(id: string, raw: string) {
  const name = raw.trim();
  if (!name) return adminFail('Names can’t be empty.');
  await adminRun(async () => {
    await api.renameResident(id, name);
    await refreshHomes();
    return `Renamed to ${name}.`;
  });
}

export async function adminRemoveResident(id: string, name: string) {
  if (!(await askConfirm('Audits already started keep their copy.', { title: `Remove ${name} from this site?`, confirmLabel: 'Remove', danger: true }))) return;
  await adminRun(async () => {
    await api.deleteResident(id);
    await refreshHomes();
    return `${name} was removed.`;
  });
}

export async function adminImportHomes(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  let list: HomeInput[];
  try {
    const data = JSON.parse(await file.text()) as HomeInput[] | { sites?: HomeInput[] };
    list = (Array.isArray(data) ? data : data.sites || []).filter((s) => s && s.name);
    if (!list.length) throw new Error();
  } catch {
    return adminFail('That file isn’t a sites file. It should look like AGHS homes.json.');
  }
  await adminRun(async () => {
    const added = await api.importHomes(list, allSites().map((h) => h.name));
    await refreshHomes();
    const skipped = list.length - added;
    return `Imported ${plural(added, 'site')}${skipped ? ` (${skipped} already existed and ${skipped === 1 ? 'was' : 'were'} skipped)` : ''}.`;
  });
}

export function adminAddUser() {
  set({ newUser: { username: '', displayName: '', password: '', isAdmin: false } });
  clearAdminMessages();
}

export function adminCancelUser() {
  set({ newUser: null });
  clearAdminMessages();
}

export async function adminCreateUser() {
  const n = useAdmin.getState().newUser;
  if (!n) return;
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(n.username.trim())) return adminFail('Usernames are 3–32 letters, numbers, dots, dashes or underscores.');
  if (n.password.length < 6) return adminFail('Passwords need at least 6 characters.');
  await adminRun(async () => {
    await api.createUser({ username: n.username.trim(), displayName: n.displayName.trim(), password: n.password, isAdmin: n.isAdmin });
    set({ newUser: null });
    set({ users: await api.listUsers() });
    return `${n.username.trim()} can now sign in.`;
  });
}

export async function adminDeleteUser(id: string) {
  const user = useAdmin.getState().users?.find((u) => u.id === id);
  if (!user) return;
  if (!(await askConfirm('This can’t be undone. Audits already saved aren’t affected.', { title: `Delete ${user.username}’s account?`, confirmLabel: 'Delete account', danger: true }))) return;
  await adminRun(async () => {
    await api.deleteUser(id);
    set({ users: await api.listUsers() });
    return `${user.username} was deleted.`;
  });
}

export const refreshSessions = () => loadSessions();

export async function signOutUser(id: string) {
  const u = useAdmin.getState().users?.find((x) => x.id === id);
  const name = u ? u.display_name || u.username : 'this user';
  if (!(await askConfirm('They’ll return to the sign-in screen within about 30 seconds. Their audits are kept, and any site they were auditing is freed.', { title: `Sign ${name} out of every device?`, confirmLabel: 'Sign out', danger: true }))) return;
  await adminRun(async () => {
    const res = await api.signOutSessions(id);
    set((s) => ({ sessions: (s.sessions || []).map((x) => (x.userId === id ? { ...x, online: false } : x)) }));
    await loadSessions();
    return `${name} was signed out${res?.ended > 1 ? ` of ${res.ended} sessions` : ''}.`;
  });
}

export async function signOutSession(id: string, user: string) {
  const s = useAdmin.getState().sessions?.find((x) => x.id === id);
  const name = s ? s.displayName || s.username : 'this user';
  if (!(await askConfirm('Their other sessions stay signed in.', { title: `Sign ${name} out on ${s ? describeDevice(s.userAgent || '') : 'this device'}?`, confirmLabel: 'Sign out', danger: true }))) return;
  await adminRun(async () => {
    await api.signOutSessions(user, id);
    set((st) => ({ sessions: (st.sessions || []).map((x) => (x.id === id ? { ...x, online: false } : x)) }));
    await loadSessions();
    return `${name} was signed out on that device.`;
  });
}

export async function saveAccount() {
  const me = useSession.getState().profile!;
  const d = useAdmin.getState().acct || { displayName: me.display_name || '', password: '' };
  const changes: UserChanges = {};
  if (d.displayName.trim() !== (me.display_name || '')) changes.displayName = d.displayName.trim();
  if (d.password) {
    if (d.password.length < 6) return adminFail('Passwords need at least 6 characters.');
    changes.password = d.password;
  }
  if (!Object.keys(changes).length) return adminFail('Nothing to save. Change your name or type a new password first.');
  await adminRun(async () => {
    await api.updateUser(me.id, changes);
    if (changes.displayName !== undefined) useSession.setState({ profile: { ...useSession.getState().profile!, display_name: changes.displayName } });
    set({ acct: { displayName: changes.displayName ?? d.displayName, password: '' }, users: null });
    return changes.password ? 'Your account was saved, including your new password.' : 'Your account was saved.';
  });
}

export async function adminAddEmployees() {
  const names = useAdmin.getState().empAdd.text.split('\n').map((n) => n.trim()).filter(Boolean);
  if (!names.length) return adminFail('Type at least one name, one per line.');
  await adminRun(async () => {
    const added = await api.addEmployees(names, (useData.getState().employees || []).map((p) => p.name));
    set({ empAdd: { text: '' } });
    await refreshEmployees();
    const skipped = names.length - added;
    return `Added ${plural(added, 'employee')}${skipped ? ` (${skipped} already on the list)` : ''}.`;
  });
}

export async function adminAddEmployeesFromAudits() {
  const names = [...new Set(useAudits.getState().audits.flatMap((a) => allEntries(a).map((e) => e.author.trim())).filter(Boolean))];
  await adminRun(async () => {
    const added = await api.addEmployees(names, (useData.getState().employees || []).map((p) => p.name));
    await refreshEmployees();
    return `Added ${plural(added, 'employee')} from your audits.`;
  });
}

export async function adminDeleteEmployee(id: string) {
  const p = useData.getState().employees?.find((x) => x.id === id);
  if (!p) return;
  if (!(await askConfirm('Audits that name them are unaffected. To just hide them from the dropdown, use “Mark inactive” instead.', { title: `Remove ${p.name} from the employee list?`, confirmLabel: 'Remove', danger: true }))) return;
  await adminRun(async () => {
    await api.deleteEmployee(id);
    await refreshEmployees();
    return `${p.name} was removed.`;
  });
}

export function adminEditUser(id: string) {
  const u = useAdmin.getState().users?.find((x) => x.id === id);
  if (!u) return;
  set({ editUser: id, userDraft: { displayName: u.display_name || '', isAdmin: u.is_admin, active: u.active, password: '' } });
  clearAdminMessages();
}

export const adminCancelEditUser = () => set({ editUser: null, userDraft: null });

export async function adminSaveUser(id: string) {
  const u = useAdmin.getState().users?.find((x) => x.id === id);
  const d = useAdmin.getState().userDraft;
  if (!u || !d) return;
  const me = useSession.getState().profile!;
  const changes: UserChanges = {};
  if (d.displayName.trim() !== (u.display_name || '')) changes.displayName = d.displayName.trim();
  if (id !== me.id) {
    if (d.isAdmin !== u.is_admin) changes.isAdmin = d.isAdmin;
    if (d.active !== u.active) changes.active = d.active;
  }
  if (d.password) {
    if (d.password.length < 6) return adminFail('Passwords need at least 6 characters.');
    changes.password = d.password;
  }
  if (!Object.keys(changes).length) return adminCancelEditUser();
  if (changes.active === false && !(await askConfirm('They’ll be signed out and can’t sign in until you turn their account back on.', { title: `Disable ${u.username}?`, confirmLabel: 'Disable account', danger: true }))) return;
  await adminRun(async () => {
    await api.updateUser(id, changes);
    set({ editUser: null, userDraft: null });
    set({ users: await api.listUsers() });
    if (id === useSession.getState().profile?.id && changes.displayName !== undefined) useSession.setState({ profile: { ...useSession.getState().profile!, display_name: changes.displayName } });
    return `${u.username} was updated.`;
  });
}

export function adminEditEmployee(id: string) {
  const p = useData.getState().employees?.find((x) => x.id === id);
  if (!p) return;
  set({ editEmp: id, empDraft: { name: p.name, active: p.active } });
  clearAdminMessages();
}

export const adminCancelEditEmployee = () => set({ editEmp: null, empDraft: null });

export async function adminSaveEmployee(id: string) {
  const p = useData.getState().employees?.find((x) => x.id === id);
  const d = useAdmin.getState().empDraft;
  if (!p || !d) return;
  if (!d.name.trim()) return adminFail('Names can’t be empty.');
  const changes: { name?: string; active?: boolean } = {};
  if (d.name.trim() !== p.name) changes.name = d.name.trim();
  if (d.active !== p.active) changes.active = d.active;
  if (!Object.keys(changes).length) return adminCancelEditEmployee();
  await adminRun(async () => {
    await api.updateEmployee(id, changes);
    set({ editEmp: null, empDraft: null });
    await refreshEmployees();
    return `${changes.name || p.name} was updated.`;
  });
}
