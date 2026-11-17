import { expect, it } from 'vitest';
import { bookmarkDepth, moveBookmark, nestBookmark, subtreeEnd, validateBookmarks, type Bookmark } from './pdfBookmarks';
const rows: Bookmark[] = [
  { title: 'A', page: 1 }, { title: 'A1', page: 1, depth: 1 },
  { title: 'A2', page: 1, depth: 1 }, { title: 'A2a', page: 1, depth: 2 },
  { title: 'B', page: 1 }, { title: 'B1', page: 1, depth: 1 },
];
const describeRows = (items: Bookmark[]) => items.map(item => `${item.title}:${bookmarkDepth(item)}`);
it('moves sibling branches without detaching descendants', () => {
  expect(describeRows(moveBookmark(rows, 4, -1))).toEqual(['B:0','B1:1','A:0','A1:1','A2:1','A2a:2']);
  expect(describeRows(moveBookmark(rows, 1, 1))).toEqual(['A:0','A2:1','A2a:2','A1:1','B:0','B1:1']);
  expect(moveBookmark(rows, 1, -1)).toBe(rows);
  expect(moveBookmark(rows, 2, 1)).toBe(rows);
});
it('indents branches and outdents after all remaining parent children', () => {
  expect(describeRows(nestBookmark(rows, 2, 1))).toEqual(['A:0','A1:1','A2:2','A2a:3','B:0','B1:1']);
  expect(describeRows(nestBookmark(rows, 1, -1))).toEqual(['A:0','A2:1','A2a:2','A1:0','B:0','B1:1']);
  expect(nestBookmark(rows, 1, 1)).toBe(rows);
  expect(nestBookmark(rows, 0, -1)).toBe(rows);
  expect(subtreeEnd(rows, 0)).toBe(4);
});
it('rejects skipped, fractional and excessive depths', () => {
  for (const depth of [-1, 1, 0.5, NaN, 10]) expect(validateBookmarks([{ title: 'A', page: 1, depth }], 1)).not.toBeNull();
  expect(validateBookmarks([{ title: 'A', page: 1 }, { title: 'B', page: 1, depth: 2 }], 1)).not.toBeNull();
  const deep = Array.from({length: 10}, (_, depth) => ({ title: String(depth), page: 1, depth }));
  expect(validateBookmarks(deep, 1)).toBeNull();
});
