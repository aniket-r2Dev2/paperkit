import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGOUq/jAgA0wYRWlkwQA5MABkrnK06oAAAAASUVORK5CYII=';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAYDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCvRRRXy5+pH//Z';

async function makePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([220, 330]);
  return Buffer.from(await document.save());
}

async function expectMergedPageSizes(page: import('@playwright/test').Page, expected: number[][]): Promise<void> {
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('status')).toContainText('ready to download', { timeout: 20_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download PDF/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('paperkit-merged.pdf');
  const path = await download.path();
  expect(path).not.toBeNull();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual(expected);
}

test('merges PDFs, PNG and JPEG into one PDF in the chosen order', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await makePdf() },
    { name: 'marker.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_BASE64, 'base64') },
  ]);
  await expect(page.getByText('3 files added')).toBeVisible();
  await expect(page.getByText(/Files merge from top to bottom/)).toBeVisible();
  await page.getByRole('button', { name: 'Move file 2 up: marker.png' }).click();
  await page.getByRole('button', { name: 'Move file 3 up: photo.jpg' }).click();
  await expectMergedPageSizes(page, [[8, 6], [6, 4], [220, 330]]);
});

test('removing an image excludes it from the merged result', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await makePdf() },
    { name: 'marker.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_BASE64, 'base64') },
  ]);
  await page.getByRole('button', { name: 'Remove photo.jpg' }).click();
  await expect(page.getByText('2 files added')).toBeVisible();
  await expectMergedPageSizes(page, [[220, 330], [8, 6]]);
});

test('merge accepts image-only input and preserves image order', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_BASE64, 'base64') },
    { name: 'marker.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
  ]);
  await expectMergedPageSizes(page, [[6, 4], [8, 6]]);
});

test('rejects malformed image contents without publishing output', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await makePdf() },
    { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
  ]);
  await page.getByRole('button', { name: /Process PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('content does not match', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Download PDF/ })).toHaveCount(0);
});

test('does not silently ignore unsupported files in an upload batch', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await makePdf() },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  await expect(page.getByRole('alert')).toContainText('Only non-empty PDF, PNG, and JPG/JPEG files');
  await expect(page.getByText('2 files added')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Process PDF/ })).toBeDisabled();
});
