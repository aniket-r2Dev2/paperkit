import { expect, test, type Download } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function makePdf(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([300, 400]);
  }
  return Buffer.from(await pdf.save());
}

async function expectPdfDownload(download: Download) {
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
}

test('homepage loads and exposes the PDF workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your PDF tasks/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible();
  await expect(page.getByText('Processing stays on this device')).toBeVisible();
});

test('merge flow uploads two PDFs and downloads a valid PDF', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await makePdf(1) },
    { name: 'second.pdf', mimeType: 'application/pdf', buffer: await makePdf(1) },
  ]);
  await expect(page.getByText('2 files added')).toBeVisible();
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('ready to download', { timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download PDF/ }).click();
  await expectPdfDownload(await downloadPromise);
});

test('split flow offers one valid PDF download per page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Split PDF/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'two-page-sample.pdf', mimeType: 'application/pdf', buffer: await makePdf(2),
  });
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('Split complete: 2 PDFs', { timeout: 15_000 });
  const links = page.locator('.split-downloads a[download]');
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveAttribute('download', 'two-page-sample-split.zip');
  await expect(links.nth(1)).toHaveAttribute('download', 'two-page-sample-page-1.pdf');
  await expect(links.nth(2)).toHaveAttribute('download', 'two-page-sample-page-2.pdf');
  const downloadPromise = page.waitForEvent('download');
  await links.nth(1).click();
  await expectPdfDownload(await downloadPromise);
});


async function readStoredZip(download: Download): Promise<Map<string, Buffer>> {
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const zip = await readFile(downloadPath!);
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    expect(zip.readUInt16LE(offset + 8)).toBe(0); // STORE method
    const entrySize = zip.readUInt32LE(offset + 18);
    const filenameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + filenameLength).toString('utf8');
    const dataStart = offset + 30 + filenameLength + extraLength;
    const end = dataStart + entrySize;
    expect(end).toBeLessThanOrEqual(zip.length);
    entries.set(name, zip.subarray(dataStart, end));
    offset = end;
  }
  expect(zip.readUInt32LE(offset)).toBe(0x02014b50); // Central directory
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50); // End of ZIP
  expect(zip.readUInt16LE(zip.length - 12)).toBe(entries.size);
  return entries;
}

test('custom ranges generate separate PDFs and a valid ZIP archive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Split PDF/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ten-page.pdf', mimeType: 'application/pdf', buffer: await makePdf(10),
  });
  await page.getByLabel('Split mode').selectOption('ranges');
  await page.getByLabel('Page ranges').fill('1-3, 5, 8-10');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('Split complete: 3 PDFs', { timeout: 15_000 });
  const links = page.locator('.split-downloads a[download]');
  await expect(links).toHaveCount(4);
  await expect(links.nth(0)).toHaveAttribute('download', 'ten-page-split.zip');
  await expect(links.nth(1)).toHaveAttribute('download', 'ten-page-pages-1-3.pdf');
  await expect(links.nth(2)).toHaveAttribute('download', 'ten-page-pages-5.pdf');
  await expect(links.nth(3)).toHaveAttribute('download', 'ten-page-pages-8-10.pdf');

  const zipPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download all as ZIP/ }).click();
  const entries = await readStoredZip(await zipPromise);
  expect([...entries.keys()]).toEqual([
    'ten-page-pages-1-3.pdf',
    'ten-page-pages-5.pdf',
    'ten-page-pages-8-10.pdf',
  ]);
  for (const [name, data] of entries) {
    const pdf = await PDFDocument.load(data);
    expect(pdf.getPageCount()).toBe(name.includes('pages-5') ? 1 : 3);
  }

  const individualDownload = page.waitForEvent('download');
  await links.nth(2).click();
  await expectPdfDownload(await individualDownload);
  await page.getByRole('button', { name: /Done\? Clear this session/ }).click();
  await expect(page.locator('.split-downloads')).toHaveCount(0);
});

test('invalid and overlapping custom split ranges show errors without a download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Split PDF/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'five-page.pdf', mimeType: 'application/pdf', buffer: await makePdf(5),
  });
  await page.getByLabel('Split mode').selectOption('ranges');
  await page.getByLabel('Page ranges').fill('1-3, 3-5');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('multiple ranges', { timeout: 15_000 });
  await expect(page.locator('.split-downloads a')).toHaveCount(0);

  await page.getByLabel('Page ranges').fill('4-8');
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('out of bounds', { timeout: 15_000 });
  await expect(page.locator('.split-downloads a')).toHaveCount(0);
});
