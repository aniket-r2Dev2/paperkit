import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Props = { file: File };

export default function PdfPreview({ file }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [message, setMessage] = useState('Preparing preview…');

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
    const render = async () => {
      setPageCount(0);
      setMessage('Preparing preview…');
      if (containerRef.current) containerRef.current.replaceChildren();
      try {
        loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
        const pdf = await loadingTask.promise;
        if (cancelled) { await pdf.destroy(); return; }
        setPageCount(pdf.numPages);
        const total = Math.min(pdf.numPages, 6);
        for (let number = 1; number <= total; number += 1) {
          if (cancelled || !containerRef.current) break;
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 0.55 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const card = document.createElement('div');
          card.className = 'pdf-preview-page';
          card.appendChild(canvas);
          const label = document.createElement('span');
          label.textContent = 'Page ' + number;
          card.appendChild(label);
          containerRef.current.appendChild(card);
          await page.render({ canvasContext: context, viewport }).promise;
        }
        if (!cancelled) setMessage(pdf.numPages > 6 ? 'Showing the first 6 pages.' : 'Preview of your document.');
        await pdf.destroy();
      } catch {
        if (!cancelled) setMessage('Preview unavailable for this PDF. You can still try processing it.');
      }
    };
    void render();
    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [file]);

  return <section className="pdf-preview" aria-label="PDF page preview">
    <div className="pdf-preview-heading"><strong>Page preview</strong><span>{pageCount ? pageCount + ' page' + (pageCount === 1 ? '' : 's') : 'Local preview'}</span></div>
    <div className="pdf-preview-grid" ref={containerRef} />
    <p className="pdf-preview-message">{message}</p>
  </section>;
}
