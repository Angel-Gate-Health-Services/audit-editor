import * as api from '../../services/api/api.ts';
import { ApiError } from '../../services/api/api.ts';
import { askConfirm, showAlert } from '../../components/dialog/dialog.ts';
import { plural } from '../../components/ui/basics.tsx';
import { fmtRange, payPeriodAt, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { parseReport, ReportError } from '../../domain/timeclock/parse.ts';
import { clockMinutes, personKey, siteMatcher } from '../../domain/timeclock/hours.ts';
import { useClock, useSession } from '../../app/store/stores.ts';
import { allSites, generation, isAdmin } from '../../app/runtime/people.ts';
import { scrollToFlash } from '../../app/runtime/feedback.ts';
import { SETUP_MESSAGE, loadClockImports } from './clock-data.ts';
import type { ClockImport, ClockShift } from '../../types/audit.ts';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const setMessage = (ok: boolean, text: string) => {
  useClock.setState({ message: { ok, text } });
  scrollToFlash('.ClockFlash', 'nearest');
};

export function buildRows(parsed: ReturnType<typeof parseReport>): ClockShift[] {
  return parsed.shifts.map((s) => ({
    employee_name: s.employeeName,
    employee_key: personKey(s.employeeName).slice(0, 200),
    site_name: s.site,
    work_date: s.date,
    clock_in: s.clockIn,
    clock_out: s.clockOut,
    minutes: clockMinutes(s.clockIn, s.clockOut),
  }));
}

export async function submitSchedule(file: File) {
  if (!isAdmin()) return;
  const st = useClock.getState();
  if (st.busy) return;
  const gen = generation();
  const stale = () => gen !== generation() || !useSession.getState().profile;
  useClock.setState({ busy: true, message: null });
  try {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new ReportError('Choose a PDF file. Export the “Employee Worked By Site” report as a PDF.');
    if (file.size > MAX_FILE_BYTES) throw new ReportError('This file is larger than 15 MB. Export a shorter date range and try again.');
    const bytes = await file.arrayBuffer();
    const [hash, pages] = await Promise.all([sha256(bytes), import('./pdf-text.ts').then((m) => m.readPdfText(bytes))]);
    if (stale()) return;
    const parsed = parseReport(pages);
    const rows = buildRows(parsed);
    const days = Math.round((Date.parse(parsed.rangeEnd) - Date.parse(parsed.rangeStart)) / 86400000);
    if (days > 62) throw new ReportError('This file covers more than 9 weeks. Export one pay period at a time.');
    const imports = await loadClockImports(true);
    if (stale()) return;
    if (imports === null && useClock.getState().importsError === 'missing-table') throw new ReportError(SETUP_MESSAGE);
    const duplicate = (imports || []).find((i) => i.file_hash === hash);
    if (duplicate) {
      await showAlert(`${duplicate.uploader_name || 'An admin'} already submitted this exact file on ${when(duplicate.uploaded_at)}. Nothing needs to change.`, { title: 'This schedule is already uploaded', tone: 'info' });
      return;
    }
    const homeFor = siteMatcher(allSites());
    const unknownSites = parsed.sites.filter((s) => !homeFor(s));
    const firstPeriod = payPeriodAt(payPeriodIndexFor(parsed.rangeStart));
    const lastPeriod = payPeriodAt(payPeriodIndexFor(parsed.rangeEnd));
    const periodText = firstPeriod.index === lastPeriod.index ? `pay period #${firstPeriod.number}` : `pay periods #${firstPeriod.number}–#${lastPeriod.number}`;
    const summary = [
      `${plural(rows.length, 'clock-in')} for ${plural(parsed.employees.length, 'employee')} from ${fmtRange(parsed.rangeStart, parsed.rangeEnd)} (${periodText}).`,
      unknownSites.length ? `Not matched to a site: ${unknownSites.join(', ')}. Hours there still count.` : '',
      parsed.skipped.length ? `${plural(parsed.skipped.length, 'line')} couldn’t be read and will be left out.` : '',
      'Everyone will see these hours.',
    ].filter(Boolean).join('\n\n');
    if (!(await askConfirm(summary, { title: `Submit ${file.name}?`, confirmLabel: 'Submit schedule' }))) return;
    if (stale()) return;
    const overlapping = (imports || []).filter((i) => i.range_start <= parsed.rangeEnd && i.range_end >= parsed.rangeStart);
    let overwrite = false;
    if (overlapping.length) {
      overwrite = await confirmOverwrite(overlapping, parsed.rangeStart, parsed.rangeEnd);
      if (!overwrite || stale()) return;
    }
    const upload = (replace: boolean) => api.importClockShifts({ rangeStart: parsed.rangeStart, rangeEnd: parsed.rangeEnd, fileName: file.name.slice(0, 200), fileHash: hash, rows, overwrite: replace });
    try {
      await upload(overwrite);
    } catch (err) {
      if (!(err instanceof ApiError) || err.hint !== 'clock_data_exists' || overwrite) throw err;
      const latest = await loadClockImports(true);
      if (stale()) return;
      const now = (latest || []).filter((i) => i.range_start <= parsed.rangeEnd && i.range_end >= parsed.rangeStart);
      if (!(await confirmOverwrite(now, parsed.rangeStart, parsed.rangeEnd)) || stale()) return;
      await upload(true);
    }
    if (stale()) return;
    useClock.setState({ shifts: new Map(), people: new Map(), period: firstPeriod.index });
    await loadClockImports(true);
    if (stale()) return;
    setMessage(true, `Schedule submitted: ${plural(rows.length, 'clock-in')} for ${plural(parsed.employees.length, 'employee')} (${fmtRange(parsed.rangeStart, parsed.rangeEnd)}).`);
  } catch (err) {
    if (stale()) return;
    if (err instanceof ApiError && err.hint === 'duplicate_file') {
      await loadClockImports(true);
      setMessage(false, 'This exact file has already been submitted.');
    } else if (err instanceof ApiError && err.hint === 'missing_table') setMessage(false, SETUP_MESSAGE);
    else setMessage(false, err instanceof ReportError ? err.message : `The schedule couldn’t be submitted: ${(err as Error).message}`);
  } finally {
    if (!stale()) useClock.setState({ busy: false });
  }
}

function confirmOverwrite(existing: ClockImport[], start: string, end: string) {
  const lines = existing.map((i) => `• ${fmtRange(i.range_start, i.range_end)} — ${plural(i.shift_count, 'clock-in')}, uploaded by ${i.uploader_name || 'an admin'} on ${when(i.uploaded_at)}`);
  return askConfirm(
    `Clock-in data already exists for ${fmtRange(start, end)}:\n\n${lines.join('\n')}\n\nEvery clock-in from ${fmtRange(start, end)} will be replaced with this file. Clock-ins on other dates stay. This can’t be undone.`,
    { title: 'Overwrite clock-in data?', confirmLabel: 'Overwrite clock-ins', danger: true },
  );
}

export async function removeImport(id: string) {
  if (!isAdmin()) return;
  const item = (useClock.getState().imports || []).find((i) => i.id === id);
  if (!item) return;
  if (!(await askConfirm(`Every clock-in from this upload (${plural(item.shift_count, 'clock-in')}, ${fmtRange(item.range_start, item.range_end)}) will be removed for everyone.`, { title: `Remove ${item.file_name || 'this upload'}?`, confirmLabel: 'Remove upload', danger: true }))) return;
  const gen = generation();
  useClock.setState({ busy: true, message: null });
  try {
    await api.deleteClockImport(id);
    if (gen !== generation()) return;
    useClock.setState({ shifts: new Map(), people: new Map() });
    await loadClockImports(true);
    setMessage(true, `${item.file_name || 'The upload'} was removed.`);
  } catch (err) {
    if (gen === generation()) setMessage(false, `Couldn’t remove the upload: ${(err as Error).message}`);
  } finally {
    if (gen === generation()) useClock.setState({ busy: false });
  }
}
