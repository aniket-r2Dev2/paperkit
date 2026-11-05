import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('form values survive editable and flattened downloads and clear removes data', async ({page})=>{
  const pdf=await PDFDocument.create();
  const sheet=pdf.addPage();
  const form=pdf.getForm();
  form.createTextField('Name').addToPage(sheet,{x:20,y:600,width:200,height:30});
  form.createCheckBox('Agreed').addToPage(sheet,{x:20,y:500});
  const radio=form.createRadioGroup('Choice');
  radio.addOptionToPage('First',sheet,{x:20,y:400});
  radio.addOptionToPage('Second',sheet,{x:80,y:400});
  await page.goto('/');
  await page.getByRole('button',{name:/Fill PDF Form/}).click();
  await page.locator('input[type=file]').setInputFiles({name:'form.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByLabel('Name',{exact:true}).fill('Aniket');
  await page.getByLabel('Agreed',{exact:true}).check();
  await page.getByLabel('Choice',{exact:true}).selectOption('Second');
  const link=page.getByRole('link',{name:'Download filled PDF'});
  for(const flattened of [false,true]){
    if(flattened) await page.getByLabel('Flatten all form fields').check();
    await page.getByRole('button',{name:'Save filled PDF'}).click();
    const ready=page.waitForEvent('download');
    await link.click();
    const saved=await PDFDocument.load(await readFile((await (await ready).path())!));
    if(flattened) expect(saved.getForm().getFields()).toHaveLength(0);
    else{
      expect(saved.getForm().getTextField('Name').getText()).toBe('Aniket');
      expect(saved.getForm().getCheckBox('Agreed').isChecked()).toBe(true);
      expect(saved.getForm().getRadioGroup('Choice').getSelected()).toBe('Second');
    }
  }
  const url=await link.getAttribute('href');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await expect(page.getByLabel('Name',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(async href=>{try{await fetch(href!);return true;}catch{return false;}},url)).toBe(false);
});
