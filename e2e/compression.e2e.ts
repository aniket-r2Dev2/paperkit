import { expect, test, type Download } from '@playwright/test';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

async function makeTextPdf(pageCount = 1, width = 280, height = 360): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = pdf.addPage([width, height]);
    page.drawText('PaperKit searchable source page ' + (i + 1), { x: 15, y: height - 30, size: 14, font });
    page.drawRectangle({ x: 15, y: 20, width: 120, height: 45, color: rgb(0.3, 0.6, 0.8) });
  }
  return Buffer.from(await pdf.save());
}

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let i = 0; i < 8; i += 1) {
      value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, bytes: Buffer): Buffer {
  const label = Buffer.from(type);
  const body = Buffer.concat([label, bytes]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([header, body, checksum]);
}

/** Dense deterministic 256x256 image for meaningful raster-compression coverage. */
function noisyPng(width = 256, height = 256): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let seed = 0x4f6b7461;
  for (let row = 0; row < height; row += 1) {
    raw[row * (width * 3 + 1)] = 0;
    for (let i = 0; i < width * 3; i += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      raw[row * (width * 3 + 1) + 1 + i] = seed & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8-bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function imageHeavyPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(noisyPng());
  const page = pdf.addPage([256, 256]);
  page.drawImage(png, { x: 0, y: 0, width: 256, height: 256 });
  return Buffer.from(await pdf.save());
}

async function openCompression(page: import('@playwright/test').Page, buffer: Buffer) {
  await page.goto('/');
  await page.getByRole('button', { name: /Compress PDF/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'source.pdf', mimeType: 'application/pdf', buffer,
  });
}

async function downloadResult(page: import('@playwright/test').Page): Promise<{ filename: string; bytes: Buffer }> {
  const requested = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download PDF/ }).click();
  const download: Download = await requested;
  const path = await download.path();
  expect(path).not.toBeNull();
  return { filename: download.suggestedFilename(), bytes: await readFile(path!) };
}

test('preserve-quality compression keeps valid PDF geometry and honest size comparison', async ({ page }) => {
  const original = await makeTextPdf(2);
  await openCompression(page, original);
  await expect(page.getByLabel('Compression preset')).toHaveValue('lossless');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('Your PDF is ready', { timeout: 20_000 });
  const summary = page.getByTestId('compression-summary');
  await expect(summary).toContainText('Original:');
  await expect(summary).toContainText('Result:');
  await expect(summary).toContainText('Reduced by');
  const result = await downloadResult(page);
  expect(result.bytes.byteLength).toBeLessThanOrEqual(original.byteLength);
  const pdf = await PDFDocument.load(result.bytes);
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([[280, 360], [280, 360]]);
});

test('small-file preset meaningfully reduces an image-heavy PDF and preserves page size', async ({ page }) => {
  const original = await imageHeavyPdf();
  await openCompression(page, original);
  await page.getByLabel('Compression preset').selectOption('small');
  await expect(page.getByRole('note')).toContainText('flattens pages into images');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('Your PDF is ready', { timeout: 20_000 });
  const summary = page.getByTestId('compression-summary');
  await expect(summary).toContainText('Reduced by');
  await expect(summary).not.toContainText('original file was retained');
  const result = await downloadResult(page);
  expect(result.filename).toBe('paperkit-compressed.pdf');
  expect(result.bytes.byteLength).toBeLessThan(original.byteLength);
  const pdf = await PDFDocument.load(result.bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([[256, 256]]);
  await page.getByRole('button', { name: /Done\? Clear this session/ }).click();
  await expect(page.getByTestId('compression-summary')).toHaveCount(0);
});

test('balanced mode preserves all pages and never produces a larger download', async ({ page }) => {
  const original = await makeTextPdf(3);
  await openCompression(page, original);
  await page.getByLabel('Compression preset').selectOption('balanced');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('Your PDF is ready', { timeout: 20_000 });
  const result = await downloadResult(page);
  expect(result.bytes.byteLength).toBeLessThanOrEqual(original.byteLength);
  const pdf = await PDFDocument.load(result.bytes);
  expect(pdf.getPageCount()).toBe(3);
  expect(pdf.getPages().every((p) => p.getWidth() === 280 && p.getHeight() === 360)).toBeTruthy();
  if (result.filename === 'paperkit-original.pdf') {
    expect(result.bytes).toEqual(original);
    await expect(page.getByTestId('compression-summary')).toContainText('original file was retained');
  }
});

test('raster compression rejects over 100 pages before rendering', async ({ page }) => {
  await openCompression(page, await makeTextPdf(101, 80, 80));
  await page.getByLabel('Compression preset').selectOption('small');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('up to 100 pages', { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Download PDF/ })).toHaveCount(0);
});

test('oversized raster canvas suggests the preserve-quality preset', async ({ page }) => {
  await openCompression(page, await makeTextPdf(1, 5000, 5000));
  await page.getByLabel('Compression preset').selectOption('balanced');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('Try Preserve quality instead', { timeout: 20_000 });
  await expect(page.getByTestId('compression-summary')).toHaveCount(0);
});

test('malformed PDF is rejected without exposing an output', async ({ page }) => {
  await openCompression(page, Buffer.from('%PDF-1.7\nthis is not a valid PDF'));
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('could not be read', { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Download PDF/ })).toHaveCount(0);
});

test('compression rejects image-only input', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Compress PDF/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'picture.png', mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
  });
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('PDF files only', { timeout: 20_000 });
});

test('changing presets clears the previous downloadable result', async ({ page }) => {
  await openCompression(page, await makeTextPdf());
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByTestId('compression-summary')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Compression preset').selectOption('balanced');
  await expect(page.getByTestId('compression-summary')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Download PDF/ })).toHaveCount(0);
});
