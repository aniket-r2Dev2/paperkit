import { expect, it } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { readBookmarkOutline } from './bookmarkOutline';
const item = (extra = {}) => ({ title: 'Chapter', dest: [0, {name: 'Fit'}], items: [], ...extra });
function document(outline: unknown): PDFDocumentProxy {
  return { numPages: 2, getOutline: async () => outline, getDestination: async () => [1, {name: 'Fit'}], getPageIndex: async () => 1 } as unknown as PDFDocumentProxy;
}
it('resolves nested named and explicit destinations in reading order', async () => {
  expect(await readBookmarkOutline(document([item({ items: [item({ title: 'Child', dest: 'named' })] })]), () => {})).toEqual([
    { title: 'Chapter', page: 1, depth: 0 }, { title: 'Child', page: 2, depth: 1 },
  ]);
});
it.each([{dest: null}, {url: 'https://example.com'}, {unsafeUrl: 'javascript:alert(1)'}, {dest: [99]}, {dest: [-1]}])('refuses unsupported or invalid destinations %s', async extra => {
  await expect(readBookmarkOutline(document([item(extra)]), () => {})).rejects.toThrow();
});
it('bounds imported count and depth and obeys cancellation', async () => {
  await expect(readBookmarkOutline(document(Array.from({length: 501}, () => item())), () => {})).rejects.toThrow('500');
  let branch = item();
  for (let i = 0; i < 10; i++) branch = item({items: [branch]});
  await expect(readBookmarkOutline(document([branch]), () => {})).rejects.toThrow('10 levels');
  await expect(readBookmarkOutline(document([item()]), () => { throw new Error('Cancelled'); })).rejects.toThrow('Cancelled');
});
