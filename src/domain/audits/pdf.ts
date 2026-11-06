import type { jsPDF as JsPdf } from 'jspdf';
import type { UserOptions, CellHookData } from 'jspdf-autotable';
import logoUrl from '../../../assets/logo.png?url';
import { ORG, OVERVIEW } from './config.ts';
import {
  fmtDate, fmtLong, payPeriod, shiftLabel, entryFlagged, entryReason,
  sortedEntries, individualNotes, sortNames, repeatStaff, splitLines, dayIssueLines,
} from './model.ts';
import type { Audit, Entry } from '../../types/audit.ts';

type Rgb = [number, number, number];
type Doc = JsPdf & { autoTable: (options: UserOptions) => void };
type FontFn = (style?: string, size?: number, color?: Rgb) => void;

const PAGE_W = 612;
const PAGE_H = 792;
const M = 72;
const R = PAGE_W - M;
const CONTENT_W = R - M;
const TOP = 118;
const BOTTOM = 700;
const INK: Rgb = [17, 17, 17];
const SOFT: Rgb = [55, 55, 55];
const MUTED: Rgb = [95, 95, 95];
const RULE: Rgb = [150, 150, 150];

let logoCache: { data: string; ratio: number } | undefined;
let engine: Promise<typeof JsPdf> | undefined;

export function loadPdfEngine() {
  engine ||= Promise.all([import('jspdf'), import('jspdf-autotable')]).then(([pdf, table]) => {
    table.applyPlugin(pdf.jsPDF);
    return pdf.jsPDF;
  });
  return engine;
}

async function loadLogo() {
  if (logoCache) return logoCache;
  const blob = await fetch(logoUrl).then((r) => r.blob());
  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('The logo could not be read.'));
    fr.readAsDataURL(blob);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('The logo could not be loaded.'));
    i.src = data;
  });
  logoCache = { data, ratio: img.naturalHeight / img.naturalWidth };
  return logoCache;
}

export function pdfFileName(audit: Audit) {
  const period = payPeriod(audit).replace(/\//g, '.').replace(/\s/g, '');
  return `${audit.site.name} Audit ${period}`.trim().replace(/[^\w.\- ]+/g, '') + '.pdf';
}

export async function buildPdf(audit: Audit, { autoPrint = false } = {}) {
  const jsPDF = await loadPdfEngine();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }) as Doc;
  const logo = await loadLogo().catch(() => null);

  const font: FontFn = (style = 'normal', size = 10.5, color = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const rule = (y: number, w = 1) => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(w);
    doc.line(M, y, R, y);
  };
  const ensure = (y: number, need = 0) => {
    if (y + need <= BOTTOM) return y;
    doc.addPage();
    return TOP + 20;
  };

  type Word = { w: string; bold: boolean; width?: number };
  const rich = (segments: { text: string; bold?: boolean }[], y: number, { size = 10.5, lh = 18, color = INK }: { size?: number; lh?: number; color?: Rgb } = {}) => {
    const words: Word[] = [];
    for (const s of segments) for (const w of s.text.split(/(\s+)/)) if (w) words.push({ w, bold: !!s.bold });
    let line: Word[] = [];
    let lineW = 0;
    const flush = () => {
      while (line.length && !line[line.length - 1].w.trim()) line.pop();
      y = ensure(y);
      let x = M;
      for (const t of line) {
        font(t.bold ? 'bold' : 'normal', size, color);
        doc.text(t.w, x, y);
        x += t.width!;
      }
      y += lh;
      line = [];
      lineW = 0;
    };
    for (const t of words) {
      const space = !t.w.trim();
      if (space && !line.length) continue;
      if (space) t.w = ' ';
      font(t.bold ? 'bold' : 'normal', size);
      t.width = doc.getTextWidth(t.w);
      if (!space && line.length && lineW + t.width > CONTENT_W) flush();
      line.push(t);
      lineW += t.width;
    }
    if (line.length) flush();
    return y;
  };

  const sectionHeading = (text: string, y: number) => {
    font('bold', 20);
    doc.text(text, M, y);
    rule(y + 17);
    return y + 30;
  };

  let y = TOP;
  font('bold', 20);
  doc.text(ORG.reportTitle, M, y);
  doc.text(audit.site.name || '', R, y, { align: 'right' });
  rule(y + 12);

  y += 46;
  font('bold', 17);
  doc.text('Audit Information', M + 2, y);

  const info: [string, string[]][] = [
    ['Pay period of', [payPeriod(audit)]],
    ['Location', doc.splitTextToSize(audit.site.address || '', 280) as string[]],
    ['Lead/Manager', [audit.site.manager || '']],
    ['Residents', sortNames(audit.site.residents)],
  ];
  y += 34;
  for (const [label, lines] of info) {
    const h = Math.max(1, lines.length) * 14;
    font('normal', 10.5, SOFT);
    doc.text(label, M + 4, y + h / 2 + 3);
    font('normal', 10.5, INK);
    lines.forEach((l, i) => doc.text(l, R - 4, y + 10 + i * 14, { align: 'right' }));
    y += h + 30;
  }

  y += 6;
  font('bold', 19);
  doc.text('Overview', M, y);
  y += 24;
  for (const p of OVERVIEW) y = rich([{ text: p }], y) + 14;

  doc.addPage();
  y = sectionHeading('General Notes', TOP + 10);

  const staff = repeatStaff(audit);
  if (staff.length) {
    font('bold', 10.5);
    doc.text('Staff with repetitive infractions:', M, y);
    y += 18;
    for (const name of staff) {
      y = ensure(y);
      doc.text('-', M, y - 1);
      doc.text(name, M + 11, y);
      y += 18;
    }
    y += 12;
  }

  const notes = splitLines(audit.general.notes);
  if (notes.length) {
    for (const n of notes) {
      y = ensure(y);
      font('normal', 10.5);
      doc.text('-', M, y - 1);
      const lines = doc.splitTextToSize(n, CONTENT_W - 11) as string[];
      lines.forEach((l) => {
        y = ensure(y);
        doc.text(l, M + 11, y);
        y += 18;
      });
      y += 4;
    }
    y += 12;
  }

  for (const r of audit.general.recommendations) {
    if (!r.title.trim() && !r.text.trim()) continue;
    const segs: { text: string; bold?: boolean }[] = [];
    if (r.title.trim()) segs.push({ text: `${r.title.trim()} - `, bold: true });
    segs.push({ text: r.text.trim() });
    y = rich(segs, y) + 14;
  }

  if (audit.general.closing.trim()) rich([{ text: audit.general.closing.trim(), bold: true }], y);

  doc.addPage();
  y = sectionHeading('Audit Log', TOP + 10);
  font('normal', 10.5);
  doc.text('Sorted By individual (Alphabetical Order)', M, y + 3);
  y += 15;

  sortNames(audit.site.residents).forEach((name, i) => {
    if (i > 0) {
      doc.addPage();
      y = TOP + 10;
    }
    drawIndividual(doc, audit, name, y, font);
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    font('italic', 9, INK);
    doc.text(fmtLong(audit.auditDate), M, 44);
    if (audit.auditor.trim()) doc.text(`Audit By ${audit.auditor.trim()}`, R, 44, { align: 'right' });
    if (logo) {
      const w = 118;
      doc.addImage(logo.data, 'PNG', (PAGE_W - w) / 2, 34, w, w * logo.ratio, 'logo', 'FAST');
    }
    font('italic', 8.5, MUTED);
    doc.text(`${p} of ${total}`, M, 738);
    doc.text(ORG.name, PAGE_W / 2, 738, { align: 'center' });
    doc.text(ORG.department, R, 738, { align: 'right' });
    doc.text(ORG.version, R, 749, { align: 'right' });
  }

  if (autoPrint) doc.autoPrint();
  return doc;
}

