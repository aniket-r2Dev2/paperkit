import { describe, expect, it } from 'vitest';
import { parsePageRange } from './utils/pageRange';

describe('parsePageRange', () => {
  it('parses comma-separated pages and ranges', () => {
    expect(parsePageRange('1-3, 5, 8', 10)).toEqual([0, 1, 2, 4, 7]);
  });
  it('deduplicates overlaps and sorts page indices', () => {
    expect(parsePageRange('3-4, 1-3', 5)).toEqual([0, 1, 2, 3]);
  });
  it('rejects page numbers outside the document', () => {
    expect(() => parsePageRange('1-7', 6)).toThrow();
  });
  it('rejects reversed ranges', () => {
    expect(() => parsePageRange('4-2', 5)).toThrow();
  });
  it('rejects malformed values', () => {
    expect(() => parsePageRange('a-3', 5)).toThrow();
  });
  it('rejects empty input', () => {
    expect(() => parsePageRange(' , ', 5)).toThrow();
  });
  it('rejects invalid page counts', () => {
    expect(() => parsePageRange('1', 0)).toThrow();
  });
});
