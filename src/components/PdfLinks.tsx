import { useEffect, useRef, useState } from 'react';
import { readExistingLinks, updateExistingLinks, type ExistingLink, type LinkChange } from '../utils/existingPdfLinks';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS } from '../utils/resourceLimits';

export default function PdfLinks({ file }: { file: File }) {
  const [links, setLinks] = useState<ExistingLink[]>([]);
  const [changes, setChanges] = useState<Record<string, LinkChange>>({});
  const [history, setHistory] = useState<Record<string, LinkChange>[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output); }, [output]);
  useEffect(() => {
    const id = ++generation.current;
    setLinks([]); setChanges({}); setHistory([]); setOutput(''); setError(''); setBusy(true); setPageCount(0); setSkipped(0);
    const deadline = Date.now() + RESOURCE_LIMITS.processingTimeoutMs;
    const active = () => { if (id !== generation.current || Date.now() > deadline) throw new Error('Reading cancelled or timed out.'); };
    void (async () => {
      try {
        if (file.size > RESOURCE_LIMITS.maxFileBytes || !/\.pdf$/i.test(file.name) || await validateFileSignatures([file])) throw new Error('Choose a genuine PDF no larger than 50 MB.');
        const result = await readExistingLinks(new Uint8Array(await file.arrayBuffer()), active); active();
        setLinks(result.links); setPageCount(result.pageCount); setSkipped(result.skipped);
      } catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : 'Cannot read this PDF. Choose an unencrypted PDF.'); }
      finally { if (id === generation.current) setBusy(false); }
    })();
    return () => { generation.current++; };
  }, [file]);
  function invalidate() { generation.current++; setOutput(''); setError(''); setBusy(false); }
  function change(link: ExistingLink, value: LinkChange) {
    invalidate(); setHistory(old => [...old, changes].slice(-20));
    const next = { ...changes };
    if (!value.remove && (link.kind === 'web' ? value.url === link.url : value.destination === link.destination)) delete next[link.id];
    else next[link.id] = value;
    setChanges(next);
  }
  async function save() {
    invalidate(); const id = generation.current; setBusy(true);
    const deadline = Date.now() + RESOURCE_LIMITS.processingTimeoutMs;
    const active = () => { if (id !== generation.current || Date.now() > deadline) throw new Error('Processing cancelled or timed out.'); };
    try {
      const bytes = await updateExistingLinks(new Uint8Array(await file.arrayBuffer()), Object.values(changes), active); active();
      setOutput(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : 'Could not update links.'); }
    finally { if (id === generation.current) setBusy(false); }
  }
  return <section aria-label="Existing PDF links">
    <p>Edit destinations or remove existing HTTP/HTTPS and explicit internal-page links. Link positions and styling stay unchanged. Changed page destinations use fit-page view. Removing a link removes its clickable area, not text or artwork underneath. Digital signatures will be invalidated.</p>
    <p className="inline-help">Up to 200 supported links are listed in page order. Named destinations, locked links and other unsupported actions are preserved. No URL is opened or fetched. Open the downloaded PDF in a viewer to test its links. To add new links, use Add text &amp; images.</p>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Working…</p>}
    {!busy && pageCount > 0 && <p role="status">{links.length} editable links found. {skipped} unsupported or excess links preserved.</p>}
    {links.map((link, index) => <fieldset className="editor-item" key={link.id} disabled={busy}>
      <legend>Link {index + 1} — page {link.page}</legend>
      {changes[link.id]?.remove ? <p>Marked for removal</p> : link.kind === 'web' ? <label>Destination URL<input aria-label={`Link ${index + 1} URL`} type="url" maxLength={2048} value={changes[link.id]?.url ?? link.url} onChange={e => change(link, { id: link.id, url: e.target.value })}/></label> : <label>Destination page<input aria-label={`Link ${index + 1} destination`} type="number" min={1} max={pageCount} value={changes[link.id]?.destination ?? link.destination} onChange={e => change(link, { id: link.id, destination: Number(e.target.value) })}/></label>}
      <button type="button" disabled={Boolean(changes[link.id]?.remove)} onClick={() => change(link, { id: link.id, remove: true })}>Remove link {index + 1}</button>
    </fieldset>)}
    <div className="option-row"><button type="button" disabled={busy || !history.length} onClick={() => { invalidate(); setChanges(history[history.length - 1]); setHistory(history.slice(0, -1)); }}>Undo link change</button>
    <button type="button" className="primary-button" disabled={busy || !Object.keys(changes).length} onClick={save}>Save link changes</button></div>
    {busy && <button type="button" onClick={invalidate}>Cancel link processing</button>}
    {output && <><p role="status">Link changes verified. Review them in a PDF viewer.</p><a className="primary-button" href={output} download="paperkit-links.pdf">Download updated links PDF</a></>}
    <p className="inline-help">Files stay on this device. Undo keeps 20 changes. Editing revokes the previous download; Clear all or switching tools discards the session.</p>
  </section>;
}
