import { PDFDocument, PDFHexString, PDFName, PDFNumber } from 'pdf-lib';

export type Bookmark = { title: string; page: number };
export const MAX_BOOKMARKS = 500;

export function validateBookmarks(bookmarks: Bookmark[], pageCount: number): string | null {
  if (!bookmarks.length || bookmarks.length > MAX_BOOKMARKS) return 'Add between 1 and 500 bookmarks.';
  for (const bookmark of bookmarks) {
    if (!bookmark.title.trim() || bookmark.title.length > 200) return 'Each bookmark needs a title of 1–200 characters.';
    if (!Number.isSafeInteger(bookmark.page) || bookmark.page < 1 || bookmark.page > pageCount) return `Choose whole-number destination pages from 1 to ${pageCount}.`;
  }
  return null;
}

// Flat outline entries use indirect page references so PDF readers can resolve destinations.
export function writeBookmarks(pdf: PDFDocument, bookmarks: Bookmark[], replaceExisting = false): void {
  const error = validateBookmarks(bookmarks, pdf.getPageCount());
  if (error) throw new Error(error);
  if (pdf.catalog.has(PDFName.of('Outlines')) && !replaceExisting) throw new Error('Confirm replacement of existing bookmarks.');
  const root = pdf.context.obj({ Type: 'Outlines' });
  const rootRef = pdf.context.register(root);
  const entries = bookmarks.map(bookmark => pdf.context.obj({
    Title: PDFHexString.fromText(bookmark.title),
    Parent: rootRef,
    Dest: [pdf.getPage(bookmark.page - 1).ref, 'Fit'],
  }));
  const refs = entries.map(entry => pdf.context.register(entry));
  entries.forEach((entry, index) => {
    if (index > 0) entry.set(PDFName.of('Prev'), refs[index - 1]);
    if (index + 1 < refs.length) entry.set(PDFName.of('Next'), refs[index + 1]);
  });
  root.set(PDFName.of('First'), refs[0]);
  root.set(PDFName.of('Last'), refs[refs.length - 1]);
  root.set(PDFName.of('Count'), PDFNumber.of(refs.length));
  pdf.catalog.set(PDFName.of('Outlines'), rootRef);
}
