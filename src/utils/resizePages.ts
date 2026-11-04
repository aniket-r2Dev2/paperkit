import { PDFArray, PDFName, pushGraphicsState, clip, concatTransformationMatrix, endPath, rectangle, type PDFDocument } from 'pdf-lib';
import { parsePageRange } from './pageRange';
import { validatePageCount } from './resourceLimits';


// Width and height refer to the sheet as displayed, including its existing rotation.
export function resizePages(pdf: PDFDocument, widthMm: number, heightMm: number, range: string, checkActive: () => void) {
  if (![widthMm, heightMm].every(value => Number.isFinite(value) && value >= 1 && value <= 5080)) {
    throw new Error('Enter a width and height between 1 and 5080 mm.');
  }
  const count = pdf.getPageCount();
  const error = validatePageCount(count);
  if (error) throw new Error(error);
  const indices = range.trim() ? parsePageRange(range, count) : Array.from({length: count}, (_, i) => i);
  for (const index of indices) {
    checkActive();
    const page = pdf.getPage(index);
    if (page.node.Annots()?.size()) throw new Error('Page ' + (index + 1) + ' contains links, annotations or form fields. Choose pages without these items to resize.');
    const rotation = page.getRotation().angle;
    if (!Number.isInteger(rotation / 90)) throw new Error('Unsupported page rotation.');
    const swapped = rotation % 180 !== 0;
    const width = (swapped ? heightMm : widthMm) * 72 / 25.4;
    const height = (swapped ? widthMm : heightMm) * 72 / 25.4;
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const x = Math.max(media.x, crop.x), y = Math.max(media.y, crop.y);
    const w = Math.min(media.x + media.width, crop.x + crop.width) - x;
    const h = Math.min(media.y + media.height, crop.y + crop.height) - y;
    if (!(w > 0 && h > 0)) throw new Error('Page ' + (index + 1) + ' has invalid visible bounds.');
    const scale = Math.min(width / w, height / h);
    const tx = (width - scale * w) / 2 - scale * x;
    const ty = (height - scale * h) / 2 - scale * y;
    const contents = page.node.Contents();
    if (contents) {
      // A PDF can share this array between pages. Wrap only the selected page.
      if (contents instanceof PDFArray) page.node.set(PDFName.Contents, contents.clone());
      page.node.normalize();
      const begin = pdf.context.contentStream([
        pushGraphicsState(),
        concatTransformationMatrix(scale, 0, 0, scale, tx, ty),
        rectangle(x, y, w, h), clip(), endPath(),
      ]);
      page.node.wrapContentStreams(pdf.context.register(begin), pdf.context.getPopGraphicsStateContentStream());
    }
    page.node.delete(PDFName.of('UserUnit'));
    page.setMediaBox(0, 0, width, height);
    page.setCropBox(0, 0, width, height);
    for (const key of ['BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(PDFName.of(key));
  }
}
