import { expect, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { writeBookmarks } from '../src/utils/pdfBookmarks';
import { readFile } from 'node:fs/promises';

async function fixture(external = false) {
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
  writeBookmarks(pdf, [{ title: 'Chapter', page: 1 }, { title: 'Section', page: 2, depth: 1 }, { title: 'Appendix', page: 2 }]);
  const root = pdf.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  const first = root.lookup(PDFName.of('First'), PDFDict);
  if (external) {
    first.delete(PDFName.of('Dest'));
    first.set(PDFName.of('A'), pdf.context.obj({ S: 'URI', URI: PDFString.of('https://example.com') }));
  } else {
    // Exercise named destinations as well as direct page references.
    pdf.catalog.set(PDFName.of('Dests'), pdf.context.obj({ chapter: first.get(PDFName.of('Dest')) }));
    first.set(PDFName.of('Dest'), PDFName.of('chapter'));
  }
  return { name: 'nested.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

test('loads, edits, nests and reorders existing branches, then reopens downloaded hierarchy', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Edit PDF bookmarks/ }).click();
  await page.locator('input[type=file]').setInputFiles(await fixture());
  await expect(page.getByLabel('Bookmark 1 title', { exact: true })).toHaveValue('Chapter');
  await expect(page.getByLabel('Bookmark 2 title', { exact: true })).toHaveValue('Section');
  await page.getByLabel('Bookmark 2 title', { exact: true }).fill('Résumé — अनुभाग');
  await page.getByLabel('Bookmark 2 page', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Move bookmark 3 up', exact: true }).click();
  await expect(page.getByLabel('Bookmark 1 title', { exact: true })).toHaveValue('Appendix');
  await page.getByRole('button', { name: 'Indent bookmark 2', exact: true }).click();
  await page.getByRole('checkbox', { name: /Save changes to existing bookmarks/ }).check();
  await page.getByRole('button', { name: 'Save bookmarks', exact: true }).click();
  const link = page.getByRole('link', { name: 'Download bookmarked PDF' });
  await expect(link).toBeVisible();
  await expect(page.getByRole('list', { name: 'Saved bookmarks' })).toContainText('Résumé — अनुभाग — Page 1 · Level 3');
  const download = page.waitForEvent('download'); await link.click();
  const bytes = await readFile((await (await download).path())!);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'edited.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByLabel('Bookmark 1 title', { exact: true })).toHaveValue('Appendix');
  await expect(page.getByLabel('Bookmark 3 title', { exact: true })).toHaveValue('Résumé — अनुभाग');
  await expect(page.getByLabel('Bookmark 3 page', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Outdent bookmark 2', exact: true }).click();
  await page.getByRole('button', { name: 'Remove bookmark 2', exact: true }).click();
  await expect(page.getByLabel(/Bookmark \d+ title/)).toHaveCount(1);
});

test('unsupported existing actions disable editing without a download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Edit PDF bookmarks/ }).click();
  await page.locator('input[type=file]').setInputFiles(await fixture(true));
  await expect(page.getByRole('region', { name: 'PDF bookmarks' })).toContainText('unsupported actions');
  await expect(page.getByRole('button', { name: 'Save bookmarks', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download bookmarked PDF' })).toHaveCount(0);
});
