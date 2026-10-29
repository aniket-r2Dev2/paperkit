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
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('download', 'two-page-sample-page-1.pdf');
  await expect(links.nth(1)).toHaveAttribute('download', 'two-page-sample-page-2.pdf');
  const downloadPromise = page.waitForEvent('download');
  await links.nth(0).click();
  await expectPdfDownload(await downloadPromise);
});
