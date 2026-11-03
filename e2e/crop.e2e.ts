import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('preview and download a selected-page crop, then discard the old result', async ({page}) => {
  const source = await PDFDocument.create();
  source.addPage([400,500]);
  source.addPage([200,300]).drawText('still selectable');
  await page.goto('/');
  await page.getByRole('button',{name:/Crop PDF/}).click();
  await page.locator('input[type=file]').setInputFiles({
    name:'pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await source.save())
  });
  await page.getByLabel('Pages to crop').fill('2');
  await page.getByLabel('top margin (%)',{exact:true}).fill('20');
  await expect(page.getByRole('region',{name:'Crop preview'})).toContainText('page 2');
  await page.getByRole('button',{name:'Process PDF'}).click();
  const link=page.getByRole('link',{name:'Download PDF'});
  const ready=page.waitForEvent('download');
  await link.click();
  const output=await PDFDocument.load(await readFile((await (await ready).path())!));
  expect(output.getPage(0).getCropBox()).toEqual({x:0,y:0,width:400,height:500});
  const crop=output.getPage(1).getCropBox();
  expect(crop.x).toBeCloseTo(10);
  expect(crop.y).toBeCloseTo(15);
  expect(crop.width).toBeCloseTo(180);
  expect(crop.height).toBeCloseTo(225);
  const url=await link.getAttribute('href');
  await page.getByLabel('Pages to crop').fill('3');
  await expect(link).toHaveCount(0);
  expect(await page.evaluate(async href=>{try {await fetch(href!);return true;}catch{return false;}},url)).toBe(false);
  await page.getByRole('button',{name:'Process PDF'}).click();
  await expect(page.getByRole('alert')).toContainText('Invalid page range');
});
