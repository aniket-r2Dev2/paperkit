import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parsePageRange } from './pageRange';
import { RESOURCE_LIMITS, validateOutputSize, validatePageCount } from './resourceLimits';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type ImageFormat = 'png' | 'jpeg';
export type Resolution = 72 | 150 | 200 | 300;
export type ImageExportOptions = {
  format: ImageFormat;
  dpi: Resolution;
  pages: 'all' | 'selected';
  range: string;
};
export type ImageResult = { name: string; bytes: Uint8Array };

export const MAX_IMAGE_OUTPUTS = 100;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_SIDE = 8192;

export function validateImageExportOptions(
  options: ImageExportOptions,
  pageCount: number,
): number[] {
  const problem = validatePageCount(pageCount);
  if (problem) throw new Error(problem);
  if (options.format !== 'png' && options.format !== 'jpeg') {
    throw new Error('Choose PNG or JPEG as the output format.');
  }
  if (![72, 150, 200, 300].includes(options.dpi)) {
    throw new Error('Choose a supported resolution: 72, 150, 200, or 300 DPI.');
  }
  if (options.pages !== 'all' && options.pages !== 'selected') {
    throw new Error('Choose all pages or a selected range.');
  }
  const indices = options.pages === 'all'
    ? Array.from({ length: pageCount }, (_, index) => index)
    : parsePageRange(options.range, pageCount);
  if (indices.length > MAX_IMAGE_OUTPUTS) {
    throw new Error('Export up to ' + MAX_IMAGE_OUTPUTS + ' pages at a time. Choose a smaller page range.');
  }
  return indices;
}

export function validateRenderedDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 ||
      w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE || w * h > MAX_IMAGE_PIXELS) {
    throw new Error('Rendered page is too large. Select a lower DPI (maximum 16 megapixels and 8192 pixels per side).');
  }
  return { width: w, height: h };
}

export function imageOutputName(sourceName: string, pageNumber: number, format: ImageFormat): string {
  const safeName = sourceName.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'paperkit';
  return safeName + '-page-' + pageNumber + '.' + (format === 'jpeg' ? 'jpg' : 'png');
}

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
