export type Answer = 'yes' | 'no';
export type QuestionKey = 'progress' | 'summary' | 'missing' | (string & {});

export interface Reason {
  key: string;
  label: string;
  text: string;
  part?: string;
  sentence?: string;
  tag: string;
  covers?: boolean;
  plural?: boolean;
}

export interface Question {
  key: QuestionKey;
  short: string;
  title: string;
  help: string;
  flagOn: Answer;
  why: string;
  subject?: string;
  items?: string;
  tagLabel: string;
  reasons: Reason[];
}

export interface Check {
  answer: Answer | null;
  reasons: string[];
  otherOn: boolean;
  other: string;
  notes: string;
}

export interface Entry {
  id: string;
  createdAt: number;
  allShifts: boolean;
  otherThanListed: boolean;
  date: string;
  author: string;
  shiftStart: string;
  shiftEnd: string;
  checks: Record<string, Check>;
  reasonOverride: string | null;
}

export type DayIssue = '' | 'one' | 'none';

export interface Individual {
  notes: string;
  entries: Entry[];
  adequate?: boolean;
  dayIssues?: Record<string, DayIssue>;
}

export interface SiteSnapshot {
  name: string;
  address: string;
  phone: string;
  managerTitle: string;
  manager: string;
  cell: string;
  email: string;
  supervisor: string;
  residents: string[];
}

export interface Site extends SiteSnapshot {
  id: string;
}

export interface Recommendation {
  title: string;
  text: string;
  exampleIndex?: number;
}

export interface GeneralNotes {
  notes: string;
  repeatStaff: string[] | null;
  recommendations: Recommendation[];
  closing: string;
  examplesAsPlaceholders?: boolean;
}

export interface Audit {
  id: string;
  createdAt: number;
  updatedAt: number;
  auditDate: string;
  auditor: string;
  siteId: string;
  site: SiteSnapshot;
  payStart: string;
  payEnd: string;
  individuals: Record<string, Individual>;
  general: GeneralNotes;
  completedAt?: string;
  completionId?: string;
}

export interface PayPeriod {
  index: number;
  number: number;
  year: string;
  start: string;
  end: string;
  payDate: string;
}

export interface Completion {
  id: string;
  pay_period_start: string;
  home_id: string;
  completed_by?: string | null;
  completed_by_name?: string;
  completed_at: string;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  active: boolean;
  created_at?: string;
}

export interface ResidentRow {
  id: string;
  name: string;
}

export interface Home extends Site {
  residentRows: ResidentRow[];
}

export interface Employee {
  id: string;
  name: string;
  active: boolean;
  aliases?: string[];
  title?: string | null;
  hire_date?: string | null;
  primary_home_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityRecord {
  home_id: string;
  pay_period_start: string;
  user_id: string;
  session_id: string;
  audit_id: string;
  expires_at: string;
}

export interface FindingFlag {
  q: string;
  reasons: string[];
  other: boolean;
}

export interface Finding {
  id: string;
  audit_id: string;
  entry_id: string;
  employee_name: string;
  employee_key: string;
  home_id: string | null;
  home_name: string | null;
  pay_period_start: string | null;
  shift_date: string | null;
  shift_start: string | null;
  shift_end: string | null;
  all_shifts: boolean;
  complete: boolean;
  flagged: boolean;
  flags: FindingFlag[];
  audit_completed: boolean;
  auditor_id?: string | null;
  updated_at?: string;
}

export interface ClockImport {
  id: string;
  range_start: string;
  range_end: string;
  file_name: string;
  file_hash: string;
  shift_count: number;
  employee_count: number;
  uploaded_by?: string | null;
  uploader_name: string;
  uploaded_at: string;
}

export interface ClockShift {
  id?: number;
  import_id?: string;
  employee_name: string;
  employee_key: string;
  site_name: string;
  work_date: string;
  clock_in: string;
  clock_out: string;
  minutes: number;
}

export interface FindingReview {
  finding_id: string;
  excused: boolean;
  note: string;
  reviewed_by?: string | null;
  reviewer_name?: string;
  updated_at?: string;
}

export interface LivePosition {
  view?: string;
  individual?: string;
  entryId?: string | null;
  step?: string | null;
}

export interface LiveAudit {
  audit: Audit;
  homeId: string;
  ownerId: string;
  ownerName: string;
  position: LivePosition;
  updatedAt: string;
  active: boolean;
}

export interface OthersLiveAudit {
  auditId: string;
  audit: Audit;
  homeId: string;
  ownerId: string;
  ownerName: string;
  updatedAt: string;
}

export interface AuditViewer {
  viewer_id: string;
  viewer_name: string;
  seen_at: string;
}

export interface TrackedSession {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  online: boolean;
  startedAt: string;
  lastSeen: string;
  endedAt: string | null;
  ip: string | null;
  location: string;
  userAgent: string | null;
  auditing: { home: string; auditId: string }[];
  current: boolean;
  canSignOut: boolean;
}

export interface SavedAuditRow {
  id: string;
  data: Audit;
  updated_at?: string;
}
