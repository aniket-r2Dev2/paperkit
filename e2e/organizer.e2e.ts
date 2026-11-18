import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function fixture(count = 14) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i++) { const page = pdf.addPage([300 + i, 400]); if (i === 12) page.setRotation(degrees(90)); }
  return {name:'pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())};
}
async function output(page: Page) {
  await page.getByRole('button', {name:/^Process PDF/}).click();
  const link = page.getByRole('link', {name:'Download PDF',exact:true});
  await expect(link).toBeVisible();
  const download = page.waitForEvent('download'); await link.click();
  return PDFDocument.load(await readFile((await (await download).path())!));
}

test('browses every page with bounded canvases and rotates selected pages only', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:/^Rotate pages/}).click();
  await page.locator('input[type=file]').setInputFiles(await fixture());
  const preview=page.getByRole('region',{name:'PDF page preview'});
  await expect(preview.getByRole('button',{name:/^View page/})).toHaveCount(12);
  await page.getByLabel('Select page 2',{exact:true}).check();
  await page.getByRole('button',{name:'Next thumbnails',exact:true}).click();
  await expect(page.getByRole('button',{name:'View page 14',exact:true})).toBeVisible();
  await page.getByLabel('Select page 13',{exact:true}).check();
  await expect(page.getByLabel('Rotation page range',{exact:true})).toHaveValue('2, 13');
  await page.getByLabel('Go to page',{exact:true}).fill('13');
  await page.getByRole('button',{name:'Go to page',exact:true}).click();
  await page.getByRole('button',{name:'Show large preview',exact:true}).click();
  await expect(preview).toContainText('Current page: 13 of 14');
  await expect(preview.locator('canvas')).toHaveCount(3);
  const result=await output(page);
  expect(result.getPages().map(p=>p.getRotation().angle)).toEqual(Array.from({length:14},(_,i)=>i===1?90:i===12?180:0));
  await page.getByRole('button',{name:'Clear page selection',exact:true}).click();
  await expect(page.getByRole('link',{name:'Download PDF',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/^Process PDF/}).click();
  await expect(page.getByRole('alert')).toContainText('Enter page numbers');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await expect(preview).toHaveCount(0);
});

test('thumbnail selections extract/delete the correct pages and reject deleting all pages',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/^Extract pages/}).click();
  await page.locator('input[type=file]').setInputFiles(await fixture());
  await page.getByLabel('Go to page',{exact:true}).fill('14');
  await page.getByRole('button',{name:'Go to page',exact:true}).click();
  await page.getByLabel('Select page 14',{exact:true}).check();
  expect((await output(page)).getPages().map(p=>p.getWidth())).toEqual([313]);
  await page.getByRole('button',{name:/^Delete pages/}).click();
  expect((await output(page)).getPageCount()).toBe(13);
  await page.getByRole('button',{name:'Select all pages',exact:true}).click();
  await page.getByRole('button',{name:/^Process PDF/}).click();
  await expect(page.getByRole('alert')).toContainText('Keep at least one page');
});

test('keyboard reordering crosses batch boundaries and the download follows visible order',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/^Reorder pages/}).click();
  await page.locator('input[type=file]').setInputFiles(await fixture());
  await page.getByRole('button',{name:'Next thumbnails',exact:true}).click();
  const move=page.getByRole('button',{name:'Move page 13 earlier',exact:true});
  await move.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('region',{name:'Reorder PDF pages'})).toContainText('Position 12 · Page 13');
  const result=await output(page);
  const expected=Array.from({length:14},(_,i)=>300+i); [expected[11],expected[12]]=[expected[12],expected[11]];
  expect(result.getPages().map(p=>p.getWidth())).toEqual(expected);
});

test('invalid and oversized documents fail preview without rendering pages',async({page})=>{
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-broken')});
  await expect(page.getByRole('region',{name:'PDF page preview'})).toContainText('Preview unavailable');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles(await fixture(501));
  await expect(page.getByRole('region',{name:'PDF page preview'})).toContainText('Preview unavailable');
  await expect(page.getByRole('button',{name:/^View page/})).toHaveCount(0);
});

test('mobile preview bounds canvas size, clears state and retains default all-page rotation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:/^Rotate pages/}).click();
  await page.locator('input[type=file]').setInputFiles(await fixture(2));
  await expect(page.getByRole('button',{name:'View page 2',exact:true})).toBeVisible();
  expect((await output(page)).getPages().map(p=>p.getRotation().angle)).toEqual([90,90]);
  const oldUrl=await page.getByRole('link',{name:'Download PDF',exact:true}).getAttribute('href');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  expect(await page.evaluate(async href=>{try{await fetch(href!);return true;}catch{return false;}},oldUrl)).toBe(false);
  const wide=await PDFDocument.create();wide.addPage([100000,1000]);
  await page.locator('input[type=file]').setInputFiles({name:'wide.pdf',mimeType:'application/pdf',buffer:Buffer.from(await wide.save())});
  const canvas=page.getByRole('region',{name:'PDF page preview'}).locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>c.width)).toBe(180);
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.width*c.height)).toBeLessThanOrEqual(180*180);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  expect(errors).toEqual([]);
});
