import { useEffect, useRef, useState } from 'react';
import { PDFDocument, PDFName } from 'pdf-lib';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from '../utils/resourceLimits';
import { type Bookmark, MAX_BOOKMARKS, validateBookmarks, writeBookmarks } from '../utils/pdfBookmarks';

export default function PdfBookmarks({ file }: { file: File }) {
  const [rows, setRows] = useState<Bookmark[]>([{ title: '', page: 1 }]);
  const [pages, setPages] = useState(0);
  const [existing, setExisting] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Reading PDF…');
  const [output, setOutput] = useState('');
  const [saved, setSaved] = useState<Bookmark[]>([]);
  const job = useRef(0);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output); }, [output]);
  useEffect(() => {
    const id = ++job.current;
    async function load() {
      try {
        if (file.size > RESOURCE_LIMITS.maxFileBytes || await validateFileSignatures([file])) throw new Error('Choose a PDF no larger than 50 MB.');
        const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
        const error = validatePageCount(pdf.getPageCount());
        if (error) throw new Error(error);
        if (id !== job.current) return;
        setPages(pdf.getPageCount());
        setExisting(pdf.catalog.has(PDFName.of('Outlines')));
        setMessage('Add titles and destination pages, then arrange the reading order.');
      } catch {
        if (id === job.current) setMessage('Cannot read this PDF. Choose an unencrypted PDF with 1–500 pages, no larger than 50 MB.');
      } finally { if (id === job.current) setBusy(false); }
    }
    void load();
    return () => { job.current++; };
  }, [file]);
  function invalidate() { setOutput(''); setSaved([]); }
  function change(next: Bookmark[]) { invalidate(); setRows(next); }
  function move(index: number, direction: number) {
    const next = [...rows];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    change(next);
  }
  async function save() {
    const error = validateBookmarks(rows, pages);
    if (error) { setMessage(error); return; }
    if (existing && !replace) { setMessage('Confirm replacement of existing bookmarks.'); return; }
    const id = ++job.current;
    const deadline = Date.now() + RESOURCE_LIMITS.processingTimeoutMs;
    const active = () => { if (id !== job.current || Date.now() > deadline) throw new Error('Processing stopped. Try a smaller PDF.'); };
    setBusy(true); invalidate();
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      active();
      writeBookmarks(pdf, rows, replace);
      const bytes = await pdf.save();
      active();
      const error = validateOutputSize(bytes.byteLength);
      if (error) throw new Error(error);
      // Read the output using the viewer engine independently of the writer.
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
      try {
        const document = await task.promise;
        const outline = await document.getOutline();
        if (!outline || outline.length !== rows.length) throw new Error('Could not verify bookmarks.');
        for (let index = 0; index < rows.length; index++) {
          active();
          const destination = outline[index].dest;
          if (!Array.isArray(destination) || outline[index].title !== rows[index].title || await document.getPageIndex(destination[0]) !== rows[index].page - 1) throw new Error('Could not verify bookmark destinations.');
        }
      } finally { await task.destroy(); }
      active();
      setSaved(rows.map(row => ({ ...row })));
      setOutput(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
      setMessage('Bookmarks and destination pages verified in the completed PDF.');
    } catch (error) {
      if (id === job.current) setMessage(error instanceof Error ? error.message : 'Could not save bookmarks.');
    } finally { if (id === job.current) setBusy(false); }
  }
  return <section aria-label="PDF bookmarks">
    <p role="status">{message}</p>
    {pages > 0 && <>
      <p>{pages} pages · Up to 500 bookmarks · Titles up to 200 characters</p>
      {existing && <label><input type="checkbox" checked={replace} disabled={busy} onChange={event => { invalidate(); setReplace(event.target.checked); }}/> Replace all existing bookmarks, including nested bookmarks</label>}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {rows.map((row, index) => <div className="option-row bookmark-row" key={index}>
          <label>Bookmark {index + 1} title<input maxLength={200} value={row.title} onChange={event => change(rows.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}/></label>
          <label>Bookmark {index + 1} page<input type="number" min={1} max={pages} step={1} value={Number.isNaN(row.page) ? '' : row.page} onChange={event => change(rows.map((item, i) => i === index ? { ...item, page: event.target.valueAsNumber } : item))}/></label>
          <button className="text-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move bookmark ${index + 1} up`}>Up</button>
          <button className="text-button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`Move bookmark ${index + 1} down`}>Down</button>
          <button className="text-button" onClick={() => change(rows.filter((_, i) => i !== index))} aria-label={`Remove bookmark ${index + 1}`}>Remove</button>
        </div>)}
        <button className="text-button" style={{ margin: '16px 0' }} disabled={rows.length >= MAX_BOOKMARKS} onClick={() => change([...rows, { title: '', page: 1 }])}>Add bookmark</button>
      </fieldset>
      <button className="primary-button" disabled={busy || (existing && !replace)} onClick={save}>{busy ? 'Working…' : 'Save bookmarks'}</button>
    </>}
    <p className="inline-help">Creates a flat bookmark list. Processing stays on this device. Clear all or switch tools to discard your changes.</p>
    {saved.length > 0 && <ol aria-label="Saved bookmarks">{saved.map((row, index) => <li key={index}>{row.title} — Page {row.page}</li>)}</ol>}
    {output && <a className="primary-button" href={output} download="paperkit-bookmarks.pdf">Download bookmarked PDF</a>}
  </section>;
}
