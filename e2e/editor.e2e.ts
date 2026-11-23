import {test,expect} from '@playwright/test';
import {PDFDocument,degrees,PDFName} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

for(const rotation of [0,90,180,270])test(`exports text and image overlays with preserved pages at rotation ${rotation}`,async({page})=>{
  const pdf=await PDFDocument.create();pdf.setTitle('Editor original');pdf.addPage([400,600]).drawText('Original content');pdf.addPage([400,600]).setRotation(degrees(rotation));
  await page.goto('/');await page.getByRole('button',{name:/^Add text & images/}).click();
  await page.locator('input[type=file]').first().setInputFiles({name:'edit.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Overlay 1 text',{exact:true}).fill('Added content');await page.getByLabel('Overlay 1 page',{exact:true}).fill('2');
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=50;const ctx=c.getContext('2d')!;ctx.fillStyle='blue';ctx.fillRect(0,0,100,50);return c.toDataURL().split(',')[1];}),'base64');
  await page.getByLabel('Add image PNG or JPEG').setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});
  await page.getByLabel('Overlay 2 page',{exact:true}).fill('2');await page.getByLabel('Overlay 2 y',{exact:true}).fill('40');
  await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();
  const link=page.getByRole('link',{name:'Download edited PDF',exact:true});await expect(link).toBeVisible();
  await expect(page.getByRole('region',{name:'PDF page preview'})).toBeVisible();
  const canvas=page.getByRole('region',{name:'PDF page preview'}).locator('canvas').nth(1);
  await expect.poll(async()=>canvas.evaluate(c=>Array.from(c.getContext('2d')!.getImageData(c.width*0.15,c.height*0.65,1,1).data).slice(0,3))).toEqual([0,0,255]);
  const event=page.waitForEvent('download');await link.click();const bytes=await readFile((await(await event).path())!);
  const saved=await PDFDocument.load(bytes);expect(saved.getTitle()).toBe('Editor original');expect(saved.getPageCount()).toBe(2);expect(saved.getPage(1).getRotation().angle).toBe(rotation);expect(saved.getPage(1).node.Resources()?.has(PDFName.of('XObject'))).toBe(true);
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});const doc=await task.promise;
  expect((await(await doc.getPage(1)).getTextContent()).items.some(i=>'str'in i&&i.str==='Original content')).toBe(true);
  expect((await(await doc.getPage(2)).getTextContent()).items.some(i=>'str'in i&&i.str==='Added content')).toBe(true);await task.destroy();
  const url=await link.getAttribute('href');await page.getByLabel('Overlay 1 x',{exact:true}).fill('20');await expect(link).toHaveCount(0);
  expect(await page.evaluate(async u=>{try{await fetch(u!);return false;}catch{return true;}},url)).toBe(true);
  await page.getByRole('button',{name:'Remove overlay 2',exact:true}).click();await expect(page.getByLabel('Overlay 2 page',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.getByLabel('Overlay 2 page',{exact:true})).toHaveValue('2');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await expect(page.getByRole('region',{name:'Text and image editor'})).toHaveCount(0);
});
test('invalid overlays do not produce downloads, mobile controls fit, and switching tools discards edits',async({page})=>{
  await page.setViewportSize({width:390,height:844});const pdf=await PDFDocument.create();pdf.addPage();
  await page.goto('/');await page.getByRole('button',{name:/^Add text & images/}).click();await page.locator('input[type=file]').first().setInputFiles({name:'edit.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Overlay 1 x',{exact:true}).fill('95');await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('inside');await expect(page.getByRole('link',{name:'Download edited PDF',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.getByLabel('Overlay 1 x',{exact:true})).toHaveValue('10');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:/^Rotate pages/}).click();await page.getByRole('button',{name:/^Add text & images/}).click();await expect(page.getByLabel('Overlay 1 text',{exact:true})).toHaveCount(0);
});
