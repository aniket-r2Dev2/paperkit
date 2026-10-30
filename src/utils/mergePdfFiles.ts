import type { PDFDocument } from 'pdf-lib';
import { RESOURCE_LIMITS, validatePageCount } from './resourceLimits';

type PdfDocumentFactory = typeof PDFDocument;
type SupportedInput = Pick<File, 'name' | 'type'>;

/** Classify by extension; MIME is a fallback for files without a recognized extension.
 * Upload and file-signature validation must run before this function is called. */
export function getMergeInputKind(file: SupportedInput): 'pdf' | 'png' | 'jpeg' | null {
  if (/\.pdf$/i.test(file.name)) return 'pdf';
  if (/\.png$/i.test(file.name)) return 'png';
  if (/\.jpe?g$/i.test(file.name)) return 'jpeg';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpeg';
  return null;
}

/** Append PDFs and images in the exact order supplied by the workspace.
 * Every PDF contributes all its pages; each PNG/JPEG contributes one page at its
 * original pixel dimensions, interpreted as PDF points (the existing images-to-PDF policy).
 * The caller owns signature validation, output size checks, and URL lifecycle. */
export async function mergeFilesInOrder(
  files: File[],
  PDFDocument: PdfDocumentFactory,
  checkActive: () => void,
): Promise<Uint8Array> {
  if (!files.length) throw new Error('Add at least one PDF or image to merge.');

  const merged = await PDFDocument.create();
  let totalPages = 0;

  for (const [index, file] of files.entries()) {
    checkActive();
    const kind = getMergeInputKind(file);
    if (!kind) {
      throw new Error('File ' + (index + 1) + ' must be a PDF, PNG, or JPG/JPEG image.');
    }

    const bytes = await file.arrayBuffer();
    checkActive();

    if (kind === 'pdf') {
      let source: PDFDocument;
      try {
        source = await PDFDocument.load(bytes);
      } catch {
        throw new Error('PDF at position ' + (index + 1) + ' could not be read. Try another PDF.');
      }
      checkActive();
      const count = source.getPageCount();
      const pageError = validatePageCount(count);
      if (pageError) throw new Error('PDF at position ' + (index + 1) + ': ' + pageError);
      if (totalPages + count > RESOURCE_LIMITS.maxPages) {
        throw new Error('The combined PDF supports up to ' + RESOURCE_LIMITS.maxPages + ' pages in total.');
      }
      const pages = await merged.copyPages(source, source.getPageIndices());
      checkActive();
      pages.forEach((page) => merged.addPage(page));
      totalPages += count;
    } else {
      if (totalPages >= RESOURCE_LIMITS.maxPages) {
        throw new Error('The combined PDF supports up to ' + RESOURCE_LIMITS.maxPages + ' pages in total.');
      }

      let image: Awaited<ReturnType<typeof merged.embedPng>>;
      try {
        image = kind === 'png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
      } catch {
        throw new Error('Image at position ' + (index + 1) + ' could not be read. Use a valid PNG or JPEG.');
      }
      checkActive();
      if (!Number.isFinite(image.width) || !Number.isFinite(image.height) ||
          image.width < 1 || image.height < 1 ||
          image.width > 14400 || image.height > 14400 ||
          image.width * image.height > 40_000_000) {
        throw new Error('Image at position ' + (index + 1) + ' has unsupported dimensions (maximum 40 megapixels and 14,400 pixels per side).');
      }
      const page = merged.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      totalPages += 1;
    }
  }

  checkActive();
  const bytes = await merged.save();
  checkActive();
  return bytes;
}
