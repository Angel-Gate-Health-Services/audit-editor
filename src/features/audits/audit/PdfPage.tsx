import { useEffect, useRef, useState } from 'react';
import { entryComplete, sortNames } from '../../../domain/audits/model.ts';
import { buildPdf, pdfFileName } from '../../../domain/audits/pdf.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { useTitle } from '../../../components/ui/basics.tsx';
import { useSession, useUi } from '../../../app/store/stores.ts';
import { action } from '../../../app/runtime/actions.ts';
import { href } from '../../../app/navigation/route.ts';
import { downloadPdf, openPdf, printPdf } from '../audit-actions.ts';
import { useAuditContext } from './context.tsx';

const open = action('openPdf', openPdf);
const print = action('printPdf', printPdf);
const save = action('downloadPdf', downloadPdf);

export function PdfPage() {
  const { audit } = useAuditContext();
  useTitle(`${audit.site.name} · PDF`);
  const pdfUrl = useUi((s) => s.pdfUrl);
  const generation = useSession((s) => s.generation);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const latest = useRef(audit);
  useEffect(() => {
    latest.current = audit;
  });
  useEffect(() => {
    let cancelled = false;
    buildPdf(latest.current).then((doc) => {
      if (cancelled || generation !== useSession.getState().generation) return;
      const previous = useUi.getState().pdfUrl;
      if (previous) URL.revokeObjectURL(previous);
      useUi.setState({ pdfUrl: URL.createObjectURL(doc.output('blob')) });
      setError('');
      setReady(true);
    }).catch((err: Error) => {
      if (cancelled || generation !== useSession.getState().generation) return;
      console.error(err);
      setError(err.message);
    });
    return () => { cancelled = true; };
  }, [audit.id, audit.updatedAt, generation]);
  const warnings: [string, string][] = [];
  if (!audit.auditor.trim()) warnings.push(['Add your name so the header reads “Audit By …”.', href('a', audit.id, 'setup')]);
  for (const name of sortNames(audit.site.residents)) {
    const entries = (Object.hasOwn(audit.individuals, name) ? audit.individuals[name].entries : null) || [];
    if (!entries.length) warnings.push([`${name} has no documentation reviewed.`, href('a', audit.id, 'i', name)]);
    else if (entries.some((e) => !entryComplete(e))) warnings.push([`${name} has an unfinished shift.`, href('a', audit.id, 'i', name)]);
  }
  return (
    <>
      {warnings.length ? <div className="flash flash-warn"><Icon name="alert" /><ul>{warnings.map(([t, l]) => <li key={t}><a href={l}>{t}</a></li>)}</ul></div> : null}
      <div className="Box">
        <div className="Box-header">
          <h2 className="Box-title"><Icon name="file" /> {pdfFileName(audit)}</h2>
          <div className="Box-headerActions">
            <button className="btn btn-sm" onClick={() => open()}><Icon name="link-external" />Open</button>
            <button className="btn btn-sm" onClick={() => print()}>Print</button>
            <button className="btn btn-sm btn-primary" onClick={() => save()}><Icon name="download" />Download</button>
          </div>
        </div>
        <div className="PdfFrame" id="pdf-frame">
          {error ? <div className="flash flash-error m-3"><Icon name="alert" /><span>The PDF couldn’t be built: {error}</span></div>
            : ready && pdfUrl ? <iframe src={`${pdfUrl}#view=FitH`} title="Audit PDF preview" />
              : <div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Building your PDF…</p></div>}
        </div>
      </div>
    </>
  );
}
