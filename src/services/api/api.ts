import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, USERNAME_DOMAIN } from './config.ts';
import type {
  ActivityRecord, Audit, AuditViewer, ClockImport, ClockShift, Completion, Employee, Finding, FindingReview, Home, LiveAudit, LivePosition,
  OthersLiveAudit, Profile, ResidentRow, SavedAuditRow, Site, TrackedSession,
} from '../../types/audit.ts';
import type { Lease } from '../live-audit/audit-watcher.ts';

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

const projectUrl = SUPABASE_URL.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');

const supabase = (configured
  ? createClient(projectUrl, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'aghs-auth' } })
  : null) as SupabaseClient;

const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

interface PgError { message: string; code?: string; hint?: string }

export class ApiError extends Error {
  code?: string;
  hint?: string;
  constructor(error: PgError) {
    super(error.message);
    this.code = error.code;
    this.hint = error.hint;
  }
}

function check({ data, error }: { data: unknown; error: PgError | null }): unknown {
  if (error) throw new Error(error.message);
  return data;
}

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onSignedOut(callback: () => void) {
  return supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  }).data.subscription;
}

export async function signIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) {
    if (/banned/i.test(error.message)) throw new Error('This account has been disabled. Contact your administrator.');
    if (/invalid login credentials/i.test(error.message)) throw new Error('Incorrect username or password.');
    throw new Error(`Sign-in isn’t available right now (${error.message}). Contact your administrator.`);
  }
  return loadProfile();
}

export async function loadProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = check(await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()) as Profile | null;
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    throw new Error(profile ? 'This account has been disabled. Contact your administrator.' : 'This account isn’t set up yet. Contact your administrator.');
  }
  return profile;
}

export async function changeOwnPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(/same/i.test(error.message) ? 'Choose a password you haven’t used for this account.' : error.message);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function clearBrowserSession() {
  await supabase.auth.signOut({ scope: 'local' });
}

interface HomeRow {
  id: string; name: string; address: string; phone: string; manager_title: string; manager: string; cell: string; email: string; supervisor: string;
  residents?: ResidentRow[];
}

const toHome = (row: HomeRow): Home => ({
  id: row.id,
  name: row.name,
  address: row.address,
  phone: row.phone,
  managerTitle: row.manager_title,
  manager: row.manager,
  cell: row.cell,
  email: row.email,
  supervisor: row.supervisor,
  residentRows: [...(row.residents || [])].sort((a, b) => a.name.localeCompare(b.name)),
  residents: (row.residents || []).map((r) => r.name),
});

export type HomeInput = Partial<Omit<Site, 'id' | 'residents'>> & { name: string; residents?: string[] };

const fromHome = (h: HomeInput) => ({
  name: h.name.trim(),
  address: (h.address || '').trim(),
  phone: (h.phone || '').trim(),
  manager_title: (h.managerTitle || 'Lead').trim(),
  manager: (h.manager || '').trim(),
  cell: (h.cell || '').trim(),
  email: (h.email || '').trim(),
  supervisor: (h.supervisor || '').trim(),
});

export async function listHomes() {
  return (check(await supabase.from('homes').select('*, residents(id, name)').order('name')) as HomeRow[]).map(toHome);
}

export async function createHome(home: HomeInput) {
  return (check(await supabase.from('homes').insert(fromHome(home)).select('id').single()) as { id: string }).id;
}

export async function updateHome(id: string, home: HomeInput) {
  check(await supabase.from('homes').update(fromHome(home)).eq('id', id));
}

export async function deleteHome(id: string) {
  check(await supabase.from('homes').delete().eq('id', id));
}

export async function addResident(homeId: string, name: string) {
  check(await supabase.from('residents').insert({ home_id: homeId, name: name.trim() }));
}

export async function renameResident(id: string, name: string) {
  check(await supabase.from('residents').update({ name: name.trim() }).eq('id', id));
}

export async function deleteResident(id: string) {
  check(await supabase.from('residents').delete().eq('id', id));
}

