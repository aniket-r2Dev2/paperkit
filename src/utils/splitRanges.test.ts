import { describe, expect, it } from 'vitest';
import { MAX_SPLIT_OUTPUTS, parseSplitRanges } from './splitRanges';

describe('parseSplitRanges', () => {
  it('keeps custom ranges as separate PDFs in user-specified order', () => {
    expect(parseSplitRanges('1-3, 5, 8-10', 10)).toEqual([
      { start: 1, end: 3, indices: [0, 1, 2] },
      { start: 5, end: 5, indices: [4] },
      { start: 8, end: 10, indices: [7, 8, 9] },
    ]);
  });

  it('supports the final page and single-page range', () => {
    expect(parseSplitRanges('10, 2-3', 10)).toEqual([
      { start: 10, end: 10, indices: [9] },
      { start: 2, end: 3, indices: [1, 2] },
    ]);
  });

  it('allows spaces around separators and dashes', () => {
    expect(parseSplitRanges(' 1 - 2 ,  4 ', 4).map(({ start, end }) => [start, end])).toEqual([
      [1, 2],
      [4, 4],
    ]);
  });

  it.each(['', ' ', '1,,3', '1,', ',1', '1-2, '])('rejects empty or missing ranges: %s', (input) => {
    expect(() => parseSplitRanges(input, 10)).toThrow();
  });

  it.each(['0', '11', '2-1', '1-11', '-1', '1-2-3', '1.5', '1e2', 'abc', '9007199254740993'])(
    'rejects malformed, reversed or out-of-range group: %s',
    (input) => {
      expect(() => parseSplitRanges(input, 10)).toThrow();
    },
  );

  it.each(['1-3, 3-5', '2, 2', '1-4, 2', '1-2, 3-5, 5'])(
    'rejects overlapping ranges: %s',
    (input) => {
      expect(() => parseSplitRanges(input, 10)).toThrow(/multiple ranges/);
    },
  );

  it('rejects invalid page counts', () => {
    expect(() => parseSplitRanges('1', 0)).toThrow(/at least one page/);
    expect(() => parseSplitRanges('1', Number.POSITIVE_INFINITY)).toThrow(/at least one page/);
  });

  it('bounds the number of generated outputs', () => {
    const manySingles = Array.from({ length: MAX_SPLIT_OUTPUTS + 1 }, (_, i) => String(i + 1)).join(', ');
    expect(() => parseSplitRanges(manySingles, 500)).toThrow(/no more than 100/);
    expect(parseSplitRanges('1-100', 500)).toHaveLength(1);
  });
});
