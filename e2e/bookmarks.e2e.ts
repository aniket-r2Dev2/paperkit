import { expect, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { writeBookmarks } from '../src/utils/pdfBookmarks';

async function source(existing = false) {
  const pdf = await PDFDocument.create(); pdf.addPage([300, 400]); pdf.addPage([400, 500]);
  pdf.setTitle('Keep this title');
  if (existing) writeBookmarks(pdf, [{ title: 'Old navigation', page: 1 }]);
  return { name: 'chapters.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

test('create, reorder, validate, download and discard bookmarks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Create PDF bookmarks/ }).click();
  await page.locator('input[type=file]').setInputFiles(await source());
  await page.getByLabel('Bookmark 1 title', { exact: true }).fill('नमस्ते');
  await page.getByLabel('Bookmark 1 page', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save bookmarks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'PDF bookmarks' })).toContainText('whole-number destination');
  await expect(page.getByRole('link', { name: 'Download bookmarked PDF' })).toHaveCount(0);
  await page.getByLabel('Bookmark 1 page', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Add bookmark', exact: true }).click();
  await page.getByLabel('Bookmark 2 title', { exact: true }).fill('Introduction');
  await page.getByRole('button', { name: 'Move bookmark 2 up' }).click();
  await expect(page.getByLabel('Bookmark 1 title', { exact: true })).toHaveValue('Introduction');
  await page.getByRole('button', { name: 'Save bookmarks', exact: true }).click();
  const link = page.getByRole('link', { name: 'Download bookmarked PDF' });
  await expect(link).toBeVisible();
  await expect(page.getByRole('list', { name: 'Saved bookmarks' }).locator('li')).toHaveText(['Introduction — Page 1', 'नमस्ते — Page 2']);
  const download = page.waitForEvent('download'); await link.click();
  const output = await PDFDocument.load(await readFile((await (await download).path())!), { updateMetadata: false });
  expect(output.getTitle()).toBe('Keep this title');
  expect(output.getPageCount()).toBe(2);
  const root = output.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  expect(root.lookup(PDFName.of('First'), PDFDict).lookup(PDFName.of('Title'), PDFHexString).decodeText()).toBe('Introduction');
  const url = await link.getAttribute('href');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.getByLabel('Bookmark 1 title', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(async href => { try { await fetch(href!); return true; } catch { return false; } }, url)).toBe(false);
});

test('existing bookmarks require explicit replacement and switching tools revokes output', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Create PDF bookmarks/ }).click();
  await page.locator('input[type=file]').setInputFiles(await source(true));
  await page.getByLabel('Bookmark 1 title', { exact: true }).fill('Replacement');
  await expect(page.getByRole('button', { name: 'Save bookmarks', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Replace all existing bookmarks/ }).check();
  await page.getByRole('button', { name: 'Save bookmarks', exact: true }).click();
  const link = page.getByRole('link', { name: 'Download bookmarked PDF' });
  await expect(link).toBeVisible();
  const url = await link.getAttribute('href');
  await page.getByRole('button', { name: /Edit PDF properties/ }).click();
  expect(await page.evaluate(async href => { try { await fetch(href!); return true; } catch { return false; } }, url)).toBe(false);
  await page.getByRole('button', { name: /Create PDF bookmarks/ }).click();
  await expect(page.getByLabel('Bookmark 1 title', { exact: true })).toHaveValue('');
});
