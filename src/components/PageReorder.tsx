import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Props = { file: File; order: number[]; onOrderChange: (order: number[]) => void };

export default function PageReorder({ file, order, onOrderChange }: Props) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [pageCount, setPageCount] = useState(0);
  const [message, setMessage] = useState('Preparing page thumbnails…');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
    const render = async () => {
      setThumbnails({});
      setPageCount(0);
      setMessage('Preparing page thumbnails…');
      try {
        loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
        const pdf = await loadingTask.promise;
        if (cancelled) { await pdf.destroy(); return; }
        setPageCount(pdf.numPages);
        const images: Record<number, string> = {};
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) break;
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 0.32 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          images[number - 1] = canvas.toDataURL('image/jpeg', 0.72);
          page.cleanup();
        }
        if (!cancelled) {
          setThumbnails(images);
          onOrderChange(current => current);
          setMessage('Drag a page to a new position, or use the arrow buttons.');
        }
        await pdf.destroy();
      } catch {
        if (!cancelled) setMessage('Could not preview this PDF. Try another file.');
      }
    };
    void render();
    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [file]);

  useEffect(() => {
    if (pageCount > 0 && (order.length !== pageCount || new Set(order).size !== pageCount || order.some(index => index < 0 || index >= pageCount))) {
      onOrderChange(Array.from({ length: pageCount }, (_, index) => index));
    }
  }, [pageCount, order, onOrderChange]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onOrderChange(next);
  };

  const moveDropped = (target: number) => {
    if (dragIndex !== null && dragIndex !== target) move(dragIndex, target);
    setDragIndex(null);
    setDropIndex(null);
  };

  return <section className="page-reorder" aria-label="Reorder PDF pages">
    <div className="page-reorder-heading"><strong>Arrange pages</strong><span>{pageCount ? pageCount + ' page' + (pageCount === 1 ? '' : 's') : 'Local preview'}</span></div>
    {pageCount > 0 && <div className="page-reorder-grid">
      {order.map((originalIndex, position) => <div
        className={'page-reorder-card' + (dragIndex === position ? ' is-dragging' : '') + (dropIndex === position ? ' is-drop-target' : '')}
        key={originalIndex}
        draggable
        onDragStart={event => { setDragIndex(position); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(position)); }}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(position); }}
        onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) { setDragIndex(from); move(from, position); } setDragIndex(null); setDropIndex(null); }}
        onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
        aria-label={'Page ' + (originalIndex + 1) + ', position ' + (position + 1)}
      >
        {thumbnails[originalIndex] ? <img src={thumbnails[originalIndex]} alt={'Preview of original page ' + (originalIndex + 1)} /> : <div className="pdf-preview-message">Loading page {originalIndex + 1}…</div>}
        <span>Position {position + 1} · Page {originalIndex + 1}</span>
        <div className="page-reorder-controls">
          <button type="button" aria-label={'Move page ' + (originalIndex + 1) + ' earlier'} title="Move earlier" disabled={position === 0} onClick={() => move(position, position - 1)}><ArrowUp size={14}/></button>
          <button type="button" aria-label={'Move page ' + (originalIndex + 1) + ' later'} title="Move later" disabled={position === order.length - 1} onClick={() => move(position, position + 1)}><ArrowDown size={14}/></button>
        </div>
      </div>)}
    </div>}
    <p className="page-reorder-help">{message} The exported PDF follows the displayed order.</p>
  </section>;
}
