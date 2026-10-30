export const MAX_SPLIT_OUTPUTS = 100;

export type SplitRange = {
  start: number;
  end: number;
  indices: number[];
};

/**
 * Each comma-separated item becomes a separate output PDF.
 * Unlike page selection for extract/delete, split ranges must not overlap.
 */
export function parseSplitRanges(
  input: string,
  pageCount: number,
  maxOutputs = MAX_SPLIT_OUTPUTS,
): SplitRange[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error('The PDF must contain at least one page.');
  }

  const parts = input.split(',').map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    throw new Error('Enter page ranges, for example 1-3, 5, 8-10.');
  }
  if (parts.length > maxOutputs) {
    throw new Error('Split supports no more than ' + maxOutputs + ' output PDFs.');
  }

  const usedPages = new Set<number>();
  const groups: SplitRange[] = [];
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) {
      throw new Error('Invalid page range "' + part + '". Use ranges such as 1-3, 5, 8-10.');
    }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > pageCount) {
      throw new Error('Page range "' + part + '" is reversed, out of bounds, or invalid for this PDF.');
    }

    const indices: number[] = [];
    for (let page = start; page <= end; page += 1) {
      if (usedPages.has(page)) {
        throw new Error('Page ' + page + ' appears in multiple ranges. Use non-overlapping ranges.');
      }
      usedPages.add(page);
      indices.push(page - 1);
    }
    groups.push({ start, end, indices });
  }
  return groups;
}