function drawIndividual(doc: Doc, audit: Audit, name: string, startY: number, font: FontFn) {
  const notes = individualNotes(audit, name);
  const entries = sortedEntries(audit.individuals[name]?.entries || []).filter(entryFlagged);

  const bulletW = CONTENT_W - 36;
  font('normal', 10.5);
  const noteLines = (notes.length ? notes : ['No additional notes.']).map((n) => doc.splitTextToSize(n, bulletW) as string[]);
  const notesH = 46 + noteLines.reduce((h, l) => h + l.length * 14 + 9, 0);

  const allShiftsLabel = (e: Entry) =>
    'ALL SHIFTS\nDOCUMENTED' + (e.otherThanListed ? '\n(Other than listed above)' : '');

  const body: UserOptions['body'] = entries.length
    ? entries.map((e) => [
        e.allShifts ? allShiftsLabel(e) : fmtDate(e.date),
        e.author,
        e.allShifts ? 'ALL SHIFTS\nDOCUMENTED' : shiftLabel(e),
        entryReason(e),
      ])
    : [[{ content: audit.individuals[name]?.adequate ? 'Documentation was reviewed and found adequate.' : dayIssueLines(audit.individuals[name]).length ? 'See the notes above for days that aren’t adequately documented.' : 'No insufficient documentation was found for this individual.', colSpan: 4, styles: { halign: 'center', fontStyle: 'italic', textColor: MUTED } }]];

  doc.autoTable({
    startY,
    margin: { left: M, right: M, top: TOP + 10, bottom: PAGE_H - BOTTOM + 8 },
    theme: 'grid',
    showHead: 'firstPage',
    head: [
      [{ content: name, colSpan: 4, styles: { fontSize: 13, cellPadding: { top: 10, bottom: 10 } } }],
      [{ content: '', colSpan: 4, styles: { minCellHeight: notesH } }],
      ['Submission Date', 'Author', 'Shift', 'Reason'],
    ],
    body,
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: INK,
      lineColor: RULE,
      lineWidth: 0.7,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 7, bottom: 7, left: 5, right: 5 },
    },
    headStyles: { fillColor: [255, 255, 255], textColor: SOFT, fontStyle: 'bold', fontSize: 12 },
    columnStyles: { 0: { cellWidth: 86 }, 1: { cellWidth: 78 }, 2: { cellWidth: 114 }, 3: { halign: 'right' } },
    didParseCell(data: CellHookData) {
      if (data.section !== 'body' || !entries.length) return;
      const e = entries[data.row.index];
      if (e.allShifts && (data.column.index === 0 || data.column.index === 2)) data.cell.styles.fontStyle = 'bold';
    },
    didDrawCell(data: CellHookData) {
      if (data.section !== 'head' || data.row.index !== 1 || data.column.index !== 0) return;
      const { x, y } = data.cell;
      font('bold', 12.5, SOFT);
      doc.text('Notes', x + 8, y + 20);
      doc.setDrawColor(...INK);
      doc.setLineWidth(1);
      doc.line(x + 8, y + 31, x + CONTENT_W - 8, y + 31);
      let ny = y + 48;
      font('normal', 10.5, SOFT);
      for (const lines of noteLines) {
        doc.text('-', x + 9, ny - 2);
        lines.forEach((l, i) => doc.text(l, x + 24, ny + i * 14));
        ny += lines.length * 14 + 9;
      }
    },
  });
}
