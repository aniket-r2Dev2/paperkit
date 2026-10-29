import { describe, expect, it } from 'vitest';
import { validateFilesForTool, type FileTool } from './fileValidation';

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
