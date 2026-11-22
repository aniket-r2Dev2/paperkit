import { describe, expect, it } from 'vitest';
import createModule from '@soulehshaikh99/qpdf-wasm';
import { PDFDocument, degrees } from 'pdf-lib';
import { passwordError, transformPdf } from './pdfSecurity';

async function fixture(count = 2) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Private document');
  for (let i = 0; i < count; i++) { const p = pdf.addPage([300 + i, 400]); p.drawText('Preserve selectable text'); if (i === 1) p.setRotation(degrees(90)); }
  const form = pdf.getForm().createTextField('name'); form.setText('Test person'); form.addToPage(pdf.getPage(0));
  return pdf.save();
}

describe('PDF security', () => {
  it('validates passwords without trimming spaces or silently truncating UTF-8', () => {
    expect(passwordError('protect', '')).toContain('Enter');
    expect(passwordError('protect', 'short')).toContain('8');
    expect(passwordError('protect', 'long-password', 'other')).toContain('match');
    expect(passwordError('unlock', 'x')).toBeNull();
    expect(passwordError('protect', ' é password ')).toBeNull();
    expect(passwordError('protect', 'é'.repeat(64))).toContain('127');
    expect(passwordError('unlock', 'abc\n')).toContain('control');
  });
  it('round trips AES-256 while preserving pages, rotation, text streams, metadata and form fields', async () => {
    const q = await createModule();
    const input = await fixture();
    const protectedBytes = transformPdf(q, input, 'protect', ' café-secret ');
    expect(input.every(v => v === 0)).toBe(true);
    expect(new TextDecoder().decode(protectedBytes)).toContain('/AESV3');
    await expect(PDFDocument.load(protectedBytes)).rejects.toThrow();
    const unlocked = transformPdf(q, protectedBytes, 'unlock', ' café-secret ');
    const pdf = await PDFDocument.load(unlocked);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPages().map(p => [p.getWidth(), p.getHeight(), p.getRotation().angle])).toEqual([[300,400,0],[301,400,90]]);
    expect(pdf.getTitle()).toBe('Private document');
    expect(pdf.getForm().getTextField('name').getText()).toBe('Test person');
    for (const path of ['/input.pdf','/output.pdf','/inspect.json']) expect(() => q.FS.readFile(path)).toThrow();
  });
  it('rejects missing and wrong passwords and never leaves partial output', async () => {
    const q = await createModule(); const encrypted = transformPdf(q, await fixture(), 'protect', 'correct-password');
    expect(() => transformPdf(q, encrypted.slice(), 'unlock', '')).toThrow('Enter');
    expect(() => transformPdf(q, encrypted.slice(), 'unlock', 'wrong-password')).toThrow();
    for (const path of ['/input.pdf','/output.pdf','/inspect.json']) expect(() => q.FS.readFile(path)).toThrow();
  });
  it('does not unlock owner-restricted PDFs with an arbitrary password', async () => {
    const q = await createModule(); q.FS.writeFile('/fixture.pdf', await fixture());
    expect(q.callMain(['/fixture.pdf','--encrypt','--user-password=','--owner-password=owner-secret','--bits=256','--','/locked.pdf'])).toBe(0);
    const encrypted=q.FS.readFile('/locked.pdf');
    expect(() => transformPdf(q, encrypted.slice(), 'unlock', 'unrelated')).toThrow();
    expect((await PDFDocument.load(transformPdf(q, encrypted.slice(), 'unlock', 'owner-secret'))).getPageCount()).toBe(2);
  });
  it('rejects unencrypted unlock input, encrypted protect input, malformed and oversized page counts', async () => {
    const q = await createModule();
    expect(() => transformPdf(q, new TextEncoder().encode('%PDF-broken'), 'protect', 'password-long')).toThrow();
    expect(() => transformPdf(q, new Uint8Array(), 'protect', 'password-long')).toThrow();
    const normal = await fixture();
    expect(() => transformPdf(q, normal, 'unlock', 'password-long')).toThrow('not encrypted');
    const encrypted=transformPdf(q, await fixture(), 'protect', 'password-long');
    expect(() => transformPdf(q, encrypted, 'protect', 'password-long')).toThrow();
    const manyPages = await fixture(501);
    expect(() => transformPdf(q, manyPages, 'protect', 'password-long')).toThrow('500');
  });
});
