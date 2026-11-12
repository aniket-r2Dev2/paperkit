import { expect, test } from '@playwright/test';
import { PDFDocument, PDFName } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('loads metadata and verifies Unicode edits, clearing and download cleanup',async({page})=>{
  const pdf=await PDFDocument.create();pdf.addPage([300,400]);
  pdf.setTitle('Original');pdf.setAuthor('Old author');pdf.setKeywords(['old']);
  await page.goto('/');
  await page.getByRole('button',{name:/Edit PDF properties/}).click();
  await page.locator('input[type=file]').setInputFiles({name:'input.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Original');
  await page.getByLabel('Title',{exact:true}).fill('नमस्ते — résumé');
  await page.getByLabel('Author',{exact:true}).fill('');
  await page.getByLabel('Subject',{exact:true}).fill('Project notes');
  await page.getByLabel('Keywords',{exact:true}).fill('alpha, beta');
  await page.getByRole('button',{name:'Save properties'}).click();
  await expect(page.getByRole('definition').filter({hasText:'नमस्ते'})).toBeVisible();
  const link=page.getByRole('link',{name:'Download updated PDF'});
  const pending=page.waitForEvent('download');await link.click();
  const result=await PDFDocument.load(await readFile((await (await pending).path())!),{updateMetadata:false});
  expect(result.getTitle()).toBe('नमस्ते — résumé');
  expect(result.getAuthor()).toBe('');
  expect(result.getSubject()).toBe('Project notes');
  expect(result.getKeywords()).toBe('alpha, beta');
  expect(result.getPage(0).getSize()).toEqual({width:300,height:400});
  const url=await link.getAttribute('href');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await expect(page.getByLabel('Title',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(async href=>{try{await fetch(href!);return true;}catch{return false;}},url)).toBe(false);
});

test('XMP metadata is retained with editing disabled',async({page})=>{
  const pdf=await PDFDocument.create();pdf.addPage();pdf.setTitle('Info title');
  const stream=pdf.context.flateStream('<metadata/>',{Type:'Metadata',Subtype:'XML'});
  pdf.catalog.set(PDFName.of('Metadata'),pdf.context.register(stream));
  await page.goto('/');
  await page.getByRole('button',{name:/Edit PDF properties/}).click();
  await page.locator('input[type=file]').setInputFiles({name:'xmp.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.getByRole('region',{name:'PDF properties'})).toContainText('XMP');
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Info title');
  await expect(page.getByRole('button',{name:'Save properties'})).toBeDisabled();
});
