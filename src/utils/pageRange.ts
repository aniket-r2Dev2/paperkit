export function parsePageRange(input: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('The PDF must contain at least one page.');
  }

  const parts = input.split(',').map((value) => value.trim());
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new Error('Enter page numbers or ranges, e.g. 1-3, 5.');
  }

  const selected = new Set<number>();
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error('Use page numbers or ranges like 1-3, 5.');

    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > pageCount) {
      throw new Error('Invalid page range: ' + part);
    }
    for (let page = start; page <= end; page += 1) selected.add(page - 1);
  }
  return [...selected].sort((a, b) => a - b);
}
