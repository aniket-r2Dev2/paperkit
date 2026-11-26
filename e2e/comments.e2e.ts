import {test,expect} from '@playwright/test';
import {PDFDocument,PDFHexString,degrees} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
for(const angle of [0,90,180,270])test(`comments preserve Unicode, existing notes and placement at ${angle} degrees`,async({page})=>{
  const pdf=await PDFDocument.create();const sheet=pdf.addPage([400,600]);sheet.setCropBox(20,30,300,500);sheet.setRotation(degrees(angle));sheet.drawText('Original selectable text',{x:50,y:200,size:12});
  sheet.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Text',Rect:[30,40,52,62],Contents:PDFHexString.fromText('Existing note')})));
  const source=await pdf.save();const originalTask=pdfjs.getDocument({data:source.slice(),isEvalSupported:false});const originalDoc=await originalTask.promise;expect((await(await originalDoc.getPage(1)).getTextContent()).items.some(item=>'str' in item&&item.str==='Original selectable text')).toBe(true);await originalTask.destroy();
  await page.goto('/');await page.getByRole('button',{name:/^Add text & images/}).click();await page.locator('input[type=file]').first().setInputFiles({name:'notes.pdf',mimeType:'application/pdf',buffer:Buffer.from(source)});
  await page.getByRole('button',{name:'Add comment',exact:true}).click();await page.getByLabel('Overlay 1 comment',{exact:true}).fill('First note');await page.getByLabel('Overlay 1 author',{exact:true}).fill('Aniket');
  await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();const link=page.getByRole('link',{name:'Download edited PDF',exact:true});await expect(link).toBeVisible();const stale=await link.getAttribute('href');
  await page.getByLabel('Overlay 1 comment',{exact:true}).fill('Review this\nनमस्ते 👋');await expect(link).toHaveCount(0);expect(await page.evaluate(async u=>{try{await fetch(u!);return false;}catch{return true;}},stale)).toBe(true);
  await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();await expect(link).toBeVisible();const download=page.waitForEvent('download');await link.click();const bytes=await readFile((await(await download).path())!);
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});const doc=await task.promise;const p=await doc.getPage(1);const notes=await p.getAnnotations();expect(notes).toHaveLength(2);expect(notes[0].contentsObj.str).toBe('Existing note');expect(notes[1].subtype).toBe('Text');expect(notes[1].contentsObj.str).toBe('Review this\nनमस्ते 👋');expect(notes[1].titleObj.str).toBe('Aniket');expect(notes[1].annotationFlags).toBe(4);
  const viewport=p.getViewport({scale:1});const rect=viewport.convertToViewportRectangle(notes[1].rect);expect(Math.min(rect[0],rect[2])/viewport.width).toBeCloseTo(.1);expect(Math.min(rect[1],rect[3])/viewport.height).toBeCloseTo(.1);expect(Math.abs(rect[2]-rect[0])).toBeCloseTo(22);expect(Math.abs(rect[3]-rect[1])).toBeCloseTo(22);
  expect((await p.getTextContent()).items.some(item=>'str' in item&&item.str==='Original selectable text')).toBe(true);await task.destroy();
  await page.getByRole('button',{name:'Remove overlay 1',exact:true}).click();await expect(link).toHaveCount(0);await expect(page.getByRole('button',{name:'Preview edited PDF',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.getByLabel('Overlay 1 comment',{exact:true})).toHaveValue('Review this\nनमस्ते 👋');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await expect(page.getByRole('region',{name:'Text and image editor'})).toHaveCount(0);
});
test('comments validate content and boundaries with keyboard-accessible mobile controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});const pdf=await PDFDocument.create();pdf.addPage();await page.goto('/');await page.getByRole('button',{name:/^Add text & images/}).click();await page.locator('input[type=file]').first().setInputFiles({name:'notes.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  const add=page.getByRole('button',{name:'Add comment',exact:true});await expect(add).toBeEnabled();await add.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('comment');await expect(page.getByRole('link',{name:'Download edited PDF',exact:true})).toHaveCount(0);
  await page.getByLabel('Overlay 1 comment',{exact:true}).fill('Check this paragraph');await page.getByLabel('Overlay 1 x',{exact:true}).fill('99');await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('inside');
  await page.getByLabel('Overlay 1 x',{exact:true}).fill('10');await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();await expect(page.getByRole('link',{name:'Download edited PDF',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
