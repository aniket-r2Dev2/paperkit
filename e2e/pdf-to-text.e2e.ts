import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function openTool(page: Page, contents: Buffer) {
  await page.goto('/');
  await page.getByRole('button', { name: /PDF to Text/ }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'test.pdf', mimeType: 'application/pdf', buffer: contents,
  });
}

test('exports UTF-8 text in page order and revokes replaced and cleared downloads', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('first');
  pdf.addPage();
  pdf.addPage().drawText('café');
  await openTool(page, Buffer.from(await pdf.save()));
  const link = page.getByRole('link', { name: 'Download text' });
  const range = page.getByLabel('Pages to export');
  for (const [selection, expected] of [['', 'first\n\f\n\n\f\ncafé'], ['2-3', '\n\f\ncafé']]) {
    await range.fill(selection);
    await page.getByRole('button', { name: 'Process PDF' }).click();
    const downloaded = page.waitForEvent('download');
    await link.click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe('paperkit-text.txt');
    expect(await readFile((await file.path())!, 'utf8')).toBe(expected);
    const url = await link.getAttribute('href');
    if (!selection) await range.fill('2-3');
    else await page.getByRole('button', { name: /Clear this session/ }).click();
    await expect(link).toHaveCount(0);
    expect(await page.evaluate(async href => {
      try { await fetch(href!); return true; } catch { return false; }
    }, url)).toBe(false);
  }
});

test('textless pages, invalid ranges and damaged files have actionable errors and no download', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await openTool(page, Buffer.from(await pdf.save()));
  const process = page.getByRole('button', { name: 'Process PDF' });
  await process.click();
  await expect(page.getByRole('alert')).toContainText('OCR');
  await page.getByLabel('Pages to export').fill('2');
  await process.click();
  await expect(page.getByRole('alert')).toContainText('Invalid page range');
  await openTool(page, Buffer.from('%PDF-1.7\ninvalid\n%%EOF'));
  await process.click();
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  await expect(page.getByRole('link', { name: 'Download text' })).toHaveCount(0);
});
