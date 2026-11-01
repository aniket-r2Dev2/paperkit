import { describe, expect, it } from 'vitest';
import {
  COMPRESSION_PRESETS,
  chooseSmallerPdf,
  compressionCanvasSize,
  validateCompressionPageCount,
  validateCompressionPreset,
  validateCompressionPdfEnvelope,
} from './compressionOptions';

describe('compression presets', () => {
  it('rejects a fake PDF header missing a document trailer', () => {
    const enc = new TextEncoder();
    expect(() => validateCompressionPdfEnvelope(enc.encode('%PDF-1.7\nthis is not a valid PDF'))).toThrow(/could not be read/);
    expect(() => validateCompressionPdfEnvelope(enc.encode('not a PDF but this has %%EOF and a lot of words'))).toThrow(/could not be read/);
    expect(() => validateCompressionPdfEnvelope(enc.encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'))).not.toThrow();
  });

  it('defines three distinct, honest compression strategies', () => {
    expect(COMPRESSION_PRESETS.lossless.dpi).toBeNull();
    expect(COMPRESSION_PRESETS.balanced.dpi).toBeGreaterThan(COMPRESSION_PRESETS.small.dpi!);
    expect(COMPRESSION_PRESETS.balanced.jpegQuality).toBeGreaterThan(COMPRESSION_PRESETS.small.jpegQuality!);
    expect(COMPRESSION_PRESETS.small.explanation).toMatch(/flattens text/);
  });

  it('rejects invalid presets', () => {
    expect(() => validateCompressionPreset('magic')).toThrow(/supported/);
    expect(() => validateCompressionPreset('balanced')).not.toThrow();
  });

  it('allows 500 pages for the preserve-quality preset', () => {
    expect(() => validateCompressionPageCount(500, 'lossless')).not.toThrow();
    expect(() => validateCompressionPageCount(501, 'lossless')).toThrow(/500/);
  });

  it('limits raster compression to 100 pages', () => {
    expect(() => validateCompressionPageCount(100, 'balanced')).not.toThrow();
    expect(() => validateCompressionPageCount(101, 'balanced')).toThrow(/100 pages/);
    expect(() => validateCompressionPageCount(101, 'small')).toThrow(/100 pages/);
  });

  it('rejects zero or nonfinite page counts', () => {
    expect(() => validateCompressionPageCount(0, 'balanced')).toThrow();
    expect(() => validateCompressionPageCount(Infinity, 'lossless')).toThrow();
  });

  it('bounds canvas dimensions and the total pixel count', () => {
    expect(compressionCanvasSize(100.1, 199.1)).toEqual({ width: 101, height: 200 });
    expect(() => compressionCanvasSize(9000, 100)).toThrow(/too large/);
    expect(() => compressionCanvasSize(5000, 5000)).toThrow(/too large/);
    expect(() => compressionCanvasSize(0, 100)).toThrow(/too large/);
    expect(() => compressionCanvasSize(NaN, 100)).toThrow(/too large/);
  });
});

describe('chooseSmallerPdf', () => {
  it('keeps a genuinely smaller PDF and calculates savings', () => {
    const original = new Uint8Array(1000);
    const smaller = new Uint8Array(640);
    const output = chooseSmallerPdf(original, smaller);
    expect(output.bytes).toBe(smaller);
    expect(output.originalBytes).toBe(1000);
    expect(output.outputBytes).toBe(640);
    expect(output.savedBytes).toBe(360);
    expect(output.savingsPercent).toBe(36);
    expect(output.usedOriginal).toBe(false);
  });

  it('retains the original if candidate is larger or same size', () => {
    const original = new Uint8Array(100);
    for (const candidate of [new Uint8Array(100), new Uint8Array(110)]) {
      const output = chooseSmallerPdf(original, candidate);
      expect(output.bytes).toBe(original);
      expect(output.savedBytes).toBe(0);
      expect(output.savingsPercent).toBe(0);
      expect(output.usedOriginal).toBe(true);
    }
  });

  it('rejects empty source and empty or oversized candidates', () => {
    expect(() => chooseSmallerPdf(new Uint8Array(), new Uint8Array(10))).toThrow(/empty/);
    expect(() => chooseSmallerPdf(new Uint8Array(100), new Uint8Array())).toThrow(/empty/);
    expect(() => chooseSmallerPdf(new Uint8Array(1), new Uint8Array(250 * 1024 * 1024 + 1))).toThrow(/250 MB/);
  });
});
