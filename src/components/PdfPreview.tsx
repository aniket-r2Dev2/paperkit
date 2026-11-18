import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount } from '../utils/resourceLimits';
import { parsePageRange } from '../utils/pageRange';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const BATCH = 12;

type Props = {
  file: File;
  range?: string;
  onSelectionChange?: (range: string) => void;
  order?: number[];
  onOrderChange?: (order: number[]) => void;
};

function PageCanvas({ pdf, number, large = false }: { pdf: pdfjs.PDFDocumentProxy; number: number; large?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let render: pdfjs.RenderTask | undefined;
    const target = canvas.current;
    setError(false);
    async function draw() {
      try {
        const page = await pdf.getPage(number);
        if (cancelled || !target) return;
        const original = page.getViewport({ scale: 1 });
        const edge = Math.max(original.width, original.height);
        if (!Number.isFinite(edge) || edge <= 0) throw new Error();
        const viewport = page.getViewport({ scale: (large ? 900 : 180) / edge });
        target.width = Math.max(1, Math.ceil(viewport.width));
        target.height = Math.max(1, Math.ceil(viewport.height));
        const context = target.getContext('2d');
        if (!context) throw new Error();
        render = page.render({ canvasContext: context, viewport });
        await render.promise;
        page.cleanup();
      } catch { if (!cancelled) setError(true); }
    }
    void draw();
    return () => { cancelled = true; render?.cancel(); if (target) { target.width = 0; target.height = 0; } };
  }, [pdf, number, large]);
  return error ? <span>Page {number} preview unavailable.</span> : <canvas ref={canvas} role="img" aria-label={`Preview of page ${number}`} style={{ maxWidth: '100%', height: 'auto' }}/>;
}

export default function PdfPreview({ file, range = '', onSelectionChange, order, onOrderChange }: Props) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [message, setMessage] = useState('Preparing preview…');
  const [batch, setBatch] = useState(0);
  const [current, setCurrent] = useState(1);
  const [jump, setJump] = useState('1');
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    setPdf(null); setBatch(0); setCurrent(1); setJump('1'); setExpanded(false);
    setMessage('Preparing preview…');
    async function load() {
      try {
        if (file.size > RESOURCE_LIMITS.maxFileBytes || await validateFileSignatures([file])) throw new Error();
        const data = await file.arrayBuffer();
        if (cancelled) return;
        task = pdfjs.getDocument({ data, isEvalSupported: false });
        const document = await task.promise;
        if (cancelled) return;
        const error = validatePageCount(document.numPages);
        if (error) throw new Error(error);
        setPdf(document); setMessage('');
      } catch {
        if (!cancelled) setMessage('Preview unavailable. Choose an unencrypted, valid PDF with 1–500 pages and no more than 50 MB.');
        await task?.destroy().catch(() => {});
      }
    }
    void load();
    return () => { cancelled = true; drag.current = null; void task?.destroy().catch(() => {}); };
  }, [file]);
  const count = pdf?.numPages || 0;
  const validOrder = order?.length === count && new Set(order).size === count && order.every(n => Number.isInteger(n) && n >= 0 && n < count);
  const indices = validOrder ? order! : Array.from({ length: count }, (_, i) => i);
  useEffect(() => {
    if (count && onOrderChange && !validOrder) onOrderChange(Array.from({ length: count }, (_, i) => i));
  }, [count, validOrder, onOrderChange]);
  let selected: number[] = [];
  try { if (range.trim() && count) selected = parsePageRange(range, count); } catch { /* Text field validation happens before processing. */ }
  function toggle(index: number) {
    const next = selected.includes(index) ? selected.filter(n => n !== index) : [...selected, index];
    onSelectionChange?.(next.sort((a, b) => a - b).map(n => n + 1).join(', '));
  }
  function move(from: number, to: number) {
    if (!onOrderChange || from < 0 || from >= count || to < 0 || to >= count || from === to) return;
    const next = [...indices]; const [value] = next.splice(from, 1); next.splice(to, 0, value);
    onOrderChange(next); setBatch(Math.floor(to / BATCH));
  }
  function go() {
    const number = Number(jump);
    if (!Number.isInteger(number) || number < 1 || number > count) { setMessage(`Enter a page number from 1 to ${count}.`); return; }
    setMessage(''); setCurrent(number); setBatch(Math.floor(indices.indexOf(number - 1) / BATCH));
  }
  return <section className="pdf-preview" aria-label={onOrderChange ? 'Reorder PDF pages' : 'PDF page preview'}>
    <div className="pdf-preview-heading"><strong>{onOrderChange ? 'Arrange pages' : 'Page preview'}</strong><span>{count ? `${count} pages` : 'Local preview'}</span></div>
    <p aria-live="polite">{message}</p>
    {pdf && <>
      <div className="option-row">
        <label htmlFor="preview-page">Go to page</label><input id="preview-page" type="number" min={1} max={count} value={jump} onChange={event => setJump(event.target.value)}/>
        <button type="button" onClick={go}>Go to page</button>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide large preview' : 'Show large preview'}</button>
      </div>
      <p>Current page: {current} of {count}. {onOrderChange && 'Export follows the displayed position order.'}</p>
      {expanded && <div className="organizer-large"><PageCanvas pdf={pdf} number={current} large/></div>}
      {onSelectionChange && <div className="option-row">
        <button type="button" onClick={() => onSelectionChange(`1-${count}`)}>Select all pages</button>
        <button type="button" onClick={() => onSelectionChange('')}>Clear page selection</button>
        <span aria-live="polite">{selected.length} of {count} pages selected</span>
      </div>}
      <div className="pdf-preview-grid organizer-grid">
        {indices.slice(batch * BATCH, (batch + 1) * BATCH).map((index, offset) => {
          const position = batch * BATCH + offset;
          return <div className="pdf-preview-page organizer-card" key={index} draggable={!!onOrderChange}
            onDragStart={event => { drag.current = position; event.dataTransfer.setData('text/plain', String(position)); }}
            onDragOver={event => { if (onOrderChange) event.preventDefault(); }}
            onDrop={event => { event.preventDefault(); if (drag.current !== null) move(drag.current, position); drag.current = null; }}
            onDragEnd={() => { drag.current = null; }}>
            <button type="button" className="thumbnail-button" aria-label={`View page ${index + 1}`} aria-pressed={current === index + 1} onClick={() => { setCurrent(index + 1); setJump(String(index + 1)); }}><PageCanvas pdf={pdf} number={index + 1}/></button>
            <span>{onOrderChange ? `Position ${position + 1} · Page ${index + 1}` : `Page ${index + 1}`}</span>
            {onSelectionChange && <label><input type="checkbox" checked={selected.includes(index)} onChange={() => toggle(index)}/> Select page {index + 1}</label>}
            {onOrderChange && <div className="page-reorder-controls">
              <button type="button" aria-label={`Move page ${index + 1} earlier`} disabled={position === 0} onClick={() => move(position, position - 1)}>Earlier</button>
              <button type="button" aria-label={`Move page ${index + 1} later`} disabled={position === count - 1} onClick={() => move(position, position + 1)}>Later</button>
            </div>}
          </div>;
        })}
      </div>
      <div className="option-row">
        <button type="button" disabled={batch === 0} onClick={() => setBatch(value => value - 1)}>Previous thumbnails</button>
        <span>Positions {batch * BATCH + 1}–{Math.min((batch + 1) * BATCH, count)} of {count}</span>
        <button type="button" disabled={(batch + 1) * BATCH >= count} onClick={() => setBatch(value => value + 1)}>Next thumbnails</button>
      </div>
    </>}
  </section>;
}
