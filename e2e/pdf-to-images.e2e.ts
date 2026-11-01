import { expect, test, type Download } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function makePdf(pages: number, size: [number, number] = [120, 200]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = pdf.addPage(size);
    page.drawRectangle({ x: 10, y: 10, width: 25 + i, height: 30, color: rgb(i % 2, 0.4, 0.7) });
  }
  return Buffer.from(await pdf.save());
}

async function uploadPdf(page: import('@playwright/test').Page, buffer: Buffer, name = 'sample.pdf') {
  await page.goto('/');
  await page.getByRole('button', { name: /PDF to Images/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name, mimeType: 'application/pdf', buffer,
  });
}

async function bytesFor(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

function storedZipEntries(data: Buffer): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= data.length && data.readUInt32LE(offset) === 0x04034b50) {
    expect(data.readUInt16LE(offset + 8)).toBe(0);
    const filenameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const bytesLength = data.readUInt32LE(offset + 18);
    const name = data.subarray(offset + 30, offset + 30 + filenameLength).toString('utf-8');
    const start = offset + 30 + filenameLength + extraLength;
    map.set(name, data.subarray(start, start + bytesLength));
    offset = start + bytesLength;
  }
  expect(data.readUInt32LE(offset)).toBe(0x02014b50);
  expect(data.readUInt32LE(data.length - 22)).toBe(0x06054b50);
  expect(data.readUInt16LE(data.length - 12)).toBe(map.size);
  return map;
}

test('selected pages export to valid PNGs in a downloadable ZIP', async ({ page }) => {
  await uploadPdf(page, await makePdf(4), 'annual-report.pdf');
  await page.getByLabel('Resolution').selectOption('72');
  await page.getByLabel('Pages to export').selectOption('selected');
  await page.getByLabel('Page numbers or ranges').fill('2, 4');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('2 images are ready to download', { timeout: 20000 });

  const links = page.locator('.split-downloads a[download]');
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveAttribute('download', 'annual-report-images.zip');
  await expect(links.nth(1)).toHaveAttribute('download', 'annual-report-page-2.png');
  await expect(links.nth(2)).toHaveAttribute('download', 'annual-report-page-4.png');

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download all as ZIP/ }).click();
  const zip = storedZipEntries(await bytesFor(await download));
  expect([...zip.keys()]).toEqual(['annual-report-page-2.png', 'annual-report-page-4.png']);
  for (const bytes of zip.values()) {
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(120);
    expect(bytes.readUInt32BE(20)).toBe(200);
  }

  await page.getByRole('button', { name: /Done\? Clear this session/ }).click();
  await expect(page.locator('.split-downloads')).toHaveCount(0);
});

test('single-page JPEG export respects resolution and produces a JPEG download', async ({ page }) => {
  await uploadPdf(page, await makePdf(1));
  await page.getByLabel('Image format').selectOption('jpeg');
  await page.getByLabel('Resolution').selectOption('150');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('1 image is ready to download', { timeout: 20000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download image/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('sample-page-1.jpg');
  const bytes = await bytesFor(file);
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
});

test('invalid page selections show a clear error without any download', async ({ page }) => {
  await uploadPdf(page, await makePdf(3));
  await page.getByLabel('Pages to export').selectOption('selected');
  await page.getByLabel('Page numbers or ranges').fill('1, 5');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid page range', { timeout: 20000 });
  await expect(page.getByRole('link', { name: /Download image/ })).toHaveCount(0);
  await expect(page.locator('.split-downloads')).toHaveCount(0);
});

test('rejects more than 100 raster outputs before allocation', async ({ page }) => {
  await uploadPdf(page, await makePdf(101, [80, 80]));
  await page.getByLabel('Resolution').selectOption('72');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('Export up to 100 pages', { timeout: 20000 });
  await expect(page.locator('.split-downloads')).toHaveCount(0);
});

test('large pages at high DPI produce actionable resolution errors', async ({ page }) => {
  await uploadPdf(page, await makePdf(1, [4000, 4000]));
  await page.getByLabel('Resolution').selectOption('300');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('Select a lower DPI', { timeout: 20000 });
  await expect(page.locator('.split-downloads')).toHaveCount(0);
});

test('rejects non-PDF input in PDF to Images', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /PDF to Images/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
  });
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('PDF files only', { timeout: 20000 });
});
