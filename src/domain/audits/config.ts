import type { Question } from '../../types/audit.ts';

export const APP_VERSION = '5.0.0';
export const GITHUB_URL = 'https://github.com/Angel-Gate-Health-Services/auditdepartment';

export const ORG = {
  name: 'Angel Gate Health Services',
  department: 'Auditing Department',
  version: `AGHS Audit v${APP_VERSION}`,
  reportTitle: 'Internal DSP Documentation Audit',
};

export const DEFAULT_SITES: never[] = [];

export const PAY_PERIOD_ANCHOR = '2025-12-21';

export const OVERVIEW = [
  'The DSP submissions listed below have been deemed insufficient for professional use cases. The audit log below provides details about each submission and the rationale behind the decision.',
  'The information provided below is based on the information given to the auditing department by the company’s official managers and provided information platforms. The audit log below contains no speculative or alleged information. It highlights repetitive inconsistencies within specific timeframes, clock-ins that do not align with scheduling, and other recorded data such as vague, empty, or incoherent submissions. Additionally, specific notes are included below.',
  'If a single box lists multiple dates or shift times, the infraction applies to the submitted document that matches all of those times and dates, as well as the author. Submissions from a specific DSP official that has repetitive and consistent plagiarism will not be recorded in the audit log but specified in the notes below.',
];

export const REASON_MAX = 200;
export const QUESTIONS: Question[] = [
  {
    key: 'progress',
    short: 'Progress notes',
    title: 'Are the progress notes complete?',
    help: 'Every PCP progress note should be answered, and each answer should relate to its question.',
    flagOn: 'no',
    why: 'Why are the progress notes incomplete?',
    subject: 'The progress notes are',
    tagLabel: 'Progress notes',
    reasons: [
      { key: 'copy', label: 'Copy and pasted text', text: 'The submitted documentation contains copy and pasted text within the progress notes.',
        part: 'copy-pasted', tag: 'copied' },
      { key: 'na', label: 'Answers given as “n/a”', text: 'The submitted documentation contains documented PCP progress notes, yet answers given by staff prompt “n/a”.',
        part: 'answered “n/a”', tag: '“n/a”' },
      { key: 'unrelated', label: 'Answers don’t match the questions', text: 'The submitted documentation contains PCP progress note answers that do not correlate with the questions provided.',
        part: 'off-topic', tag: 'off-topic' },
      { key: 'missing', label: 'Progress notes are missing', text: 'The submitted documentation is missing progress notes.',
        sentence: 'The progress notes are missing.', tag: 'missing', covers: true },
    ],
  },
  {
    key: 'summary',
    short: 'Daily summary',
    title: 'Is the daily summary complete?',
    help: 'The daily summary should be present and describe, in detail, how staff helped the individual.',
    flagOn: 'no',
    why: 'Why is the daily summary incomplete?',
    subject: 'The daily summary',
    tagLabel: 'Daily summary',
    reasons: [
      { key: 'vague', label: 'Lacks detail or context', text: 'The daily summary lacks further detailed context.',
        part: 'lacks detail', tag: 'vague' },
      { key: 'copy', label: 'Copy and pasted text', text: 'The daily summary contains copy and pasted text.',
        part: 'is copy-pasted', tag: 'copied' },
      { key: 'help', label: '“How did you help” not answered', text: 'The daily summary does not describe how staff helped the individual.',
        part: 'omits how staff helped', tag: 'no help noted' },
      { key: 'missing', label: 'No daily summary', text: 'The submitted documentation does not contain a daily summary.',
        sentence: 'There is no daily summary.', tag: 'missing', covers: true },
    ],
  },
  {
    key: 'missing',
    short: 'Required documentation',
    title: 'Is any required documentation missing?',
    help: 'Attendance, outcomes, or any other part of the submission that should be there.',
    flagOn: 'yes',
    why: 'What is missing?',
    items: 'not documented',
    tagLabel: 'Not documented',
    reasons: [
      { key: 'Food Intake', label: 'Food Intake', text: 'The submitted documentation does not document food intake.',
        part: 'food intake', tag: 'food intake' },
      { key: 'Body Inspection', label: 'Body Inspection', text: 'The submitted documentation does not document body inspection.',
        part: 'body inspections', plural: true, tag: 'body check' },
      { key: 'Hygiene', label: 'Hygiene', text: 'The submitted documentation does not document hygiene practices.',
        part: 'hygiene', tag: 'hygiene' },
      { key: 'BM', label: 'BM', text: 'The submitted documentation does not document bowel movements.',
        part: 'bowel movements', plural: true, tag: 'BM' },
      { key: 'Sleep', label: 'Sleep', text: 'The submitted documentation does not document sleep patterns.',
        part: 'sleep', tag: 'sleep' },
      { key: 'attendance', label: 'Attendance data', text: 'The submitted documentation is missing attendance data.',
        part: 'attendance data', tag: 'attendance' },
      { key: 'Wellness Check', label: 'Wellness Check', text: 'The submitted documentation does not document wellness checks.',
        part: 'wellness checks', plural: true, tag: 'wellness' },
      { key: 'clockin', label: 'Clock-in doesn’t match the schedule', text: 'The clock-in for this shift does not align with scheduling.',
        sentence: 'The clock-in does not match the schedule.', tag: 'clock-in mismatch' },
      { key: 'Documentation', label: 'All documentation', text: 'The essential support data does not contain any information.',
        sentence: 'The submission contains no information.', tag: 'empty submission', covers: true },
    ],
  },
];

export const GENERAL_EXAMPLES = {
  recommendations: [
    {
      title: 'Recommendation for Progress notes',
      text: 'If an activity is offered but did not occur, or a different activity is done in place of the chosen activity, it is recommended to state under the outcome that the activity may have not occurred, and what other activity took place. When documenting “Did you offer this on {Date}”: Choose yes, and type your answer.',
    },
    {
      title: 'Recommendation for daily summary',
      text: 'Under the “How did you help this individual” section, please give every answer thoroughly with 1-2 detailed sentences. If you did not help the individual do not choose any options. Although it is expected that every documenting DSP staff has helped the individual in some way.',
    },
  ],
  closing: 'These recommendations should be given to all locations within AGHS.',
};
