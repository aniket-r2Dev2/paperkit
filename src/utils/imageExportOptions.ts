import { parsePageRange } from './pageRange';
import { validatePageCount } from './resourceLimits';

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

