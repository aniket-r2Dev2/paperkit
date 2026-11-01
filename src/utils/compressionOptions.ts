import { RESOURCE_LIMITS, validatePageCount } from './resourceLimits';

export type CompressionPreset = 'lossless' | 'balanced' | 'small';
export type RasterCompressionPreset = Exclude<CompressionPreset, 'lossless'>;

export const COMPRESSION_PRESETS = {
  lossless: {
    label: 'Preserve quality',
    explanation: 'Rewrites PDF structure without intentionally changing page artwork or text. Size reductions are not guaranteed.',
    dpi: null,
    jpegQuality: null,
  },
  balanced: {
    label: 'Balanced',
    explanation: 'Renders pages to JPEG at 144 DPI and 76% quality. Reduces image detail and flattens text, links and forms.',
    dpi: 144,
    jpegQuality: 0.76,
  },
  small: {
    label: 'Small file',
    explanation: 'Renders pages to JPEG at 96 DPI and 55% quality. More visible quality loss; flattens text, links and forms.',
    dpi: 96,
    jpegQuality: 0.55,
  },
} as const;

export const MAX_RASTER_COMPRESSION_PAGES = 100;
export const MAX_COMPRESSION_PIXELS = 16_000_000;
export const MAX_COMPRESSION_SIDE = 8192;

export function validateCompressionPreset(preset: string): asserts preset is CompressionPreset {
  if (preset !== 'lossless' && preset !== 'balanced' && preset !== 'small') {
    throw new Error('Select a supported compression preset.');
  }
}

export function validateCompressionPageCount(pageCount: number, preset: CompressionPreset): void {
  const error = validatePageCount(pageCount);
  if (error) throw new Error(error);
  if (preset !== 'lossless' && pageCount > MAX_RASTER_COMPRESSION_PAGES) {
    throw new Error(
      'Balanced and Small file presets support up to ' + MAX_RASTER_COMPRESSION_PAGES +
      ' pages per PDF. Try Preserve quality for larger files.',
    );
  }
}

export function compressionCanvasSize(width: number, height: number): { width: number; height: number } {
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) ||
      w < 1 || h < 1 || w > MAX_COMPRESSION_SIDE ||
      h > MAX_COMPRESSION_SIDE || w * h > MAX_COMPRESSION_PIXELS) {
    throw new Error('This page is too large to rasterize safely. Try Preserve quality instead.');
  }
  return { width: w, height: h };
}

export type CompressionOutcome = {
  bytes: Uint8Array;
  originalBytes: number;
  outputBytes: number;
  savedBytes: number;
  savingsPercent: number;
  usedOriginal: boolean;
};

/** Avoid advertising compression when the rewrite would grow the document. */
export function chooseSmallerPdf(
  original: Uint8Array,
  candidate: Uint8Array,
): CompressionOutcome {
  if (!original.byteLength || !candidate.byteLength ||
      candidate.byteLength > RESOURCE_LIMITS.maxOutputBytes) {
    throw new Error('The resulting PDF is empty or exceeds the 250 MB output limit.');
  }

  const usedOriginal = candidate.byteLength >= original.byteLength;
  const output = usedOriginal ? original : candidate;
  const savedBytes = original.byteLength - output.byteLength;

  return {
    bytes: output,
    originalBytes: original.byteLength,
    outputBytes: output.byteLength,
    savedBytes,
    savingsPercent: Math.round((savedBytes / original.byteLength) * 1000) / 10,
    usedOriginal,
  };
}