export async function importHomes(sites: HomeInput[], existingNames: string[]) {
  const have = new Set(existingNames.map((n) => n.toLowerCase()));
  let added = 0;
  for (const s of sites) {
    if (!s.name || have.has(s.name.toLowerCase())) continue;
    const id = await createHome(s);
    const residents = (s.residents || []).map((r) => String(r).trim()).filter(Boolean);
    if (residents.length) check(await supabase.from('residents').insert(residents.map((name) => ({ home_id: id, name }))));
    added++;
  }
  return added;
}

const duplicateName = (error: PgError | null) => (error?.code === '23505' ? new Error('An employee with that name already exists.') : null);

export async function listEmployees() {
  return check(await supabase.from('employees').select('*').order('name')) as Employee[];
}

export async function createEmployee(name: string) {
  const { error } = await supabase.from('employees').insert({ name: name.trim() });
  if (error) throw duplicateName(error) || new Error(error.message);
}

export async function addEmployees(names: string[], existing: string[]) {
  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  const fresh = [...new Map(names.map((n) => n.trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()]
    .filter((n) => !have.has(n.toLowerCase()));
  if (fresh.length) check(await supabase.from('employees').insert(fresh.map((name) => ({ name }))));
  return fresh.length;
}

export interface EmployeeChanges {
  name?: string;
  active?: boolean;
  title?: string;
  hireDate?: string;
  primaryHomeId?: string;
  aliases?: string[];
}

export async function updateEmployee(id: string, changes: EmployeeChanges) {
  const row: Record<string, unknown> = {};
  if (changes.name !== undefined) row.name = changes.name.trim();
  if (changes.active !== undefined) row.active = Boolean(changes.active);
  if (changes.title !== undefined) row.title = changes.title.trim() || null;
  if (changes.hireDate !== undefined) row.hire_date = changes.hireDate || null;
  if (changes.primaryHomeId !== undefined) row.primary_home_id = changes.primaryHomeId || null;
  if (changes.aliases !== undefined) row.aliases = changes.aliases;
  const { error } = await supabase.from('employees').update(row).eq('id', id);
  if (error) throw duplicateName(error) || new Error(error.message);
}

export async function deleteEmployee(id: string) {
  check(await supabase.from('employees').delete().eq('id', id));
}

const PHOTOS = 'avatars';
export const PHOTO_FOLDERS = ['residents', 'employees', 'users'] as const;

export async function listPhotos() {
  const index = new Map<string, string>();
  for (const folder of PHOTO_FOLDERS) {
    const { data, error } = await supabase.storage.from(PHOTOS).list(folder, { limit: 1000 });
    if (error) throw new Error(error.message);
    for (const f of data || []) if (f.name && !f.name.startsWith('.')) index.set(`${folder}/${f.name}`, f.updated_at || f.created_at || '');
  }
  return index;
}

export async function downloadPhoto(path: string) {
  const { data, error } = await supabase.storage.from(PHOTOS).download(path);
  if (error) throw new Error(error.message);
  return data;
}

export async function uploadPhoto(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(PHOTOS).upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? 'Photos aren’t set up yet. Run supabase/photos.sql in the Supabase SQL Editor.' : error.message);
}

export async function deletePhoto(path: string) {
  const { error } = await supabase.storage.from(PHOTOS).remove([path]);
  if (error) throw new Error(error.message);
}

export async function listAuditActivity() {
  return check(await supabase.from('audit_activity').select('*')) as ActivityRecord[];
}

const activityParams = (lease: Lease) => ({ p_home_id: lease.homeId, p_pay_period_start: lease.payStart, p_session_id: lease.sessionId, p_audit_id: lease.auditId });

export async function claimAuditSite(lease: Lease) {
  return (check(await supabase.rpc('claim_audit_site', activityParams(lease))) as ActivityRecord[] | null)?.[0] || null;
}

export async function renewAuditSite(lease: Lease) {
  return (check(await supabase.rpc('renew_audit_site', activityParams(lease))) as ActivityRecord[] | null)?.[0] || null;
}

export async function releaseAuditSite(lease: Lease) {
  check(await supabase.rpc('release_audit_site', activityParams(lease)));
}

export async function listSavedAudits() {
  return check(await supabase.from('saved_audits').select('id, data, updated_at')) as SavedAuditRow[];
}

export async function saveAudit(audit: Audit) {
  check(await supabase.from('saved_audits').upsert({ id: audit.id, home_id: audit.siteId || null, pay_period_start: audit.payStart || null, data: audit }, { onConflict: 'id' }));
}

export async function deleteSavedAudit(id: string) {
  check(await supabase.from('saved_audits').delete().eq('id', id));
}

const missingTable = (message: string) => /could not find the (table|function)|does not exist|schema cache/i.test(message);

export async function listClockImports() {
  const { data, error } = await supabase.from('clock_imports').select('*').order('range_start', { ascending: false }).limit(500);
  if (error) throw missingTable(error.message) ? new ApiError({ ...error, hint: 'missing_table' }) : new ApiError(error);
  return data as ClockImport[];
}

export async function listClockShifts(start: string, end: string) {
  const rows: ClockShift[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await supabase.from('clock_shifts')
      .select('id, import_id, employee_name, employee_key, site_name, work_date, clock_in, clock_out, minutes')
      .gte('work_date', start).lte('work_date', end).order('id').range(from, from + 999)) as ClockShift[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function listClockShiftsFor(keys: string[]) {
  const rows: ClockShift[] = [];
  if (!keys.length) return rows;
  for (let from = 0; ; from += 1000) {
    const page = check(await supabase.from('clock_shifts')
      .select('id, import_id, employee_name, employee_key, site_name, work_date, clock_in, clock_out, minutes')
      .in('employee_key', keys).order('work_date', { ascending: false }).order('id').range(from, from + 999)) as ClockShift[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function importClockShifts(args: { rangeStart: string; rangeEnd: string; fileName: string; fileHash: string; rows: ClockShift[]; overwrite: boolean }) {
  const result: { data: unknown; error: PgError | null } = await supabase.rpc('import_clock_shifts', {
    p_range_start: args.rangeStart,
    p_range_end: args.rangeEnd,
    p_file_name: args.fileName,
    p_file_hash: args.fileHash,
    p_rows: args.rows,
    p_overwrite: args.overwrite,
  });
  const { data, error } = result;
  if (error) throw missingTable(error.message) ? new ApiError({ ...error, hint: 'missing_table' }) : new ApiError(error);
  return ((data as ClockImport[] | null) || [])[0] || null;
}

export async function deleteClockImport(id: string) {
  const { data, error } = await supabase.from('clock_imports').delete().eq('id', id).select('id');
  if (error) throw new ApiError(error);
  if (!(data as unknown[] | null)?.length) throw new Error('That upload was already removed.');
}

export async function listFindings() {
  const rows: Finding[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await supabase.from('shift_findings').select('*').order('id').range(from, from + 999)) as Finding[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function publishFindings(auditId: string, rows: Finding[]) {
  if (rows.length) check(await supabase.from('shift_findings').upsert(rows, { onConflict: 'id' }));
  const keep = rows.map((r) => r.id);
  let stale = supabase.from('shift_findings').delete().eq('audit_id', auditId);
  if (keep.length) stale = stale.not('id', 'in', `(${keep.map((id) => `"${id.replace(/"/g, '')}"`).join(',')})`);
  check(await stale);
}

export async function deleteFindings(auditId: string) {
  check(await supabase.from('shift_findings').delete().eq('audit_id', auditId));
}

export async function listFindingReviews() {
  return check(await supabase.from('finding_reviews').select('*')) as FindingReview[];
}

export async function excuseFinding(findingId: string, note: string) {
  return check(await supabase.from('finding_reviews').upsert({ finding_id: findingId, excused: true, note: note.trim().slice(0, 500) }, { onConflict: 'finding_id' }).select('*').single()) as FindingReview;
}

export async function unexcuseFinding(findingId: string) {
  check(await supabase.from('finding_reviews').delete().eq('finding_id', findingId));
}

export async function getEmployeeNote(employeeId: string) {
  return check(await supabase.from('employee_notes').select('notes, updated_at').eq('employee_id', employeeId).maybeSingle()) as { notes: string; updated_at: string } | null;
}

export async function saveEmployeeNote(employeeId: string, notes: string) {
  check(await supabase.from('employee_notes').upsert({ employee_id: employeeId, notes: notes.slice(0, 5000) }, { onConflict: 'employee_id' }));
}

export async function listAllCompletions() {
  return check(await supabase.from('audit_completions').select('id, home_id, pay_period_start, completed_by_name, completed_at').order('pay_period_start', { ascending: false }).limit(2000)) as Completion[];
}

export async function listCompletions(payPeriodStart: string) {
  return check(await supabase.from('audit_completions').select('*').eq('pay_period_start', payPeriodStart)) as Completion[];
}

export async function markAuditComplete(payPeriodStart: string, homeId: string, completionId: string) {
  const { data, error } = await supabase.from('audit_completions')
    .insert({ id: completionId, pay_period_start: payPeriodStart, home_id: homeId })
    .select('*')
    .single<Completion>();
  if (error) {
    if (error.code === '23505' && completionId) {
      const existing = check(await supabase.from('audit_completions').select('*').eq('id', completionId).maybeSingle()) as Completion | null;
      if (existing?.pay_period_start === payPeriodStart && existing?.home_id === homeId) return existing;
    }
    throw new Error(error.code === '23505' ? 'This site is already marked complete for this pay period.' : error.message);
  }
  return data;
}

export async function reopenAudit(completionId: string) {
  const removed = check(await supabase.from('audit_completions').delete().eq('id', completionId).select('id')) as { id: string }[] | null;
  if (removed?.length) return;
  const existing = check(await supabase.from('audit_completions').select('id').eq('id', completionId).maybeSingle());
  if (existing) throw new Error('Only admins can undo audit progress.');
}

export async function listUsers() {
  return check(await supabase.from('profiles').select('*').order('username')) as Profile[];
}

interface FunctionError extends Error { status?: number }

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const result = await supabase.functions.invoke<T>(name, { body });
  const data = result.data;
  const error = result.error as unknown;
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = (error as Error).message;
    try {
      message = ((await context!.json()) as { error?: string }).error || message;
    } catch {
      message = message || (error as Error).message;
    }
    throw Object.assign(new Error(message), { status: context?.status }) as FunctionError;
  }
  return data as T;
}

const adminUsers = <T,>(body: Record<string, unknown>) => callFunction<T>('admin-users', body);

export interface NewUser { username: string; displayName: string; password: string; isAdmin: boolean }
export interface UserChanges { displayName?: string; isAdmin?: boolean; active?: boolean; password?: string }

export const createUser = (user: NewUser) => adminUsers<{ id: string }>({ action: 'create', ...user });
export const updateUser = (id: string, changes: UserChanges) => adminUsers<{ ok: boolean }>({ action: 'update', id, ...changes });
export const deleteUser = (id: string) => adminUsers<{ ok: boolean }>({ action: 'delete', id });

interface TrackedResponse { id?: string; ok?: boolean; signedOut?: boolean }

const trackedSession = async (body: Record<string, unknown>) => {
  const signedOut = () => Object.assign(new Error('An admin signed you out.'), { signedOut: true });
  const d = await callFunction<TrackedResponse>('session-monitor', body).catch(async (err: FunctionError) => {
    if (err.status === 401 && !(await supabase.auth.getUser()).data.user) throw signedOut();
    throw err;
  });
  if (d?.signedOut) throw signedOut();
  return d;
};
export const startTrackedSession = () => trackedSession({ action: 'start' }).then((d) => d.id as string);
export const pingTrackedSession = (id: string) => trackedSession({ action: 'ping', id }).then((d) => Boolean(d?.ok));
export const endTrackedSession = (id: string) => callFunction('session-monitor', { action: 'end', id });
export const listSignedInSessions = () => callFunction<{ now: string; sessions: TrackedSession[] }>('session-monitor', { action: 'list' });

export const signOutSessions = (userId: string, id?: string) => callFunction<{ ok: boolean; ended: number }>('session-monitor', { action: 'kick', userId, ...(id ? { id } : {}) });

export async function publishLiveAudit({ auditId, homeId, data, position }: { auditId: string; homeId: string; data: Audit; position: LivePosition }) {
  check(await supabase.from('live_audits').upsert({ audit_id: auditId, home_id: homeId, data, position }, { onConflict: 'audit_id' }));
}

export async function removeLiveAudit(auditId: string) {
  check(await supabase.from('live_audits').delete().eq('audit_id', auditId));
}

interface LiveRow { audit_id: string; user_id: string; home_id: string; data: Audit; position?: LivePosition; updated_at: string }
interface PersonRow { id: string; username: string; display_name: string }

export async function getLiveAudit(auditId: string): Promise<LiveAudit | null> {
  const row = check(await supabase.from('live_audits').select('audit_id, user_id, home_id, data, position, updated_at').eq('audit_id', auditId).maybeSingle()) as LiveRow | null;
  if (!row) return null;
  const [owner, holding] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name').eq('id', row.user_id).maybeSingle().then(check) as Promise<PersonRow | null>,
    supabase.from('audit_activity').select('audit_id').eq('audit_id', auditId).eq('user_id', row.user_id).gt('expires_at', new Date().toISOString()).limit(1).then(check) as Promise<unknown[]>,
  ]);
  return {
    audit: row.data,
    homeId: row.home_id,
    ownerId: row.user_id,
    ownerName: owner?.display_name || owner?.username || 'Another user',
    position: row.position || {},
    updatedAt: row.updated_at,
    active: holding.length > 0,
  };
}

export async function listOthersLiveAudits(exceptUserId: string): Promise<OthersLiveAudit[]> {
  const rows = check(await supabase.from('live_audits').select('audit_id, user_id, home_id, data, updated_at')
    .neq('user_id', exceptUserId).order('updated_at', { ascending: false })) as LiveRow[];
  if (!rows.length) return [];
  const [people, holding] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name').in('id', [...new Set(rows.map((r) => r.user_id))]).then(check) as Promise<PersonRow[]>,
    supabase.from('audit_activity').select('audit_id, user_id').in('audit_id', rows.map((r) => r.audit_id)).gt('expires_at', new Date().toISOString()).then(check) as Promise<{ audit_id: string; user_id: string }[]>,
  ]);
  const names = new Map(people.map((p) => [p.id, p.display_name || p.username]));
  return rows
    .filter((r) => holding.some((h) => String(h.audit_id) === r.audit_id && h.user_id === r.user_id))
    .map((r) => ({ auditId: r.audit_id, audit: r.data, homeId: r.home_id, ownerId: r.user_id, ownerName: names.get(r.user_id) || 'Another user', updatedAt: r.updated_at }));
}

export async function listAuditViewers(auditId: string) {
  return check(await supabase.from('audit_viewers').select('viewer_id, viewer_name, seen_at').eq('audit_id', auditId)) as AuditViewer[];
}

export async function markViewingAudit(auditId: string) {
  check(await supabase.from('audit_viewers').upsert({ audit_id: auditId }, { onConflict: 'audit_id,viewer_id' }));
}

export async function stopViewingAudit(auditId: string) {
  const user = (await supabase.auth.getSession()).data.session?.user;
  if (user) check(await supabase.from('audit_viewers').delete().eq('audit_id', auditId).eq('viewer_id', user.id));
}
