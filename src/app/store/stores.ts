import { create } from 'zustand';
import type {
  ActivityRecord, Audit, AuditViewer, ClockImport, ClockShift, Completion, Employee, Finding, FindingReview, Home, OthersLiveAudit, Profile, TrackedSession,
} from '../../types/audit.ts';
import type { WatcherSnapshot } from '../../services/live-audit/audit-watcher.ts';
import type { ViewerState } from '../../services/live-audit/live-audit.ts';

export interface Message { ok: boolean; text: string }

export const useSession = create(() => ({
  checked: false,
  profile: null as Profile | null,
  generation: 0,
}));

export const useAudits = create(() => ({
  audits: [] as Audit[],
  auditor: '',
}));

export const freshData = () => ({
  homes: null as Home[] | null,
  homesError: '',
  employees: null as Employee[] | null,
  employeesError: '',
  photoIndex: null as Map<string, string> | null,
  photoUrls: new Map<string, string>(),
  photoError: '',
});
export const useData = create(freshData);

export interface CompletionState {
  list: Completion[] | null;
  loadedAt: number;
  loading: boolean;
  error: string;
  version: number;
}

export const freshProgress = () => ({
  completions: {} as Record<string, CompletionState>,
  progressOpen: false,
  progressPeriod: null as number | null,
  progressSlide: 0,
  completing: false,
  deleting: false,
  completeMsg: null as Message | null,
});
export const useProgress = create(freshProgress);

export const freshUi = () => ({
  error: '',
  pickingSite: false,
  pdfUrl: null as string | null,
  login: { username: '', password: '', busy: false, error: '' },
  settings: { password: '', busy: false, message: null as Message | null },
  othersAudits: { list: null as OthersLiveAudit[] | null, loading: false, error: '', loadedAt: 0 },
  liveViewers: [] as AuditViewer[],
  hub: { activity: null as ActivityRecord[] | null, loadedAt: 0, loading: false },
  auditSort: null as string | null,
  periodsOpen: null as Set<number> | null,
});
export const useUi = create(freshUi);

export interface HomeDraft { name: string; address: string; phone: string; managerTitle: string; manager: string; cell: string; email: string; supervisor: string }
export interface NewUserDraft { username: string; displayName: string; password: string; isAdmin: boolean }
export interface UserDraft { displayName: string; isAdmin: boolean; active: boolean; password: string }
export interface EmployeeDraft { name: string; active: boolean }

export const freshAdmin = () => ({
  tab: 'sites',
  users: null as Profile[] | null,
  notice: '',
  error: '',
  busy: false,
  draft: null as HomeDraft | null,
  draftFor: null as string | null,
  newUser: null as NewUserDraft | null,
  empAdd: { text: '' },
  editUser: null as string | null,
  userDraft: null as UserDraft | null,
  editEmp: null as string | null,
  empDraft: null as EmployeeDraft | null,
  editHome: null as string | null,
  acct: null as { displayName: string; password: string } | null,
  sessions: null as TrackedSession[] | null,
  sessionsError: '',
  sessionsLoading: false,
  sessionsClock: 0,
});
export const useAdmin = create(freshAdmin);

export interface ProfileDraft { name: string; title: string; hireDate: string; primaryHomeId: string; aliases: string; active: boolean }
export interface EmployeeNote { notes: string; updatedAt?: string | null; error?: string }

export const freshStaff = () => ({
  findings: null as Finding[] | null,
  reviews: new Map<string, FindingReview>(),
  completions: [] as Completion[],
  homeSort: 'flagged',
  error: '',
  loading: false,
  loadedAt: 0,
  range: 'all',
  sort: 'flagged',
  search: '',
  draft: null as ProfileDraft | null,
  editing: null as string | null,
  excusing: null as string | null,
  excuseNote: '',
  notes: new Map<string, EmployeeNote | null>(),
  noteDraft: null as { id: string; text: string } | null,
  busy: false,
  message: null as Message | null,
});
export const useStaff = create(freshStaff);

export const freshClock = () => ({
  imports: null as ClockImport[] | null,
  importsError: '',
  shifts: new Map<string, ClockShift[]>(),
  shiftsError: '',
  people: new Map<string, ClockShift[]>(),
  peopleError: '',
  loadingPeople: null as string | null,
  loadingPeriod: null as string | null,
  loadedAt: 0,
  period: null as number | null,
  view: 'all',
  sort: 'name',
  lowHours: 32,
  search: '',
  shiftSearch: '',
  open: null as string | null,
  busy: false,
  message: null as Message | null,
});
export const useClock = create(freshClock);

export const freshStatus = () => ({
  saveState: '',
  sessionSeconds: 0,
  sessionWarning: false,
  warningSeconds: null as number | null,
  toast: null as { id: number; message: string } | null,
  watcher: null as WatcherSnapshot | null,
  viewer: null as ViewerState | null,
  viewerVersion: 0,
  publishingAuditId: null as string | null,
  instant: false,
});
export const useStatus = create(freshStatus);

export function resetSessionStores() {
  useAudits.setState({ audits: [], auditor: '' }, true);
  useData.setState(freshData(), true);
  useProgress.setState(freshProgress(), true);
  useUi.setState(freshUi(), true);
  useAdmin.setState(freshAdmin(), true);
  useStaff.setState(freshStaff(), true);
  useClock.setState(freshClock(), true);
  const { saveState: _save, ...rest } = freshStatus();
  useStatus.setState({ ...rest, sessionSeconds: useStatus.getState().sessionSeconds });
}
