import { cancelDelay, cancelEvery, delayBy, every, type Cancel, type Delay, type Schedule, type TimerHandle } from '../timers.ts';
import type { Audit, Finding, SavedAuditRow } from '../../types/audit.ts';

const KEY = (userId: string) => `aghs-audit-sync:v1:${userId}`;
const TOMBSTONE_LIMIT = 500;
const stamp = (audit: Partial<Audit> | null | undefined) => Number(audit?.updatedAt) || 0;

export type SyncStatus = 'idle' | 'saved' | 'error' | 'off';

interface SyncMeta {
  synced: Record<string, number>;
  deleted: string[];
  findings: Record<string, number>;
}

export function mergeAudits({ local, remote, synced, deleted }: { local: Audit[]; remote: Partial<SavedAuditRow>[]; synced: Record<string, number>; deleted: string[] }) {
  const mine = new Map(local.map((a) => [a.id, a]));
  const onServer = new Set<string>();
  const nextSynced = { ...synced };
  const uploads: Audit[] = [];
  const audits: Audit[] = [];
  let changed = false;
  for (const row of remote) {
    const theirs = row?.data;
    if (!theirs || typeof theirs !== 'object' || theirs.id !== row.id) continue;
    onServer.add(row.id);
    if (deleted.includes(row.id)) continue;
    const ours = mine.get(row.id);
    if (!ours || stamp(theirs) > stamp(ours)) {
      audits.push(theirs);
      nextSynced[row.id] = stamp(theirs);
      changed = true;
      continue;
    }
    audits.push(ours);
    if (stamp(ours) > stamp(theirs)) uploads.push(ours);
    else nextSynced[row.id] = stamp(ours);
  }
  for (const ours of local) {
    if (onServer.has(ours.id)) continue;
    if (Object.hasOwn(synced, ours.id) && stamp(ours) <= synced[ours.id]) {
      delete nextSynced[ours.id];
      changed = true;
      continue;
    }
    audits.push(ours);
    uploads.push(ours);
  }
  return { audits, synced: nextSynced, uploads, changed };
}

export interface SyncApi {
  saveAudit(audit: Audit): Promise<void>;
  listSavedAudits(): Promise<Partial<SavedAuditRow>[]>;
  deleteSavedAudit(id: string): Promise<void>;
  publishFindings?(auditId: string, rows: Finding[]): Promise<void>;
  deleteFindings(auditId: string): Promise<void>;
}

export interface AuditSync {
  pull(): Promise<void>;
  queue(audit: Audit): void;
  remove(id: string): void;
  stop(): Promise<void>;
  readonly status: SyncStatus;
}

