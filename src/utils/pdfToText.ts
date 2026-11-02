import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parsePageRange } from './pageRange';
import { RESOURCE_LIMITS, validatePageCount } from './resourceLimits';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file: File, range: string | null, signal: AbortSignal, checkActive: () => void) {
  const data = await file.arrayBuffer();
  checkActive();
  const task = getDocument({ data, stopAtErrors: true, isEvalSupported: false });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise.catch(error => {
      if (error?.name === 'PasswordException') throw new Error('Password-protected PDFs are not supported.');
      throw new Error('This PDF could not be opened. It may be damaged.');
    });
    checkActive();
    const limit = validatePageCount(doc.numPages);
    if (limit) throw new Error(limit);
    const indices = range === null ? Array.from({ length: doc.numPages }, (_, i) => i) : parsePageRange(range, doc.numPages);
    const chunks: Blob[] = [];
    let size = 0;
    let foundText = false;
    const append = (value: string) => {
      const chunk = new Blob([value]);
      size += chunk.size;
      if (size > RESOURCE_LIMITS.maxOutputBytes) throw new Error('Text exceeds the output limit. Select fewer pages.');
      chunks.push(chunk);
    };
    for (const index of indices) {
      checkActive();
      const page = await doc.getPage(index + 1);
      if (index !== indices[0]) append('\n\f\n');
      try {
        const reader = page.streamTextContent().getReader();
        try {
          while (true) {
            checkActive();
            const { value, done } = await reader.read();
            if (done) break;
            const parts: string[] = [];
            for (const item of value.items) {
              if (!('str' in item)) continue;
              if (item.str.trim()) foundText = true;
              parts.push(item.str);
              if (item.hasEOL) parts.push('\n');
            }
            append(parts.join(''));
          }
        } finally {
          reader.releaseLock();
        }
      } finally {
        page.cleanup();
      }
    }
    checkActive();
    if (!foundText) throw new Error('No selectable text on the chosen pages. Blank pages or image-only scans have no text layer. Scans need OCR.');
    return new Blob(chunks, { type: 'text/plain;charset=utf-8' });
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
    checkActive();
  }
}
