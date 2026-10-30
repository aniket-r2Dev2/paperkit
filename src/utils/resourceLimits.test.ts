import { describe, expect, it } from 'vitest';
import {
  RESOURCE_LIMITS,
  assertProcessingActive,
  createProcessingDeadline,
  validateIncomingFiles,
  validateOutputSize,
  validatePageCount,
} from './resourceLimits';

const file = (name: string, size: number) => ({ name, size });

describe('validateIncomingFiles', () => {
  it('accepts files within per-file, count and aggregate limits', () => {
    expect(validateIncomingFiles([], [file('a.pdf', 1024), file('b.pdf', 2048)])).toBeNull();
  });
  it('rejects empty selections and empty files', () => {
    expect(validateIncomingFiles([], [])).toMatch(/at least one/);
    expect(validateIncomingFiles([], [file('empty.pdf', 0)])).toMatch(/Empty files/);
  });
  it('rejects a file larger than the per-file limit', () => {
    expect(validateIncomingFiles([], [file('large.pdf', RESOURCE_LIMITS.maxFileBytes + 1)])).toMatch(/50 MB/);
  });
  it('enforces the file-count limit across the whole session', () => {
    const existing = Array.from({ length: RESOURCE_LIMITS.maxFiles }, (_, i) => file(String(i), 1));
    expect(validateIncomingFiles(existing, [file('extra.pdf', 1)])).toMatch(/no more than/);
  });
  it('enforces the aggregate input limit across the whole session', () => {
    expect(validateIncomingFiles(
      [file('existing.pdf', RESOURCE_LIMITS.maxTotalInputBytes - 1)],
      [file('new.pdf', 2)],
    )).toMatch(/combined file size/);
  });
});

describe('validatePageCount', () => {
  it('accepts page counts within bounds', () => expect(validatePageCount(RESOURCE_LIMITS.maxPages)).toBeNull());
  it('rejects zero, fractional and unsafe counts', () => {
    expect(validatePageCount(0)).toMatch(/valid number/);
    expect(validatePageCount(1.5)).toMatch(/valid number/);
    expect(validatePageCount(Number.MAX_SAFE_INTEGER + 1)).toMatch(/valid number/);
  });
  it('rejects PDFs over the page limit', () => {
    expect(validatePageCount(RESOURCE_LIMITS.maxPages + 1)).toMatch(/up to 500 pages/);
  });
});

describe('validateOutputSize', () => {
  it('accepts outputs up to the limit', () => expect(validateOutputSize(RESOURCE_LIMITS.maxOutputBytes)).toBeNull());
  it('rejects oversized and invalid outputs', () => {
    expect(validateOutputSize(RESOURCE_LIMITS.maxOutputBytes + 1)).toMatch(/250 MB/);
    expect(validateOutputSize(-1)).toMatch(/invalid/);
  });
});

describe('processing deadline and cancellation', () => {
  it('creates a deadline using the configured timeout', () => {
    expect(createProcessingDeadline(100)).toBe(100 + RESOURCE_LIMITS.processingTimeoutMs);
  });
  it('throws an AbortError after cancellation', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => assertProcessingActive(controller.signal, Date.now() + 1000)).toThrow(/cancelled/);
  });
  it('rejects work after the deadline', () => {
    expect(() => assertProcessingActive(new AbortController().signal, 100, 101)).toThrow(/too long/);
  });
});
