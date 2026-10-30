import { describe, expect, it } from 'vitest';
import { createPdfZip, crc32 } from './zip';

const bytes = (value: string) => new TextEncoder().encode(value);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('crc32', () => {
  it('matches the standard CRC32 test vector', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });
});

describe('createPdfZip', () => {
  it('creates a well-formed stored ZIP with two PDF files', () => {
    const first = bytes('%PDF-1.7\nfirst');
    const second = bytes('%PDF-1.7\nsecond');
    const archive = createPdfZip([
      { name: 'part-1.pdf', bytes: first },
      { name: 'part-2.pdf', bytes: second },
    ]);
    const view = new DataView(archive.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // Stored without compression
    expect(view.getUint32(14, true)).toBe(crc32(first));
    const firstNameSize = view.getUint16(26, true);
    expect(decode(archive.subarray(30, 30 + firstNameSize))).toBe('part-1.pdf');
    expect(archive.subarray(30 + firstNameSize, 30 + firstNameSize + first.length)).toEqual(first);

    const secondOffset = 30 + firstNameSize + first.length;
    expect(view.getUint32(secondOffset, true)).toBe(0x04034b50);
    const secondNameSize = view.getUint16(secondOffset + 26, true);
    expect(decode(archive.subarray(secondOffset + 30, secondOffset + 30 + secondNameSize))).toBe('part-2.pdf');
    expect(archive.subarray(secondOffset + 30 + secondNameSize, secondOffset + 30 + secondNameSize + second.length)).toEqual(second);

    const eocdOffset = archive.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);
    const centralStart = view.getUint32(eocdOffset + 16, true);
    expect(view.getUint32(centralStart, true)).toBe(0x02014b50);
    expect(view.getUint32(centralStart + 42, true)).toBe(0);
  });

  it('allows a single PDF in an archive', () => {
    expect(createPdfZip([{ name: 'one.pdf', bytes: bytes('%PDF-1.7') }]).length).toBeGreaterThan(22);
  });

  it('rejects empty archives and unsafe or duplicate filenames', () => {
    expect(() => createPdfZip([])).toThrow(/no PDFs/);
    expect(() => createPdfZip([{ name: '../unsafe.pdf', bytes: bytes('a') }])).toThrow(/invalid PDF filename/);
    expect(() => createPdfZip([{ name: 'unsafe.txt', bytes: bytes('a') }])).toThrow(/invalid PDF filename/);
    expect(() => createPdfZip([
      { name: 'one.pdf', bytes: bytes('a') },
      { name: 'one.pdf', bytes: bytes('b') },
    ])).toThrow(/duplicate filenames/);
  });

  it('enforces the archive limit including ZIP headers', () => {
    expect(() => createPdfZip([{ name: 'a.pdf', bytes: bytes('%PDF-1.7') }], 8)).toThrow(/250 MB output limit/);
  });

  it('bounds the total number of packaged PDFs', () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({
      name: 'file-' + index + '.pdf',
      bytes: bytes('%PDF-1.7'),
    }));
    expect(() => createPdfZip(entries)).toThrow(/up to 100/);
  });
});
