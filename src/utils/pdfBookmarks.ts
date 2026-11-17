import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef } from 'pdf-lib';

export type Bookmark = { title: string; page: number; depth?: number };
export const MAX_BOOKMARKS = 500;
export const MAX_BOOKMARK_DEPTH = 9;
export const bookmarkDepth = (bookmark: Bookmark) => bookmark.depth ?? 0;

export function validateBookmarks(bookmarks: Bookmark[], pageCount: number): string | null {
  if (!bookmarks.length || bookmarks.length > MAX_BOOKMARKS) return 'Add between 1 and 500 bookmarks.';
  let previousDepth = -1;
  for (const bookmark of bookmarks) {
    const depth = bookmarkDepth(bookmark);
    if (!Number.isInteger(depth) || depth < 0 || depth > MAX_BOOKMARK_DEPTH || depth > previousDepth + 1) return 'Use a valid hierarchy of up to 10 levels without skipping a level.';
    previousDepth = depth;
    if (!bookmark.title.trim() || bookmark.title.length > 200) return 'Each bookmark needs a title of 1–200 characters.';
    if (!Number.isSafeInteger(bookmark.page) || bookmark.page < 1 || bookmark.page > pageCount) return `Choose whole-number destination pages from 1 to ${pageCount}.`;
  }
  return null;
}

// Entries are in reading order, with depth identifying their parent.
export function writeBookmarks(pdf: PDFDocument, bookmarks: Bookmark[], replaceExisting = false): void {
  const error = validateBookmarks(bookmarks, pdf.getPageCount());
  if (error) throw new Error(error);
  if (pdf.catalog.has(PDFName.of('Outlines')) && !replaceExisting) throw new Error('Confirm replacement of existing bookmarks.');
  const root = pdf.context.obj({ Type: 'Outlines' });
  const rootRef = pdf.context.register(root);
  const entries = bookmarks.map(bookmark => pdf.context.obj({
    Title: PDFHexString.fromText(bookmark.title),
    Dest: [pdf.getPage(bookmark.page - 1).ref, 'Fit'],
  }));
  const refs = entries.map(entry => pdf.context.register(entry));
  const children = new Map<number, number[]>();
  const ancestors: number[] = [];
  bookmarks.forEach((bookmark, index) => {
    const depth = bookmarkDepth(bookmark);
    const parent = depth === 0 ? -1 : ancestors[depth - 1];
    children.set(parent, [...(children.get(parent) || []), index]);
    entries[index].set(PDFName.of('Parent'), parent === -1 ? rootRef : refs[parent]);
    ancestors[depth] = index;
    ancestors.length = depth + 1;
  });
  function link(parent: PDFDict, parentRef: PDFRef, indices: number[]): number {
    parent.set(PDFName.of('First'), refs[indices[0]]);
    parent.set(PDFName.of('Last'), refs[indices[indices.length - 1]]);
    let count = 0;
    indices.forEach((index, position) => {
      const entry = entries[index];
      entry.set(PDFName.of('Parent'), parentRef);
      if (position > 0) entry.set(PDFName.of('Prev'), refs[indices[position - 1]]);
      if (position + 1 < indices.length) entry.set(PDFName.of('Next'), refs[indices[position + 1]]);
      count++;
      const nested = children.get(index);
      if (nested) count += link(entry, refs[index], nested);
    });
    parent.set(PDFName.of('Count'), PDFNumber.of(count));
    return count;
  }
  link(root, rootRef, children.get(-1)!);
  pdf.catalog.set(PDFName.of('Outlines'), rootRef);
}

export function subtreeEnd(rows: Bookmark[], index: number): number {
  let end = index + 1;
  while (end < rows.length && bookmarkDepth(rows[end]) > bookmarkDepth(rows[index])) end++;
  return end;
}

export function moveBookmark(rows: Bookmark[], index: number, direction: -1 | 1): Bookmark[] {
  const depth = bookmarkDepth(rows[index]);
  const end = subtreeEnd(rows, index);
  if (direction === 1) {
    if (end >= rows.length || bookmarkDepth(rows[end]) !== depth) return rows;
    const nextEnd = subtreeEnd(rows, end);
    return [...rows.slice(0, index), ...rows.slice(end, nextEnd), ...rows.slice(index, end), ...rows.slice(nextEnd)];
  }
  let previous = index - 1;
  while (previous >= 0 && bookmarkDepth(rows[previous]) > depth) previous--;
  if (previous < 0 || bookmarkDepth(rows[previous]) !== depth) return rows;
  return [...rows.slice(0, previous), ...rows.slice(index, end), ...rows.slice(previous, index), ...rows.slice(end)];
}

export function nestBookmark(rows: Bookmark[], index: number, direction: -1 | 1): Bookmark[] {
  const depth = bookmarkDepth(rows[index]);
  const end = subtreeEnd(rows, index);
  const branch = rows.slice(index, end);
  if (direction === 1) {
    let previous = index - 1;
    while (previous >= 0 && bookmarkDepth(rows[previous]) > depth) previous--;
    if (previous < 0 || bookmarkDepth(rows[previous]) !== depth || branch.some(row => bookmarkDepth(row) >= MAX_BOOKMARK_DEPTH)) return rows;
    return [...rows.slice(0, index), ...branch.map(row => ({ ...row, depth: bookmarkDepth(row) + 1 })), ...rows.slice(end)];
  }
  if (depth === 0) return rows;
  let parent = index - 1;
  while (bookmarkDepth(rows[parent]) >= depth) parent--;
  const parentEnd = subtreeEnd(rows, parent);
  return [...rows.slice(0, index), ...rows.slice(end, parentEnd), ...branch.map(row => ({ ...row, depth: bookmarkDepth(row) - 1 })), ...rows.slice(parentEnd)];
}
