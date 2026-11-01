import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { validateOutputSize } from './resourceLimits';
import {
  COMPRESSION_PRESETS,
  chooseSmallerPdf,
  compressionCanvasSize,
  validateCompressionPageCount,
  validateCompressionPreset,
  validateCompressionPdfEnvelope,
  type CompressionOutcome,
  type CompressionPreset,
  type RasterCompressionPreset,
} from './compressionOptions';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/jpeg') {
        reject(new Error('This browser could not encode JPEG pages for compression.'));
      } else {
        resolve(blob);
      }
    }, 'image/jpeg', quality);
  });
}

function cancelled(): DOMException {
  return new DOMException('Processing was cancelled.', 'AbortError');
}

async function rewriteWithoutRasterization(
  bytes: Uint8Array,
  checkActive: () => void,
): Promise<Uint8Array> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    throw new Error('This PDF could not be read. Try an unencrypted, valid PDF.');
  }
  checkActive();
  validateCompressionPageCount(document.getPageCount(), 'lossless');
  const rewritten = await document.save({ useObjectStreams: true });
  checkActive();
  return rewritten;
}

/**
 * This mode deliberately flattens each page to a JPEG image: do not use it when
 * searchable text, forms, annotations, links, accessibility tags or signatures matter.
 * Rendered page dimensions use the PDF.js viewport to preserve visible orientation.
 */
async function flattenToJpegPdf(
  source: Uint8Array,
  preset: RasterCompressionPreset,
  signal: AbortSignal,
  checkActive: () => void,
): Promise<Uint8Array> {
  const { dpi, jpegQuality } = COMPRESSION_PRESETS[preset];
  // PDF.js may transfer/detach the supplied buffer to its worker. Keep our own
  // original bytes untouched for the no-improvement fallback.
  const loadingTask = pdfjsLib.getDocument({ data: source.slice() });
  const abortLoading = () => { void loadingTask.destroy(); };
  signal.addEventListener('abort', abortLoading, { once: true });

  try {
    const pdf = await loadingTask.promise;
    checkActive();
    validateCompressionPageCount(pdf.numPages, preset);
    const output = await PDFDocument.create();
    let encodedBytes = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      checkActive();
      const page = await pdf.getPage(pageNumber);
      checkActive();

      const naturalViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: dpi / 72 });
      const { width, height } = compressionCanvasSize(viewport.width, viewport.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
        context.fillStyle = 'white';
        context.fillRect(0, 0, width, height);
        const task = page.render({ canvasContext: context, viewport });
        const cancelRender = () => task.cancel();
        signal.addEventListener('abort', cancelRender, { once: true });
        try {
          if (signal.aborted) cancelRender();
          await task.promise;
        } catch (error) {
          if (signal.aborted) throw cancelled();
          throw error;
        } finally {
          signal.removeEventListener('abort', cancelRender);
        }

        checkActive();
        const blob = await encodeJpeg(canvas, jpegQuality);
        checkActive();
        const imageBytes = new Uint8Array(await blob.arrayBuffer());
        checkActive();
        encodedBytes += imageBytes.byteLength;
        const sizeError = validateOutputSize(encodedBytes);
        if (sizeError) throw new Error(sizeError);

        const image = await output.embedJpg(imageBytes);
        checkActive();
        const resultPage = output.addPage([naturalViewport.width, naturalViewport.height]);
        resultPage.drawImage(image, {
          x: 0,
          y: 0,
          width: naturalViewport.width,
          height: naturalViewport.height,
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }

    checkActive();
    const candidate = await output.save({ useObjectStreams: true });
    checkActive();
    return candidate;
  } catch (error) {
    if (signal.aborted) throw cancelled();
    if (error instanceof Error && (
      error.name === 'PasswordException' ||
      /password/i.test(error.message)
    )) {
      throw new Error('Password-protected PDFs are not supported for compression.');
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', abortLoading);
    await loadingTask.destroy();
  }
}

/**
 * Local-only PDF compression. Never publish a candidate larger than the original.
 * Preserve-quality mode keeps editable document objects where pdf-lib supports
 * them; raster presets explicitly exchange those objects for page-sized images.
 */
export async function compressPdf(
  file: File,
  preset: CompressionPreset,
  signal: AbortSignal,
  checkActive: () => void,
): Promise<CompressionOutcome> {
  validateCompressionPreset(preset);
  checkActive();
  const original = new Uint8Array(await file.arrayBuffer());
  checkActive();
  if (!original.byteLength) throw new Error('Choose a non-empty PDF.');
  validateCompressionPdfEnvelope(original);

  const candidate = preset === 'lossless'
    ? await rewriteWithoutRasterization(original, checkActive)
    : await flattenToJpegPdf(original, preset, signal, checkActive);
  checkActive();
  return chooseSmallerPdf(original, candidate);
}
