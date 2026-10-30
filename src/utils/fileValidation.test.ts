import { describe, expect, it } from 'vitest';
import { validateFileSignatures, validateFilesForTool, type FileTool } from './fileValidation';

type FileDescriptor = { name: string; type: string };
const pdf = (name = 'document.pdf'): FileDescriptor => ({ name, type: 'application/pdf' });
const png = (name = 'image.png'): FileDescriptor => ({ name, type: 'image/png' });
const jpg = (name = 'image.jpg'): FileDescriptor => ({ name, type: 'image/jpeg' });

const pdfTools: FileTool[] = ['merge', 'rotate', 'extract', 'split', 'delete', 'reorder'];

describe('validateFilesForTool', () => {
  it.each(pdfTools)('accepts PDF files for %s', (tool) => {
    expect(validateFilesForTool(tool, [pdf(), pdf('second.pdf')])).toBeNull();
  });

  it.each(pdfTools)('rejects images for %s with a clear message', (tool) => {
    expect(validateFilesForTool(tool, [pdf(), png()])).toMatch(/PDF files only/);
  });

  it('accepts PNG and JPEG files for Images to PDF', () => {
    expect(validateFilesForTool('images', [png(), jpg()])).toBeNull();
  });

  it('rejects PDFs mixed into Images to PDF', () => {
    expect(validateFilesForTool('images', [png(), pdf()])).toMatch(/only PNG and JPG\/JPEG/);
  });

  it('recognizes supported extensions when MIME types are missing', () => {
    expect(validateFilesForTool('merge', [{ name: 'scan.PDF', type: '' }])).toBeNull();
    expect(validateFilesForTool('images', [{ name: 'photo.JPEG', type: '' }])).toBeNull();
  });
});


describe('validateFileSignatures', () => {
  const file = (name: string, type: string, bytes: number[]) =>
    new File([new Uint8Array(bytes)], name, { type });

  it('accepts PDF, PNG and JPEG signatures', async () => {
    expect(await validateFileSignatures([
      file('document.pdf', 'application/pdf', [...new TextEncoder().encode('%PDF-1.7')]),
      file('image.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10]),
      file('image.jpg', 'image/jpeg', [255, 216, 255, 224]),
    ])).toBeNull();
  });

  it('rejects a renamed text file pretending to be a PDF', async () => {
    expect(await validateFileSignatures([
      file('invoice.pdf', 'application/pdf', [...new TextEncoder().encode('not a PDF')]),
    ])).toMatch(/content does not match/);
  });

  it('rejects mismatched PNG and JPEG contents', async () => {
    expect(await validateFileSignatures([
      file('image.png', 'image/png', [255, 216, 255, 224]),
    ])).toMatch(/content does not match/);
    expect(await validateFileSignatures([
      file('image.jpg', 'image/jpeg', [137, 80, 78, 71, 13, 10, 26, 10]),
    ])).toMatch(/content does not match/);
  });

  it('accepts a PDF header after leading bytes within the header window', async () => {
    expect(await validateFileSignatures([
      file('document.pdf', 'application/pdf', [...new TextEncoder().encode('\\n%PDF-1.7')]),
    ])).toBeNull();
  });
});
