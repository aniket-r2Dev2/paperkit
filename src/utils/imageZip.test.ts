import { describe, expect, it } from 'vitest';
import { createImageZip, createPdfZip } from './zip';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
const jpg = new Uint8Array([255, 216, 255, 224, 1, 2, 255, 217]);

describe('createImageZip', () => {
  it('packages PNG and JPEG entries with correct filenames and payloads', () => {
    const bytes = createImageZip([{ name: 'page-1.png', bytes: png }, { name: 'page-2.jpg', bytes: jpg }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(2);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))).toBe('page-1.png');
    expect(bytes.subarray(30 + nameLength, 30 + nameLength + png.length)).toEqual(png);
    const secondOffset = 30 + nameLength + png.length;
    expect(view.getUint32(secondOffset, true)).toBe(0x04034b50);
    const name2length = view.getUint16(secondOffset + 26, true);
    expect(new TextDecoder().decode(bytes.subarray(secondOffset + 30, secondOffset + 30 + name2length))).toBe('page-2.jpg');
    expect(bytes.subarray(secondOffset + 30 + name2length, secondOffset + 30 + name2length + jpg.length)).toEqual(jpg);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });

  it('rejects unsupported extensions, unsafe entry names and archive size overruns', () => {
    expect(() => createImageZip([{ name: 'bad.pdf', bytes: png }])).toThrow(/invalid image filename/);
    expect(() => createImageZip([{ name: '../bad.png', bytes: png }])).toThrow(/invalid image filename/);
    expect(() => createImageZip([{ name: 'ok.png', bytes: png }], 20)).toThrow(/250 MB/);
    expect(() => createPdfZip([{ name: 'bad.png', bytes: png }])).toThrow(/invalid PDF filename/);
  });
});
