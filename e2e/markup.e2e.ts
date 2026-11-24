import {test,expect} from '@playwright/test';
import {PDFDocument,degrees} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
for(const angle of [0,90,180,270])test(`markup pixels and text survive cropped-page rotation ${angle}`,async({page})=>{
  const pdf=await PDFDocument.create();const sheet=pdf.addPage([400,600]);sheet.setCropBox(20,30,300,500);sheet.setRotation(degrees(angle));sheet.drawText('Selectable original',{x:35,y:40,size:10});
  await page.goto('/');await page.getByRole('button',{name:/^Add text & images/}).click();await page.locator('input[type=file]').first().setInputFiles({name:'markup.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  for(const [i,kind] of ['rectangle','ellipse','highlight','strike-through'].entries()){
    await page.getByRole('button',{name:`Add ${kind}`,exact:true}).click();
    for(const [key,value] of Object.entries({x:i%2?50:10,y:i<2?10:50,width:30,height:20}))await page.getByLabel(`Overlay ${i+1} ${key}`,{exact:true}).fill(String(value));
    if(kind!=='highlight'){await page.getByLabel(`Overlay ${i+1} color`,{exact:true}).fill('#ff0000');await page.getByLabel(`Overlay ${i+1} thickness`,{exact:true}).fill('12');}
  }
  await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();const link=page.getByRole('link',{name:'Download edited PDF',exact:true});await expect(link).toBeVisible();
  const canvas=page.getByRole('region',{name:'PDF page preview'}).locator('canvas').first();
  async function pixel(x:number,y:number){return canvas.evaluate((c,point)=>Array.from(c.getContext('2d')!.getImageData(c.width*point[0],c.height*point[1],1,1).data).slice(0,3),[x,y]);}
  for(const [x,y] of [[0.11,0.2],[0.65,0.11],[0.65,0.6]])await expect.poll(async()=>{const [r,g,b]=await pixel(x,y);return r>220&&g<50&&b<50;}).toBe(true);
  await expect.poll(async()=>{const [r,g,b]=await pixel(0.25,0.6);return r>240&&g>240&&b>140&&b<200;}).toBe(true);
  const download=page.waitForEvent('download');await link.click();const bytes=await readFile((await(await download).path())!);
  const reader=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});const doc=await reader.promise;expect((await(await doc.getPage(1)).getTextContent()).items.some(item=>'str'in item&&item.str==='Selectable original')).toBe(true);await reader.destroy();
  const url=await link.getAttribute('href');await page.getByLabel('Overlay 3 opacity',{exact:true}).fill('0.5');await expect(link).toHaveCount(0);expect(await page.evaluate(async u=>{try{await fetch(u!);return false;}catch{return true;}},url)).toBe(true);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.getByLabel('Overlay 3 opacity',{exact:true})).toHaveValue('0.35');
  await page.getByRole('button',{name:'Remove overlay 4',exact:true}).click();await expect(page.getByLabel('Overlay 4 thickness',{exact:true})).toHaveCount(0);
});
test('markup styles validate and clear on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});const pdf=await PDFDocument.create();pdf.addPage();await page.goto('/');await page.getByRole('button',{name:/^Add text & images/}).click();await page.locator('input[type=file]').first().setInputFiles({name:'markup.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByRole('button',{name:'Add rectangle',exact:true}).click();await page.getByLabel('Overlay 1 opacity',{exact:true}).fill('2');await page.getByRole('button',{name:'Preview edited PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('opacity');await expect(page.getByRole('link',{name:'Download edited PDF',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Clear all',exact:true}).click();await expect(page.getByRole('region',{name:'Text and image editor'})).toHaveCount(0);
});
