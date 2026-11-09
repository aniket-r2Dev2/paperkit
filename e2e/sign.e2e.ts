import { expect, test } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

for(const angle of [0,90,180,270]){
  test('signature export matches preview at rotation '+angle, async({page})=>{
    const pdf=await PDFDocument.create();
    const sheet=pdf.addPage([300,400]);
    sheet.setCropBox(20,30,240,320);
    sheet.setRotation(degrees(angle));
    await page.goto('/');
    await page.getByRole('button',{name:/^Sign PDF/}).click();
    await page.locator('input[type=file]').first().setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
    await page.getByLabel('Type signature').fill('Aniket');
    await expect(page.getByAltText('Signature placement')).toBeVisible();
    const png=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=600;c.height=160;
      const ctx=c.getContext('2d')!;ctx.fillStyle='blue';ctx.fillRect(0,0,600,160);
      return c.toDataURL().split(',')[1];
    });
    await page.getByLabel('Upload signature PNG or JPEG').setInputFiles({name:'signature.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByRole('button',{name:'Apply signature'}).click();
    const link=page.getByRole('link',{name:'Download signed PDF'});
    const pending=page.waitForEvent('download');
    await link.click();
    const bytes=await readFile((await (await pending).path())!);
    expect((await PDFDocument.load(bytes)).getPage(0).getRotation().angle).toBe(angle);
    const url=await link.getAttribute('href');
    await page.getByRole('button',{name:'Clear all',exact:true}).click();
    await expect(page.getByAltText('Signature placement')).toHaveCount(0);
    expect(await page.evaluate(async href=>{try{await fetch(href!);return true;}catch{return false;}},url)).toBe(false);
    await page.locator('input[type=file]').first().setInputFiles({name:'signed.pdf',mimeType:'application/pdf',buffer:bytes});
    await expect(page.getByRole('region',{name:'Sign PDF'}).locator('.crop-sheet')).toBeVisible();
    const pixel=await page.getByRole('region',{name:'Sign PDF'}).locator('.crop-sheet canvas').evaluate(c=>{
      return Array.from(c.getContext('2d')!.getImageData(c.width*0.25,c.height*0.75,1,1).data).slice(0,3);
    });
    expect(pixel).toEqual([0,0,255]);
  });
}
