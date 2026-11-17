import { useEffect, useRef, useState } from 'react';
import { PDFDocument, PDFName } from 'pdf-lib';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from '../utils/resourceLimits';
import { readBookmarkOutline } from '../utils/bookmarkOutline';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import { type Bookmark, MAX_BOOKMARKS, bookmarkDepth, subtreeEnd, moveBookmark, nestBookmark, validateBookmarks, writeBookmarks } from '../utils/pdfBookmarks';

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
  const readerTask = useRef<PDFDocumentLoadingTask | null>(null);
  async function inspect(bytes: Uint8Array, active: () => void) {
    const pdfjs = await import('pdfjs-dist');
    active();
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
    readerTask.current = task;
    try { return await readBookmarkOutline(await task.promise, active); }
    finally {
      if (readerTask.current === task) readerTask.current = null;
      await task.destroy();
    }
  }
  useEffect(() => () => { if (output) URL.revokeObjectURL(output); }, [output]);
  useEffect(() => {
    const id = ++job.current;
    const deadline = Date.now() + RESOURCE_LIMITS.processingTimeoutMs;
    const active = () => { if (id !== job.current || Date.now() > deadline) throw new Error('Processing stopped. Try a smaller PDF.'); };
    async function load() {
      try {
        if (file.size > RESOURCE_LIMITS.maxFileBytes || await validateFileSignatures([file])) throw new Error('Choose a PDF no larger than 50 MB.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
        const error = validatePageCount(pdf.getPageCount());
        if (error) throw new Error(error);
        active();
        const outline = await inspect(bytes, active);
        active();
        setRows(outline.length ? outline : [{ title: '', page: 1, depth: 0 }]);
        setPages(pdf.getPageCount());
        setExisting(pdf.catalog.has(PDFName.of('Outlines')));
        setMessage('Add titles and destination pages, then arrange the reading order.');
      } catch (error) {
        if (id === job.current) setMessage(error instanceof Error ? error.message : 'Cannot read this PDF. Choose an unencrypted PDF with 1–500 pages, no larger than 50 MB.');
      } finally { if (id === job.current) setBusy(false); }
    }
    void load();
    return () => { job.current++; void readerTask.current?.destroy().catch(() => {}); };
  }, [file]);
  function invalidate() { setOutput(''); setSaved([]); }
  function change(next: Bookmark[]) { invalidate(); setRows(next); }
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
      const verified = await inspect(bytes, active);
      active();
      if (verified.length !== rows.length || verified.some((row, index) => row.title !== rows[index].title || row.page !== rows[index].page || bookmarkDepth(row) !== bookmarkDepth(rows[index]))) throw new Error('Could not verify bookmark hierarchy and destinations.');
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
      {existing && <label><input type="checkbox" checked={replace} disabled={busy} onChange={event => { invalidate(); setReplace(event.target.checked); }}/> Save changes to existing bookmarks (fit-page destinations, expanded outline)</label>}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {rows.map((row, index) => <div className="option-row bookmark-row" key={index} style={{ borderLeft: '2px solid #dce5ef', paddingLeft: `${8 + bookmarkDepth(row) * 8}px` }}>
          <span>Level {bookmarkDepth(row) + 1}</span>
          <label>Bookmark {index + 1} title<input maxLength={200} value={row.title} onChange={event => change(rows.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}/></label>
          <label>Bookmark {index + 1} page<input type="number" min={1} max={pages} step={1} value={Number.isNaN(row.page) ? '' : row.page} onChange={event => change(rows.map((item, i) => i === index ? { ...item, page: event.target.valueAsNumber } : item))}/></label>
          <button className="text-button" disabled={moveBookmark(rows, index, -1) === rows} onClick={() => change(moveBookmark(rows, index, -1))} aria-label={`Move bookmark ${index + 1} up`}>Up</button>
          <button className="text-button" disabled={moveBookmark(rows, index, 1) === rows} onClick={() => change(moveBookmark(rows, index, 1))} aria-label={`Move bookmark ${index + 1} down`}>Down</button>
          <button className="text-button" disabled={nestBookmark(rows, index, 1) === rows} onClick={() => change(nestBookmark(rows, index, 1))} aria-label={`Indent bookmark ${index + 1}`}>Indent</button>
          <button className="text-button" disabled={nestBookmark(rows, index, -1) === rows} onClick={() => change(nestBookmark(rows, index, -1))} aria-label={`Outdent bookmark ${index + 1}`}>Outdent</button>
          <button className="text-button" onClick={() => change([...rows.slice(0, index), ...rows.slice(subtreeEnd(rows, index))])} aria-label={`Remove bookmark ${index + 1}`}>Remove branch</button>
        </div>)}
        <button className="text-button" style={{ margin: '16px 0' }} disabled={rows.length >= MAX_BOOKMARKS} onClick={() => change([...rows, { title: '', page: 1 }])}>Add bookmark</button>
      </fieldset>
      <button className="primary-button" disabled={busy || (existing && !replace)} onClick={save}>{busy ? 'Working…' : 'Save bookmarks'}</button>
    </>}
    <p className="inline-help">Loads and edits up to 10 levels. Up/Down moves a branch among siblings. Indent nests it under the previous sibling; Outdent moves it after its parent. Remove branch also removes its children. Saved outlines are expanded and destinations use fit-page view; original zoom, styling and collapsed states are not retained. Processing stays on this device. Clear all or switch tools to discard your changes.</p>
    {saved.length > 0 && <ol aria-label="Saved bookmarks">{saved.map((row, index) => <li key={index} style={{ marginLeft: `${bookmarkDepth(row) * 12}px` }}>{row.title} — Page {row.page}{bookmarkDepth(row) > 0 ? ` · Level ${bookmarkDepth(row) + 1}` : ''}</li>)}</ol>}
    {output && <a className="primary-button" href={output} download="paperkit-bookmarks.pdf">Download bookmarked PDF</a>}
  </section>;
}
