import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { validateBookmarks, writeBookmarks } from './pdfBookmarks';

describe('PDF bookmarks', () => {
  it.each([0, -1, 1.5, NaN, Infinity, 4])('rejects invalid destination %s', page => {
    expect(validateBookmarks([{ title: 'Chapter', page }], 3)).not.toBeNull();
  });
  it('bounds titles and bookmark counts', () => {
    expect(validateBookmarks([], 3)).not.toBeNull();
    expect(validateBookmarks([{ title: ' ', page: 1 }], 3)).not.toBeNull();
    expect(validateBookmarks([{ title: 'a'.repeat(201), page: 1 }], 3)).not.toBeNull();
    expect(validateBookmarks(Array(501).fill({ title: 'A', page: 1 }), 3)).not.toBeNull();
  });
  it('round trips Unicode titles, linked order and page references without changing metadata or geometry', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]); pdf.addPage([500, 600]); pdf.setTitle('Original');
    writeBookmarks(pdf, [{ title: 'नमस्ते', page: 2 }, { title: 'Résumé', page: 1 }]);
    const output = await PDFDocument.load(await pdf.save(), { updateMetadata: false });
    const root = output.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    const first = root.lookup(PDFName.of('First'), PDFDict);
    const last = root.lookup(PDFName.of('Last'), PDFDict);
    expect(first.lookup(PDFName.of('Title'), PDFHexString).decodeText()).toBe('नमस्ते');
    expect(first.lookup(PDFName.of('Dest'), PDFArray).get(0)).toEqual(output.getPage(1).ref);
    expect(first.get(PDFName.of('Next'))).toEqual(root.get(PDFName.of('Last')));
    expect(last.get(PDFName.of('Prev'))).toEqual(root.get(PDFName.of('First')));
    expect(last.lookup(PDFName.of('Dest'), PDFArray).get(0)).toEqual(output.getPage(0).ref);
    expect(output.getTitle()).toBe('Original');
    expect(output.getPages().map(p => p.getSize())).toEqual([{ width: 300, height: 400 }, { width: 500, height: 600 }]);
    expect(() => writeBookmarks(output, [{ title: 'New', page: 1 }])).toThrow('Confirm replacement');
    writeBookmarks(output, [{ title: 'New', page: 1 }], true);
    const replaced = output.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(replaced.get(PDFName.of('First'))).toEqual(replaced.get(PDFName.of('Last')));
  });
});
