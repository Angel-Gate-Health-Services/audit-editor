import type { TextPiece } from '../../domain/timeclock/parse.ts';

const MAX_PAGES = 300;

export async function readPdfText(bytes: ArrayBuffer): Promise<TextPiece[][]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, enableXfa: false, useWorkerFetch: false });
  const doc = await task.promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This file has ${doc.numPages} pages. Split it into files of ${MAX_PAGES} pages or fewer.`);
    const pages: TextPiece[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => ('str' in item ? [{ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number }] : [])));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
