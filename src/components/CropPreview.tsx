import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parsePageRange } from '../utils/pageRange';
import type { Margins } from '../utils/cropPages';
import { validatePageCount } from '../utils/resourceLimits';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function CropPreview({ file, range, margins }: { file: File; range: string; margins: Margins }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState('');
  const [pageNumber, setPageNumber] = useState(0);
  useEffect(() => {
    let stopped = false;
    let task: ReturnType<typeof getDocument> | undefined;
    setPageNumber(0);
    setMessage('Preparing preview…');
    async function render() {
      try {
        const data = await file.arrayBuffer();
        if (stopped) return;
        task = getDocument({data});
        const doc = await task.promise;
        if (stopped) return;
        const limit = validatePageCount(doc.numPages);
        if (limit) throw new Error(limit);
        const number = range.trim() ? parsePageRange(range, doc.numPages)[0] + 1 : 1;
        const page = await doc.getPage(number);
        if (stopped || !canvas.current) return;
        const natural = page.getViewport({scale: 1});
        const viewport = page.getViewport({scale: 600 / Math.max(natural.width, natural.height)});
        // Each render owns its canvas so an interrupted render cannot overwrite its successor.
        const buffer = document.createElement('canvas');
        buffer.width = Math.ceil(viewport.width);
        buffer.height = Math.ceil(viewport.height);
        await page.render({canvasContext: buffer.getContext('2d')!, viewport}).promise;
        if (stopped || !canvas.current) return;
        canvas.current.width = buffer.width;
        canvas.current.height = buffer.height;
        canvas.current.getContext('2d')!.drawImage(buffer, 0, 0);
        setPageNumber(number);
      } catch {
        if (!stopped) setMessage('Preview unavailable. Check the PDF and page range.');
      } finally {
        await task?.destroy();
      }
    }
    void render();
    return () => { stopped = true; void task?.destroy(); };
  }, [file, range]);
  const valid = Object.values(margins).every(value => Number.isFinite(value) && value >= 0) &&
    margins.left + margins.right < 100 && margins.top + margins.bottom < 100;
  return <section aria-label="Crop preview" className="pdf-preview">
    <p>{!valid ? 'Margins must leave some of the page visible.' : pageNumber ? 'Crop preview · page ' + pageNumber + ' · outlined area will remain visible' : message}</p>
    <div className="crop-sheet" hidden={!pageNumber || !valid}>
      <canvas ref={canvas}/>
      <div className="crop-outline" style={{inset: [margins.top,margins.right,margins.bottom,margins.left].map(v=>v+'%').join(' ')}}/>
    </div>
  </section>;
}
