import type { Audit, Completion, Profile } from '../../types/audit.ts';

export function completionMatchesAudit(record: Completion | null | undefined, audit: Audit, userId: string | null | undefined) {
  if (!record || record.home_id !== audit.siteId || record.pay_period_start !== audit.payStart) return false;
  if (audit.completionId) return audit.completionId === record.id;
  return Boolean(audit.completedAt && record.completed_by === userId && audit.completedAt === record.completed_at);
}

export const canReopenCompletion = (record: Completion | null | undefined, profile: Profile | null | undefined) => Boolean(
  record && profile?.is_admin
);
