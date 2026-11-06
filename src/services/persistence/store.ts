import { migrateNoteExamples } from '../../domain/audits/model.ts';
import type { Audit } from '../../types/audit.ts';

export interface LocalDb {
  audits: Audit[];
  auditor: string;
}

const keyFor = (userId: string) => `aghs-audit-builder:v2:${userId}`;

export function load(userId: string, storage: Storage = globalThis.localStorage): LocalDb {
  try {
    const raw = storage.getItem(keyFor(userId));
    const d = JSON.parse(raw as string) as Partial<LocalDb> | null;
    if (d && Array.isArray(d.audits)) return { audits: d.audits.map(migrateNoteExamples), auditor: d.auditor || '' };
  } catch {
    return { audits: [], auditor: '' };
  }
  return { audits: [], auditor: '' };
}

export function save(db: LocalDb, userId: string, storage: Storage = globalThis.localStorage) {
  try {
    storage.setItem(keyFor(userId), JSON.stringify({ audits: db.audits, auditor: db.auditor }));
    return true;
  } catch {
    return false;
  }
}
