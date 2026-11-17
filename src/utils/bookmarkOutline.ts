import type { PDFDocumentProxy } from 'pdfjs-dist';
import { type Bookmark, MAX_BOOKMARKS, MAX_BOOKMARK_DEPTH } from './pdfBookmarks';

// Resolve both explicit and named internal destinations. Refuse unsupported entries
// rather than quietly dropping navigation while rewriting an outline.
export async function readBookmarkOutline(document: PDFDocumentProxy, active: () => void): Promise<Bookmark[]> {
  const outline = await document.getOutline();
  const result: Bookmark[] = [];
  async function visit(items: NonNullable<typeof outline>, depth: number) {
    for (const item of items) {
      active();
      if (depth > MAX_BOOKMARK_DEPTH || result.length >= MAX_BOOKMARKS) throw new Error('This outline exceeds 500 bookmarks or 10 levels.');
      if (item.url || item.unsafeUrl || !item.dest) throw new Error('This outline contains unsupported actions or bookmarks without a page destination. Editing is disabled to preserve them.');
      const destination = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
      if (!Array.isArray(destination)) throw new Error('Cannot resolve an existing bookmark destination.');
      const target = destination[0];
      const index = typeof target === 'number' ? target : await document.getPageIndex(target);
      if (!Number.isSafeInteger(index) || index < 0 || index >= document.numPages) throw new Error('An existing bookmark points outside this PDF.');
      result.push({ title: item.title, page: index + 1, depth });
      await visit(item.items, depth + 1);
    }
  }
  await visit(outline || [], 0);
  return result;
}
