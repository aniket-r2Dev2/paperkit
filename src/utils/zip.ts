import { RESOURCE_LIMITS } from './resourceLimits';
import { MAX_SPLIT_OUTPUTS } from './splitRanges';

export type ZipEntry = { name: string; bytes: Uint8Array };

const encoder = new TextEncoder();
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_VERSION = 20;
const ZIP_DOS_DATE = 33; // 1980-01-01

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  crcTable[index] = crc >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standards-compliant ZIP archive using the STORE method (no compression).
 * PDF data is typically already compressed; STORE avoids extra CPU and dependencies.
 *
 * The configured output limit includes the entire ZIP archive, not just the PDFs.
 * ZIP64 and streaming archives are intentionally out of scope for the current limits.
 */
export function createPdfZip(
  entries: ZipEntry[],
  maxArchiveBytes = RESOURCE_LIMITS.maxOutputBytes,
): Uint8Array {
  if (entries.length < 1) throw new Error('There are no PDFs to package.');
  if (entries.length > MAX_SPLIT_OUTPUTS) {
    throw new Error('ZIP downloads support up to ' + MAX_SPLIT_OUTPUTS + ' PDF files.');
  }

  const seen = new Set<string>();
  const records = entries.map(({ name, bytes }) => {
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..' ||
        /[\u0000-\u001f]/.test(name) || !name.toLowerCase().endsWith('.pdf')) {
      throw new Error('A ZIP entry has an invalid PDF filename.');
    }
    if (seen.has(name)) throw new Error('The ZIP archive contains duplicate filenames.');
    seen.add(name);
    const filename = encoder.encode(name);
    if (filename.length > 65535) throw new Error('The ZIP filename is too long.');
    if (bytes.byteLength > 0xffffffff) throw new Error('A PDF is too large for this ZIP format.');
    return { filename, bytes, checksum: crc32(bytes) };
  });

  // Local header + file + central directory entry + end-of-central-directory.
  const totalLength = records.reduce(
    (size, entry) => size + 30 + entry.filename.byteLength + entry.bytes.byteLength +
      46 + entry.filename.byteLength,
    22,
  );
  if (!Number.isSafeInteger(totalLength) || totalLength > maxArchiveBytes || totalLength > 0xffffffff) {
    throw new Error('The ZIP archive would exceed the 250 MB output limit.');
  }

  const result = new Uint8Array(totalLength);
  const view = new DataView(result.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  let cursor = 0;
  const offsets: number[] = [];

  for (const record of records) {
    offsets.push(cursor);
    u32(cursor, 0x04034b50);
    u16(cursor + 4, ZIP_VERSION);
    u16(cursor + 6, ZIP_UTF8_FLAG);
    u16(cursor + 8, 0); // STORE (no compression)
    u16(cursor + 10, 0); // time
    u16(cursor + 12, ZIP_DOS_DATE);
    u32(cursor + 14, record.checksum);
    u32(cursor + 18, record.bytes.byteLength);
    u32(cursor + 22, record.bytes.byteLength);
    u16(cursor + 26, record.filename.byteLength);
    u16(cursor + 28, 0);
    cursor += 30;
    result.set(record.filename, cursor);
    cursor += record.filename.byteLength;
    result.set(record.bytes, cursor);
    cursor += record.bytes.byteLength;
  }

  const centralOffset = cursor;
  records.forEach((record, index) => {
    u32(cursor, 0x02014b50);
    u16(cursor + 4, ZIP_VERSION);
    u16(cursor + 6, ZIP_VERSION);
    u16(cursor + 8, ZIP_UTF8_FLAG);
    u16(cursor + 10, 0);
    u16(cursor + 12, 0);
    u16(cursor + 14, ZIP_DOS_DATE);
    u32(cursor + 16, record.checksum);
    u32(cursor + 20, record.bytes.byteLength);
    u32(cursor + 24, record.bytes.byteLength);
    u16(cursor + 28, record.filename.byteLength);
    u16(cursor + 30, 0);
    u16(cursor + 32, 0);
    u16(cursor + 34, 0);
    u16(cursor + 36, 0);
    u32(cursor + 38, 0);
    u32(cursor + 42, offsets[index]);
    cursor += 46;
    result.set(record.filename, cursor);
    cursor += record.filename.byteLength;
  });

  const centralSize = cursor - centralOffset;
  u32(cursor, 0x06054b50);
  u16(cursor + 4, 0);
  u16(cursor + 6, 0);
  u16(cursor + 8, records.length);
  u16(cursor + 10, records.length);
  u32(cursor + 12, centralSize);
  u32(cursor + 16, centralOffset);
  u16(cursor + 20, 0);
  cursor += 22;

  if (cursor !== totalLength) throw new Error('Could not finish the ZIP archive.');
  return result;
}
