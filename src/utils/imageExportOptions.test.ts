import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_OUTPUTS,
  imageOutputName,
  validateImageExportOptions,
  validateRenderedDimensions,
  type ImageExportOptions,
} from './imageExportOptions';

const defaults: ImageExportOptions = { format: 'png', dpi: 150, pages: 'all', range: '' };

describe('PDF to images options', () => {
  it('exports pages in ascending PDF order for all pages', () => {
    expect(validateImageExportOptions(defaults, 3)).toEqual([0, 1, 2]);
  });

  it('validates selected ranges and deduplicates overlapping page references', () => {
    expect(validateImageExportOptions({ ...defaults, pages: 'selected', range: '5, 2-4, 3' }, 5))
      .toEqual([1, 2, 3, 4]);
  });

  it.each(['', '2-1', '0', '6', '2,,3', '1, ', '1e2'])('rejects malformed selection %s', (range) => {
    expect(() => validateImageExportOptions({ ...defaults, pages: 'selected', range }, 5)).toThrow();
  });

  it('rejects unsupported output formats, resolutions and pages modes', () => {
    expect(() => validateImageExportOptions({ ...defaults, format: 'webp' as 'png' }, 2)).toThrow(/PNG or JPEG/);
    expect(() => validateImageExportOptions({ ...defaults, dpi: 600 as 150 }, 2)).toThrow(/supported resolution/);
    expect(() => validateImageExportOptions({ ...defaults, pages: 'foo' as 'all' }, 2)).toThrow(/all pages/);
  });

  it('rejects more than 100 output pages', () => {
    expect(() => validateImageExportOptions(defaults, MAX_IMAGE_OUTPUTS + 1)).toThrow(/up to 100 pages/);
    expect(validateImageExportOptions({ ...defaults, pages: 'selected', range: '101' }, 101)).toEqual([100]);
  });

  it('rejects empty and invalid PDF page counts', () => {
    expect(() => validateImageExportOptions(defaults, 0)).toThrow();
    expect(() => validateImageExportOptions(defaults, NaN)).toThrow();
  });

  it('checks pixel dimensions after applying DPI scaling', () => {
    expect(validateRenderedDimensions(800.1, 600.2)).toEqual({ width: 801, height: 601 });
    expect(() => validateRenderedDimensions(10000, 100)).toThrow(/too large/);
    expect(() => validateRenderedDimensions(5000, 5000)).toThrow(/too large/);
    expect(() => validateRenderedDimensions(0, 500)).toThrow(/too large/);
    expect(() => validateRenderedDimensions(Infinity, 500)).toThrow(/too large/);
  });

  it('creates safe page-numbered PNG and JPEG names', () => {
    expect(imageOutputName('My Documents.pdf', 3, 'png')).toBe('My-Documents-page-3.png');
    expect(imageOutputName('PROJECT.PDF', 9, 'jpeg')).toBe('PROJECT-page-9.jpg');
    expect(imageOutputName(' .pdf', 1, 'jpeg')).toBe('paperkit-page-1.jpg');
  });
});
