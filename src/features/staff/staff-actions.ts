import * as api from '../../services/api/api.ts';
import { employeeIndex, nameKey } from '../../domain/employees/stats.ts';
import { askConfirm, showAlert } from '../../components/dialog/dialog.ts';
import { useData, useStaff } from '../../app/store/stores.ts';
import { isAdmin, refreshEmployees } from '../../app/runtime/people.ts';
import { go } from '../../app/navigation/navigator.ts';
import { HOME_SORTS, STAFF_RANGES, STAFF_SORTS } from './staff-data.ts';

const set = useStaff.setState;

export function setStaffRange(value: string) {
  if (STAFF_RANGES.some(([k]) => k === value)) set({ range: value });
}

export function sortHomes(value: string) {
  if (HOME_SORTS.some(([k]) => k === value)) set({ homeSort: value });
}

export function sortStaff(value: string) {
  if (STAFF_SORTS.some(([k]) => k === value)) set({ sort: value });
}

export function editEmployeeProfile(id: string) {
  const e = (useData.getState().employees || []).find((x) => x.id === id);
  if (!e || !isAdmin()) return;
  set({ editing: id, message: null, draft: { name: e.name, title: e.title || '', hireDate: e.hire_date || '', primaryHomeId: e.primary_home_id || '', aliases: (e.aliases || []).join('\n'), active: Boolean(e.active) } });
}

export const cancelEmployeeEdit = () => set({ editing: null, draft: null });

export async function saveEmployeeEdit(id: string) {
  const st = useStaff.getState();
  const d = st.draft;
  if (!d || !isAdmin() || st.busy) return;
  const name = d.name.trim().replace(/\s+/g, ' ');
  if (!name) return void showAlert('Enter the employee’s full name.', { title: 'Name needed', tone: 'attention' });
  const aliases = [...new Map(d.aliases.split('\n').map((a) => a.trim().replace(/\s+/g, ' ')).filter((a) => a && nameKey(a) !== nameKey(name)).map((a) => [nameKey(a), a.slice(0, 200)])).values()].slice(0, 20);
  const clash = (useData.getState().employees || []).find((x) => x.id !== id && [x.name, ...(x.aliases || [])].some((n) => [name, ...aliases].some((a) => nameKey(a) === nameKey(n))));
  if (clash) return void showAlert(`${clash.name} already uses one of these names, so shifts couldn’t tell them apart.`, { title: 'Name already in use', tone: 'attention' });
  set({ busy: true });
  try {
    await api.updateEmployee(id, { name, title: d.title, hireDate: d.hireDate, primaryHomeId: d.primaryHomeId, aliases, active: d.active });
    await refreshEmployees();
    set({ editing: null, draft: null, message: { ok: true, text: `${name} was updated.` } });
  } catch (err) {
    const message = (err as Error).message;
    void showAlert(/column|schema cache/i.test(message) ? 'Run supabase/employee-stats.sql in the Supabase SQL Editor to turn on these fields.' : message, { title: 'Couldn’t save the employee' });
  } finally {
    set({ busy: false });
  }
}

export function startExcuse(id: string) {
  if (isAdmin()) set({ excusing: id, excuseNote: '' });
}

export const cancelExcuse = () => set({ excusing: null });

export async function saveExcuse(id: string) {
  const st = useStaff.getState();
  if (!isAdmin() || st.busy) return;
  if (!st.excuseNote.trim()) return void showAlert('Add a short reason so other admins know why it was excused.', { title: 'Reason needed', tone: 'attention' });
  set({ busy: true });
  try {
    const review = await api.excuseFinding(id, st.excuseNote);
    const reviews = new Map(useStaff.getState().reviews);
    reviews.set(id, review);
    set({ reviews, excusing: null, message: { ok: true, text: 'Flag excused. It no longer counts toward their statistics.' } });
  } catch (err) {
    void showAlert((err as Error).message, { title: 'Couldn’t excuse the flag' });
  } finally {
    set({ busy: false });
  }
}

export async function unexcuseFinding(id: string) {
  if (!isAdmin() || useStaff.getState().busy) return;
  if (!(await askConfirm('The flag will count toward their statistics again.', { title: 'Count this flag again?', confirmLabel: 'Count again' }))) return;
  set({ busy: true });
  try {
    await api.unexcuseFinding(id);
    const reviews = new Map(useStaff.getState().reviews);
    reviews.delete(id);
    set({ reviews, message: { ok: true, text: 'The flag counts again.' } });
  } catch (err) {
    void showAlert((err as Error).message, { title: 'Couldn’t change the flag' });
  } finally {
    set({ busy: false });
  }
}

export async function saveEmployeeNote(id: string) {
  const st = useStaff.getState();
  if (!isAdmin() || st.busy || st.noteDraft?.id !== id) return;
  const text = st.noteDraft.text;
  set({ busy: true });
  try {
    await api.saveEmployeeNote(id, text);
    const notes = new Map(useStaff.getState().notes);
    notes.set(id, { notes: text, updatedAt: new Date().toISOString() });
    set({ notes, message: { ok: true, text: 'Admin notes saved.' } });
  } catch (err) {
    void showAlert((err as Error).message, { title: 'Couldn’t save the notes' });
  } finally {
    set({ busy: false });
  }
}

export async function addUnlistedEmployee(name: string) {
  if (!isAdmin() || useStaff.getState().busy) return;
  set({ busy: true });
  try {
    await api.createEmployee(name);
    await refreshEmployees();
    const added = employeeIndex(useData.getState().employees).get(nameKey(name));
    set({ message: { ok: true, text: `${name} was added to the employee list.` } });
    if (added) go('employees', added.id);
  } catch (err) {
    void showAlert((err as Error).message, { title: 'Couldn’t add the employee' });
  } finally {
    set({ busy: false });
  }
}

export async function aliasUnlisted(name: string, select: HTMLSelectElement) {
  const target = (useData.getState().employees || []).find((e) => e.id === select.value);
  if (!isAdmin() || !target || useStaff.getState().busy) return;
  if (!(await askConfirm(`Shifts typed as “${name}” will count toward ${target.name}.`, { title: `Count as ${target.name}?`, confirmLabel: 'Count as them' }))) {
    select.value = '';
    return;
  }
  set({ busy: true });
  try {
    await api.updateEmployee(target.id, { aliases: [...new Set([...(target.aliases || []), name])].slice(0, 20) });
    await refreshEmployees();
    set({ message: { ok: true, text: `“${name}” now counts toward ${target.name}.` } });
    go('employees', target.id);
  } catch (err) {
    const message = (err as Error).message;
    void showAlert(/column|schema cache/i.test(message) ? 'Run supabase/employee-stats.sql in the Supabase SQL Editor to turn on other spellings.' : message, { title: 'Couldn’t update the employee' });
  } finally {
    set({ busy: false });
  }
}

export function loadEmployeeNote(id: string) {
  const st = useStaff.getState();
  if (!isAdmin() || st.notes.get(id) !== undefined) return;
  const pending = new Map(st.notes);
  pending.set(id, null);
  set({ notes: pending });
  const finish = (value: { notes: string; updatedAt?: string | null; error?: string }) => {
    const notes = new Map(useStaff.getState().notes);
    notes.set(id, value);
    set({ notes });
  };
  api.getEmployeeNote(id)
    .then((row) => finish({ notes: row?.notes || '', updatedAt: row?.updated_at || null }))
    .catch((err: Error) => finish({ notes: '', error: /could not find the table|does not exist/i.test(err.message) ? 'missing-table' : err.message }));
}
