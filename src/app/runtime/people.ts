import * as api from '../../services/api/api.ts';
import { useAdmin, useData, useSession } from '../store/stores.ts';
import type { Audit } from '../../types/audit.ts';

export const generation = () => useSession.getState().generation;

export const allSites = () => useData.getState().homes || [];

export const isAdmin = () => Boolean(useSession.getState().profile?.is_admin);

const missingTable = (message: string) => /could not find the table|does not exist/i.test(message);

export async function refreshPhotos() {
  const gen = generation();
  try {
    const index = await api.listPhotos();
    if (gen === generation()) useData.setState({ photoIndex: index, photoError: '' });
  } catch (err) {
    if (gen === generation()) useData.setState({ photoIndex: new Map(), photoError: (err as Error).message });
  }
}

export const photoPath = (kind: string, id: string | null | undefined) => (id ? `${kind}/${id}.jpg` : null);

export const photoKey = (path: string) => `${path}@${useData.getState().photoIndex?.get(path) || ''}`;

const loadingPhotos = new Set<string>();

export function requestPhoto(path: string | null) {
  const { photoIndex, photoUrls } = useData.getState();
  if (!path || !photoIndex?.has(path)) return;
  const key = photoKey(path);
  if (photoUrls.has(key) || loadingPhotos.has(key)) return;
  loadingPhotos.add(key);
  const gen = generation();
  api.downloadPhoto(path)
    .then((blob) => {
      if (gen !== generation()) return;
      const urls = new Map(useData.getState().photoUrls);
      urls.set(key, URL.createObjectURL(blob));
      useData.setState({ photoUrls: urls });
    })
    .catch(() => {})
    .finally(() => loadingPhotos.delete(key));
}

export async function refreshEmployees() {
  const gen = generation();
  try {
    const list = await api.listEmployees();
    if (gen === generation() && useSession.getState().profile) useData.setState({ employees: list, employeesError: '' });
  } catch (err) {
    const message = (err as Error).message;
    if (gen === generation()) useData.setState({ employees: [], employeesError: missingTable(message) ? 'missing-table' : message });
  }
}

export const activeEmployeeNames = () => (useData.getState().employees || []).filter((p) => p.active).map((p) => p.name);

export const isEmployee = (name: string) => (useData.getState().employees || []).some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

export async function refreshHomes() {
  const gen = generation();
  try {
    const homes = await api.listHomes();
    if (gen === generation() && useSession.getState().profile) useData.setState({ homes, homesError: '' });
  } catch (err) {
    if (gen === generation()) useData.setState({ homesError: (err as Error).message });
  }
}

export function residentId(audit: Audit, name: string) {
  return allSites().find((h) => h.id === audit.siteId)?.residentRows?.find((r) => r.name === name)?.id || null;
}

export function auditorName(userId: string) {
  if (!isAdmin()) return '';
  const ad = useAdmin.getState();
  if (ad.users === null && !ad.busy) queueMicrotask(() => { void loadUsers(); });
  const u = ad.users?.find((x) => x.id === userId);
  return u ? u.display_name || u.username : '';
}

export async function loadUsers() {
  if (useAdmin.getState().busy) return;
  const gen = generation();
  useAdmin.setState({ busy: true });
  try {
    const users = await api.listUsers();
    if (gen === generation()) useAdmin.setState({ users });
  } catch (err) {
    if (gen === generation()) useAdmin.setState({ error: (err as Error).message, users: [] });
  }
  if (gen === generation()) useAdmin.setState({ busy: false });
}
