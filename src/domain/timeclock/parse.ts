export interface TextPiece {
  str: string;
  x: number;
  y: number;
}

export interface ParsedShift {
  employeeName: string;
  date: string;
  clockIn: string;
  clockOut: string;
  site: string;
}

export interface ParsedReport {
  shifts: ParsedShift[];
  employees: string[];
  sites: string[];
  rangeStart: string;
  rangeEnd: string;
  skipped: string[];
}

export class ReportError extends Error {}

const DATE_ROW = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b\s*(.*)$/;
const TIMES = /^(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)\s+(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)\s*(.*)$/i;
const NAME_ROW = /^[A-Za-z][A-Za-z.'’\- ]*[A-Za-z.]$/;
const NOISE = [/^Employee Worked By Site\b/i, /^Angel Gate Health Services/i, /^Date\s+In Time\s+Out Time\s+Site$/i, /^https?:\/\//i, /^\d+\s+of\s+\d+$/];
const TITLE = /Employee Worked By Site/i;
const HEADER = /^Date\s+In Time\s+Out Time\s+Site$/i;

const pad = (n: number) => String(n).padStart(2, '0');

export function to24h(hour: string, minute: string, meridiem: string) {
  const h = Number(hour);
  const m = Number(minute);
  if (!(h >= 1 && h <= 12) || !(m >= 0 && m <= 59)) return null;
  const pm = meridiem.toUpperCase() === 'PM';
  return `${pad((h % 12) + (pm ? 12 : 0))}:${pad(m)}`;
}

const validDate = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim();

export function groupRows(pieces: TextPiece[], tolerance = 2.5) {
  const rows: { y: number; items: TextPiece[] }[] = [];
  for (const piece of pieces) {
    if (!piece.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - piece.y) <= tolerance);
    if (row) row.items.push(piece);
    else rows.push({ y: piece.y, items: [piece] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim());
}

export function parseReportLines(pages: string[][]): ParsedReport {
  const lines = pages.flat();
  if (!lines.some((l) => TITLE.test(l)) && !lines.some((l) => HEADER.test(l))) {
    throw new ReportError('This doesn’t look like an “Employee Worked By Site” report. Export that report and try again.');
  }
  const shifts: ParsedShift[] = [];
  const skipped: string[] = [];
  let employee = '';
  for (const line of lines) {
    if (NOISE.some((re) => re.test(line))) continue;
    const dateRow = DATE_ROW.exec(line);
    if (dateRow) {
      const [, mo, da, yr, rest] = dateRow;
      const times = TIMES.exec(rest);
      const y = Number(yr);
      const m = Number(mo);
      const d = Number(da);
      if (!employee || !times || !validDate(y, m, d)) {
        skipped.push(line);
        continue;
      }
      const clockIn = to24h(times[1], times[2], times[3]);
      const clockOut = to24h(times[4], times[5], times[6]);
      if (!clockIn || !clockOut) {
        skipped.push(line);
        continue;
      }
      shifts.push({ employeeName: employee, date: `${y}-${pad(m)}-${pad(d)}`, clockIn, clockOut, site: cleanName(times[7]) });
      continue;
    }
    if (NAME_ROW.test(line) && line.length <= 120) {
      employee = cleanName(line);
      continue;
    }
    skipped.push(line);
  }
  if (!shifts.length) throw new ReportError('No clock-in rows were found in this file.');
  const dates = shifts.map((s) => s.date).sort();
  return {
    shifts,
    employees: [...new Set(shifts.map((s) => s.employeeName))],
    sites: [...new Set(shifts.map((s) => s.site).filter(Boolean))].sort(),
    rangeStart: dates[0],
    rangeEnd: dates[dates.length - 1],
    skipped,
  };
}

export const parseReport = (pages: TextPiece[][]) => parseReportLines(pages.map((p) => groupRows(p)));
