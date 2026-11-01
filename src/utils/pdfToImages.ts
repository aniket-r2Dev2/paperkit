import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { validateOutputSize } from './resourceLimits';
import { validateImageExportOptions, validateRenderedDimensions, imageOutputName, type ImageExportOptions, type ImageResult } from './imageExportOptions';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== type) {
        reject(new Error('This browser could not encode the requested image format.'));
      } else {
        resolve(blob);
      }
    }, type, quality);
  });
}

/**
 * Rasterize PDF pages locally with PDF.js. Each canvas is cleared after export.
 * Cancelling interrupts an active PDF.js render task, rather than waiting for every page.
 * The result's memory and object URLs are managed by the caller.
 */
export async function renderPdfAsImages(
  file: File,
  options: ImageExportOptions,
  signal: AbortSignal,
  checkActive: () => void,
): Promise<ImageResult[]> {
  checkActive();
  const data = new Uint8Array(await file.arrayBuffer());
  checkActive();
  const loadingTask = pdfjsLib.getDocument({ data });
  try {
    const document = await loadingTask.promise;
    checkActive();
    const indices = validateImageExportOptions(options, document.numPages);
    const results: ImageResult[] = [];
    let totalBytes = 0;

    for (const index of indices) {
      checkActive();
      const page = await document.getPage(index + 1);
      const viewport = page.getViewport({ scale: options.dpi / 72 });
      const { width, height } = validateRenderedDimensions(viewport.width, viewport.height);
      const canvas = window.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
        context.fillStyle = 'white';
        context.fillRect(0, 0, width, height);
        const task = page.render({ canvasContext: context, viewport });
        const cancel = () => task.cancel();
        signal.addEventListener('abort', cancel, { once: true });
        try {
          if (signal.aborted) cancel();
          await task.promise;
        } catch (error) {
          if (signal.aborted) throw new DOMException('Processing was cancelled.', 'AbortError');
          throw error;
        } finally {
          signal.removeEventListener('abort', cancel);
        }
        checkActive();
        const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
        const blob = await canvasBlob(canvas, mime, options.format === 'jpeg' ? 0.9 : undefined);
        checkActive();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        checkActive();
        totalBytes += bytes.byteLength;
        const limit = validateOutputSize(totalBytes);
        if (limit) throw new Error(limit);
        results.push({
          name: imageOutputName(file.name, index + 1, options.format),
          bytes,
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
    return results;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Processing was cancelled.', 'AbortError');
    if (error instanceof Error && (
      error.message.includes('password') ||
      error.name === 'PasswordException'
    )) {
      throw new Error('Password-protected PDFs are not supported for image export.');
    }
    throw error;
  } finally {
    await loadingTask.destroy();
  }
}
