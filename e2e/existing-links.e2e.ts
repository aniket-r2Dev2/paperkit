import { test, expect } from '@playwright/test';
import { PDFDocument, PDFString, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
async function fixture(angle = 0) {
  const pdf = await PDFDocument.create(); const p = pdf.addPage([400, 600]); p.setCropBox(20, 30, 300, 500); p.setRotation(degrees(angle)); pdf.addPage(); pdf.addPage();
  p.drawText('Keep original text', { x: 50, y: 200, size: 12 });
  for (const props of [
    { A: { S: 'URI', URI: PDFString.of('https://example.com/original') } },
    { A: { S: 'GoTo', D: [pdf.getPage(1).ref, 'Fit'] } },
    { A: { S: 'URI', URI: PDFString.of('https://example.com/remove') } },
    { A: { S: 'URI', URI: PDFString.of('mailto:hello@example.com') } },
    { Subtype: 'Text', Contents: PDFString.of('Keep note') },
  ]) p.node.addAnnot(pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [50, 400, 150, 420], Border: [0, 0, 2], ...props })));
  return Buffer.from(await pdf.save());
}
for (const angle of [0, 90, 180, 270]) test(`edit original PDF links and preserve other content at ${angle} degrees`, async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /^Edit PDF links/ }).click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'links.pdf', mimeType: 'application/pdf', buffer: await fixture(angle) });
  await expect(page.getByRole('status')).toContainText('3 editable links found. 1 unsupported');
  await page.getByLabel('Link 1 URL', { exact: true }).fill('https://example.com/changed?q=1');
  await page.getByLabel('Link 2 destination', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Remove link 3', exact: true }).click();
  await page.getByRole('button', { name: 'Undo link change', exact: true }).click();
  await expect(page.getByLabel('Link 3 URL', { exact: true })).toHaveValue('https://example.com/remove');
  await page.getByRole('button', { name: 'Remove link 3', exact: true }).click();
  await page.getByRole('button', { name: 'Save link changes', exact: true }).click();
  const link = page.getByRole('link', { name: 'Download updated links PDF', exact: true }); await expect(link).toBeVisible();
  const stale = await link.getAttribute('href');
  await page.getByLabel('Link 1 URL', { exact: true }).fill('https://example.com/final'); await expect(link).toHaveCount(0);
  expect(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, stale)).toBe(true);
  await page.getByRole('button', { name: 'Save link changes', exact: true }).click(); await expect(link).toBeVisible();
  const download = page.waitForEvent('download'); await link.click(); const bytes = await readFile((await (await download).path())!);
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }); const doc = await task.promise; const p = await doc.getPage(1); const annots = await p.getAnnotations();
  expect(annots).toHaveLength(4); expect(annots[0].url).toBe('https://example.com/final'); expect(annots[0].rect).toEqual([50, 400, 150, 420]);
  expect(await doc.getPageIndex(annots[1].dest[0])).toBe(2); expect(annots[1].dest[1].name).toBe('Fit'); expect(annots[2].url).toBe('mailto:hello@example.com'); expect(annots[3].contentsObj.str).toBe('Keep note');
  expect(p.rotate).toBe(angle); expect((await p.getTextContent()).items.some(item => 'str' in item && item.str === 'Keep original text')).toBe(true); await task.destroy();
  const current = await link.getAttribute('href'); await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Existing PDF links' })).toHaveCount(0);
  expect(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, current)).toBe(true);
});
test('existing links reject unsafe URLs and invalid pages with keyboard and mobile controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: /^Edit PDF links/ }).click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'links.pdf', mimeType: 'application/pdf', buffer: await fixture() });
  await page.getByLabel('Link 1 URL', { exact: true }).fill('javascript:alert(1)'); await page.getByRole('button', { name: 'Save link changes', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('HTTP');
  await expect(page.getByRole('link', { name: 'Download updated links PDF' })).toHaveCount(0);
  await page.getByLabel('Link 1 URL', { exact: true }).fill('https://example.com/original'); await page.getByLabel('Link 2 destination', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save link changes', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('destination');
  await page.getByRole('button', { name: 'Undo link change', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByLabel('Link 2 destination', { exact: true })).toHaveValue('2');
  await expect(page.getByRole('button', { name: 'Save link changes', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('PDF without links has no enabled save action', async ({ page }) => {
  const pdf = await PDFDocument.create(); pdf.addPage(); await page.goto('/'); await page.getByRole('button', { name: /^Edit PDF links/ }).click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'blank.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByRole('status')).toContainText('0 editable links found'); await expect(page.getByRole('button', { name: 'Save link changes', exact: true })).toBeDisabled();
});
