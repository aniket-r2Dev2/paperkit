import { describe, expect, it } from 'vitest';
import { parsePageRange } from './pageRange';

describe('parsePageRange', () => {
  it('converts single pages and ranges to zero-based indices', () => {
    expect(parsePageRange('1-3, 5', 6)).toEqual([0, 1, 2, 4]);
  });

  it('trims spaces around ranges and separators', () => {
    expect(parsePageRange(' 2 - 4 , 6 ', 6)).toEqual([1, 2, 3, 5]);
  });

  it('deduplicates overlapping selections and sorts the result', () => {
    expect(parsePageRange('4, 2-4, 1', 5)).toEqual([0, 1, 2, 3]);
  });

  it('rejects empty input and empty comma-separated items', () => {
    expect(() => parsePageRange('', 4)).toThrow(/Enter page numbers or ranges/);
    expect(() => parsePageRange('1,,3', 4)).toThrow(/Enter page numbers or ranges/);
    expect(() => parsePageRange('1, ', 4)).toThrow(/Enter page numbers or ranges/);
  });

  it.each(['0', '5', '3-2', '-1', '1-6', '1,foo', '1.5', '1e2'])(
    'rejects invalid range %s',
    (input) => {
      expect(() => parsePageRange(input, 5)).toThrow();
    },
  );

  it('rejects invalid page counts', () => {
    expect(() => parsePageRange('1', 0)).toThrow(/at least one page/);
    expect(() => parsePageRange('1', -1)).toThrow(/at least one page/);
    expect(() => parsePageRange('1', 2.5)).toThrow(/at least one page/);
  });
});
