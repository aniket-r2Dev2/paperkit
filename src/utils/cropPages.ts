import type { PDFDocument } from 'pdf-lib';
import { parsePageRange } from './pageRange';
import { validatePageCount } from './resourceLimits';

export const edges = ['top', 'right', 'bottom', 'left'] as const;
export type Margins = Record<typeof edges[number], number>;
export const initialMargins: Margins = { top: 5, right: 5, bottom: 5, left: 5 };

export function cropPages(pdf: PDFDocument, margins: Margins, range: string, checkActive: () => void) {
  const count = pdf.getPageCount();
  const error = validatePageCount(count);
  if (error) throw new Error(error);
  if (edges.some(edge => !Number.isFinite(margins[edge]) || margins[edge] < 0) ||
      margins.top + margins.bottom >= 100 || margins.left + margins.right >= 100) {
    throw new Error('Margins must leave some of the page visible.');
  }
  const indices = range.trim() ? parsePageRange(range, count) : Array.from({length: count}, (_, i) => i);
  for (const index of indices) {
    checkActive();
    const page = pdf.getPage(index);
    const turn = ((page.getRotation().angle % 360) + 360) % 360 / 90;
    if (!Number.isInteger(turn)) throw new Error('Unsupported page rotation.');
    // An upright page edge moves clockwise in the viewer under PDF rotation.
    const [top, right, bottom, left] = edges.map((_, i) => margins[edges[(i + turn) % 4]] / 100);
    const crop = page.getCropBox();
    const media = page.getMediaBox();
    const x = Math.max(crop.x, media.x), y = Math.max(crop.y, media.y);
    const w = Math.min(crop.x + crop.width, media.x + media.width) - x;
    const h = Math.min(crop.y + crop.height, media.y + media.height) - y;
    if (!(w > 0 && h > 0)) throw new Error('This page has invalid visible bounds.');
    page.setCropBox(x + w * left, y + h * bottom, w * (1 - left - right), h * (1 - top - bottom));
  }
}
