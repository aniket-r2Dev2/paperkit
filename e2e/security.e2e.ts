import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const secret = 'café-passphrase-2026';
async function fixture() {
  const pdf=await PDFDocument.create(); pdf.setTitle('Security fixture');
  pdf.addPage([300,400]).drawText('Still searchable'); pdf.addPage([500,600]).setRotation(degrees(90));
  return {name:'security.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())};
}
async function download(page: Page, name: string) {
  const link=page.getByRole('link',{name,exact:true}); await expect(link).toBeVisible({timeout:20000});
  const event=page.waitForEvent('download'); await link.click(); return readFile((await (await event).path())!);
}
async function protect(page: Page) {
  await page.goto('/'); await page.getByRole('button',{name:/^Protect PDF Add/}).click();
  await page.locator('input[type=file]').setInputFiles(await fixture());
  await page.getByLabel('New password',{exact:true}).fill(secret);
  await page.getByLabel('Confirm password',{exact:true}).fill(secret);
  await page.getByRole('button',{name:'Protect PDF',exact:true}).click();
  return download(page,'Download protected PDF');
}

test('protects in browser, verifies password with independent reader, unlocks without losing document content',async({page})=>{
  const diagnostics:string[]=[];page.on('console',msg=>diagnostics.push(msg.text()));page.on('pageerror',err=>diagnostics.push(err.message));
  const network:string[]=[];page.on('request',r=>{if(r.method()!=='GET')network.push(r.url());expect(r.url()).not.toContain(encodeURIComponent(secret));});
  const encrypted=await protect(page);
  await expect(page.getByLabel('New password',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Confirm password',{exact:true})).toHaveValue('');
  const noPassword=pdfjs.getDocument({data:new Uint8Array(encrypted),isEvalSupported:false});
  await expect(noPassword.promise).rejects.toMatchObject({name:'PasswordException'});await noPassword.destroy();
  const wrong=pdfjs.getDocument({data:new Uint8Array(encrypted),password:'wrong',isEvalSupported:false});
  await expect(wrong.promise).rejects.toMatchObject({name:'PasswordException'});await wrong.destroy();
  const correct=pdfjs.getDocument({data:new Uint8Array(encrypted),password:secret,isEvalSupported:false});
  const verified=await correct.promise;expect(verified.numPages).toBe(2);
  expect((await (await verified.getPage(1)).getTextContent()).items.some(item=>'str' in item&&item.str==='Still searchable')).toBe(true);await correct.destroy();
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.getByRole('button',{name:/^Unlock PDF Remove/}).click();
  await page.locator('input[type=file]').setInputFiles({name:'protected.pdf',mimeType:'application/pdf',buffer:encrypted});
  await page.getByLabel('PDF password',{exact:true}).fill('wrong-password');
  await page.getByRole('button',{name:'Unlock PDF',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Check the password');
  await expect(page.getByRole('link',{name:'Download unlocked PDF',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('PDF password',{exact:true})).toHaveValue('');
  await page.getByLabel('PDF password',{exact:true}).fill(secret);
  await page.getByRole('button',{name:'Unlock PDF',exact:true}).click();
  const result=await PDFDocument.load(await download(page,'Download unlocked PDF'));
  expect(result.getTitle()).toBe('Security fixture');
  expect(result.getPages().map(p=>[p.getWidth(),p.getHeight(),p.getRotation().angle])).toEqual([[300,400,0],[500,600,90]]);
  expect(network).toEqual([]);expect(diagnostics.join(' ')).not.toContain(secret);
  expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
  const url=await page.getByRole('link',{name:'Download unlocked PDF',exact:true}).getAttribute('href');
  await page.getByLabel('PDF password',{exact:true}).fill('changed');
  await expect(page.getByRole('link',{name:'Download unlocked PDF',exact:true})).toHaveCount(0);
  expect(await page.evaluate(async url=>{try{await fetch(url!);return false;}catch{return true;}},url)).toBe(true);
});

test('validates missing and mismatched passwords, rejects corrupt PDF, and clears on tool switch',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/^Protect PDF Add/}).click();
  await page.locator('input[type=file]').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-broken')});
  await page.getByRole('button',{name:'Protect PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Enter a password');
  await page.getByLabel('New password',{exact:true}).fill(secret);await page.getByLabel('Confirm password',{exact:true}).fill('different');
  await page.getByRole('button',{name:'Protect PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('do not match');
  await page.getByLabel('Confirm password',{exact:true}).fill(secret);await page.getByRole('button',{name:'Protect PDF',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Could not process');
  await expect(page.getByLabel('New password',{exact:true})).toHaveValue('');
  await page.getByLabel('New password',{exact:true}).fill(secret);await page.getByRole('button',{name:/^Unlock PDF Remove/}).click();
  await expect(page.getByLabel('PDF password',{exact:true})).toHaveValue('');
});

test('cancels a worker while loading and clears passwords and downloads on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/*.wasm',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue().catch(()=>{});});
  await page.goto('/');await page.getByRole('button',{name:/^Protect PDF Add/}).click();await page.locator('input[type=file]').setInputFiles(await fixture());
  await page.getByLabel('New password',{exact:true}).fill(secret);await page.getByLabel('Confirm password',{exact:true}).fill(secret);
  await page.getByRole('button',{name:'Protect PDF',exact:true}).click();await page.getByRole('button',{name:'Cancel processing',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');await expect(page.getByLabel('New password',{exact:true})).toHaveValue('');
  await expect(page.getByRole('link',{name:'Download protected PDF',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await expect(page.getByRole('region',{name:'PDF password security'})).toHaveCount(0);
});