export function createAuditSync({ api, userId, getAudits, setAudits, onChange = () => {}, onSaved = () => {}, findingsFor = null,
  storage = globalThis.localStorage,
  delay = delayBy, clear = cancelDelay,
  schedule = every(10000), cancel = cancelEvery }: {
  api: SyncApi;
  userId: string;
  getAudits: () => Audit[];
  setAudits: (list: Audit[]) => void;
  onChange?: () => void;
  onSaved?: (status: SyncStatus) => void;
  findingsFor?: ((audit: Audit) => Finding[]) | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  delay?: Delay;
  clear?: Cancel;
  schedule?: Schedule;
  cancel?: Cancel;
}): AuditSync {
  const read = (): SyncMeta => {
    try {
      const m = JSON.parse(storage.getItem(KEY(userId)) || 'null') as Partial<SyncMeta> | null;
      return {
        synced: m?.synced && typeof m.synced === 'object' ? m.synced : {},
        deleted: Array.isArray(m?.deleted) ? m.deleted : [],
        findings: m?.findings && typeof m.findings === 'object' ? m.findings : {},
      };
    } catch {
      return { synced: {}, deleted: [], findings: {} };
    }
  };
  const meta = read();
  let status: SyncStatus = 'idle';
  let findingsOff = !findingsFor || !api.publishFindings;
  let stopped = false;
  let pulling: Promise<void> | null = null;
  let flushing: Promise<void> = Promise.resolve();
  let timer: TimerHandle = null;
  const pending = new Map<string, Audit>();
  const write = () => {
    try {
      storage.setItem(KEY(userId), JSON.stringify(meta));
    } catch {
      return;
    }
  };
  const missingTable = (err: unknown) => /could not find the table|does not exist/i.test((err as Error)?.message || '');
  const setStatus = (next: SyncStatus) => {
    if (status === next) return;
    status = next;
    onSaved(status);
  };

  async function publish(audit: Audit) {
    if (findingsOff) return;
    const at = stamp(audit);
    if (meta.findings[audit.id] === at) return;
    try {
      await api.publishFindings!(audit.id, findingsFor!(audit));
      meta.findings[audit.id] = at;
      write();
    } catch (err) {
      if (missingTable(err)) findingsOff = true;
    }
  }

  const isDeleted = (id: string) => meta.deleted.includes(id);
  const forget = (id: string) => {
    if (!isDeleted(id)) meta.deleted.push(id);
    if (meta.deleted.length > TOMBSTONE_LIMIT) meta.deleted.splice(0, meta.deleted.length - TOMBSTONE_LIMIT);
    write();
  };
  const purge = async (id: string) => {
    if (!findingsOff) await api.deleteFindings(id).catch(() => {});
    await api.deleteSavedAudit(id);
  };

  async function upload(audit: Audit) {
    if (isDeleted(audit.id)) return;
    const at = stamp(audit);
    await api.saveAudit(audit);
    if ((meta.synced[audit.id] || 0) < at) meta.synced[audit.id] = at;
    write();
    await publish(audit);
  }

  function flush() {
    timer = null;
    const batch = [...pending.values()].filter((audit) => !isDeleted(audit.id));
    pending.clear();
    flushing = flushing.then(async () => {
      for (const audit of batch) {
        try {
          await upload(audit);
          setStatus('saved');
        } catch (err) {
          setStatus(missingTable(err) ? 'off' : 'error');
        }
      }
    });
    return flushing;
  }

  async function pull() {
    if (stopped || status === 'off') return;
    if (pulling) return pulling;
    pulling = (async () => {
      try {
        const remote = await api.listSavedAudits();
        if (stopped) return;
        for (const row of remote) {
          if (row?.id && isDeleted(row.id)) await purge(row.id);
        }
        const local = getAudits();
        const kept = local.filter((a) => !isDeleted(a.id));
        if (kept.length !== local.length) setAudits(kept);
        const result = mergeAudits({ local: kept, remote, synced: meta.synced, deleted: meta.deleted });
        meta.synced = result.synced;
        write();
        if (result.changed) {
          setAudits(result.audits);
          onChange();
        }
        for (const audit of result.uploads) await upload(audit);
        for (const id of Object.keys(meta.findings)) {
          if (result.audits.some((a) => a.id === id)) continue;
          delete meta.findings[id];
          write();
        }
        for (const audit of getAudits()) if (!isDeleted(audit.id)) await publish(audit);
        setStatus('saved');
      } catch (err) {
        setStatus(missingTable(err) ? 'off' : 'error');
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }

  const poll = schedule(() => { void pull(); });
  void pull();

  return {
    pull,
    queue(audit) {
      if (stopped || status === 'off' || !audit?.id || isDeleted(audit.id)) return;
      pending.set(audit.id, audit);
      if (timer) clear(timer);
      timer = delay(() => { void flush(); }, 800);
    },
    remove(id) {
      if (!id) return;
      pending.delete(id);
      delete meta.synced[id];
      delete meta.findings[id];
      forget(id);
      if (!findingsOff) api.deleteFindings(id).catch(() => {});
      if (status === 'off') return;
      void flushing.then(() => purge(id)).catch(() => {});
    },
    async stop() {
      if (stopped) return;
      cancel(poll);
      if (timer) {
        clear(timer);
        void flush();
      }
      stopped = true;
      await Promise.race([flushing, new Promise((r) => setTimeout(r, 2000))]);
    },
    get status() { return status; },
  };
}
