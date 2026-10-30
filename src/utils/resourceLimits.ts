export const RESOURCE_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalInputBytes: 200 * 1024 * 1024,
  maxPages: 500,
  maxOutputBytes: 250 * 1024 * 1024,
  processingTimeoutMs: 120_000,
} as const;

type SizedFile = Pick<File, 'name' | 'size'>;

export function validateIncomingFiles(
  existing: SizedFile[],
  incoming: SizedFile[],
): string | null {
  if (incoming.length === 0) return 'Choose at least one supported file.';
  if (existing.length + incoming.length > RESOURCE_LIMITS.maxFiles) {
    return `Choose no more than ${RESOURCE_LIMITS.maxFiles} files in one session.`;
  }
  if (incoming.some((file) => file.size <= 0)) return 'Empty files are not supported.';
  if (incoming.some((file) => file.size > RESOURCE_LIMITS.maxFileBytes)) {
    return 'Each file must be 50 MB or smaller.';
  }
  const totalBytes = [...existing, ...incoming].reduce((total, file) => total + file.size, 0);
  if (totalBytes > RESOURCE_LIMITS.maxTotalInputBytes) {
    return 'The combined file size must be 200 MB or smaller per session.';
  }
  return null;
}

export function validatePageCount(pageCount: number): string | null {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    return 'This document does not contain a valid number of pages.';
  }
  if (pageCount > RESOURCE_LIMITS.maxPages) {
    return `This tool supports up to ${RESOURCE_LIMITS.maxPages} pages per PDF.`;
  }
  return null;
}

export function validateOutputSize(byteLength: number): string | null {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    return 'The generated file size is invalid.';
  }
  if (byteLength > RESOURCE_LIMITS.maxOutputBytes) {
    return 'The generated PDF is larger than the 250 MB output limit.';
  }
  return null;
}

export function createProcessingDeadline(now = Date.now()): number {
  return now + RESOURCE_LIMITS.processingTimeoutMs;
}

export function assertProcessingActive(signal: AbortSignal, deadline: number, now = Date.now()): void {
  if (signal.aborted) throw new DOMException('Processing was cancelled.', 'AbortError');
  if (now > deadline) throw new Error('Processing took too long. Try a smaller or simpler file.');
}
