import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getMergeInputKind, mergeFilesInOrder } from './mergePdfFiles';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGOUq/jAgA0wYRWlkwQA5MABkrnK06oAAAAASUVORK5CYII=';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCYApVv/9k=';
const fromBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
const imageFile = (name: string, type: string, b64: string): File =>
  new File([new Uint8Array(fromBase64(b64))], name, { type });

async function pdfFile(name: string, pageSizes: [number, number][]): Promise<File> {
  const pdf = await PDFDocument.create();
  for (const size of pageSizes) pdf.addPage(size);
  return new File([new Uint8Array(await pdf.save())], name, { type: 'application/pdf' });
}

async function mergedSizes(files: File[]): Promise<[number, number][]> {
  const merged = await mergeFilesInOrder(files, PDFDocument, () => {});
  const result = await PDFDocument.load(merged);
  return result.getPages().map((page) => [page.getWidth(), page.getHeight()]);
}

describe('getMergeInputKind', () => {
  it('classifies PDF, PNG and JPEG extensions regardless of case', () => {
    expect(getMergeInputKind({ name: 'scan.PDF', type: '' })).toBe('pdf');
    expect(getMergeInputKind({ name: 'picture.PNG', type: '' })).toBe('png');
    expect(getMergeInputKind({ name: 'photo.JPEG', type: '' })).toBe('jpeg');
    expect(getMergeInputKind({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('jpeg');
  });
  it('falls back to MIME if the extension is not recognized', () => {
    expect(getMergeInputKind({ name: 'untitled', type: 'application/pdf' })).toBe('pdf');
    expect(getMergeInputKind({ name: 'photo', type: 'image/png' })).toBe('png');
    expect(getMergeInputKind({ name: 'data.txt', type: 'text/plain' })).toBeNull();
  });
});

describe('mergeFilesInOrder', () => {
  it('combines multipage PDFs, PNGs and JPEGs in their exact input order', async () => {
    const files = [
      await pdfFile('first.pdf', [[220, 310], [221, 311]]),
      imageFile('picture.png', 'image/png', PNG_BASE64),
      imageFile('photo.jpeg', 'image/jpeg', JPEG_BASE64),
      await pdfFile('last.pdf', [[410, 510]]),
    ];
    expect(await mergedSizes(files)).toEqual([
      [220, 310], [221, 311], [8, 6], [6, 4], [410, 510],
    ]);
  });

  it('respects a reordered mixed input sequence', async () => {
    const pdf = await pdfFile('pdf.pdf', [[220, 330]]);
    const png = imageFile('picture.png', 'image/png', PNG_BASE64);
    const jpg = imageFile('photo.jpg', 'image/jpeg', JPEG_BASE64);
    expect(await mergedSizes([jpg, pdf, png])).toEqual([
      [6, 4], [220, 330], [8, 6],
    ]);
  });

  it('retains PDF-only and image-only merge functionality', async () => {
    const pdfA = await pdfFile('a.pdf', [[200, 300]]);
    const pdfB = await pdfFile('b.pdf', [[400, 500]]);
    expect(await mergedSizes([pdfA, pdfB])).toEqual([[200, 300], [400, 500]]);
    const png = imageFile('a.png', 'image/png', PNG_BASE64);
    const jpg = imageFile('b.jpg', 'image/jpeg', JPEG_BASE64);
    expect(await mergedSizes([png, jpg])).toEqual([[8, 6], [6, 4]]);
  });

  it('rejects malformed PDFs, invalid images and unsupported file types', async () => {
    const badPdf = new File(['not a pdf'], 'bad.pdf', { type: 'application/pdf' });
    const badImage = new File([new Uint8Array([137, 80, 78, 71])], 'bad.png', { type: 'image/png' });
    const other = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await expect(mergeFilesInOrder([badPdf], PDFDocument, () => {})).rejects.toThrow(/PDF at position 1 could not be read/);
    await expect(mergeFilesInOrder([badImage], PDFDocument, () => {})).rejects.toThrow(/Image at position 1 could not be read/);
    await expect(mergeFilesInOrder([other], PDFDocument, () => {})).rejects.toThrow(/File 1 must be/);
    await expect(mergeFilesInOrder([], PDFDocument, () => {})).rejects.toThrow(/at least one/);
  });

  it('rejects files whose total page count exceeds the 500-page cap', async () => {
    const many = await pdfFile('many.pdf', Array.from({ length: 500 }, () => [100, 100]));
    const oneMore = imageFile('photo.png', 'image/png', PNG_BASE64);
    await expect(mergeFilesInOrder([many, oneMore], PDFDocument, () => {})).rejects.toThrow(/500 pages in total/);
  });

  it('stops when a cancellation checkpoint throws', async () => {
    const files = [
      await pdfFile('one.pdf', [[220, 330]]),
      imageFile('picture.png', 'image/png', PNG_BASE64),
    ];
    let calls = 0;
    await expect(mergeFilesInOrder(files, PDFDocument, () => {
      calls += 1;
      if (calls >= 3) throw new DOMException('Processing was cancelled.', 'AbortError');
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
