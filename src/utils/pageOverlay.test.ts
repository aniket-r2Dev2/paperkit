import { expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { addPageOverlay, type OverlayOptions } from './pageOverlay';
const options:OverlayOptions={kind:'watermark',text:'DRAFT',range:'',size:20,opacity:0.3,angle:30,start:1,x:50,y:50};
it.each([0,90,180,270])('supports crop origins and rotation %i',async rotation=>{
  const pdf=await PDFDocument.create();const page=pdf.addPage([400,500]);
  page.setCropBox(20,30,300,400);page.setRotation(degrees(rotation));
  await addPageOverlay(pdf,options,()=>{});
  const saved=await PDFDocument.load(await pdf.save());
  expect(saved.getPage(0).getCropBox()).toEqual({x:20,y:30,width:300,height:400});
  expect(saved.getPage(0).getRotation().angle).toBe(rotation);
});
it('rejects labels extending outside the visible page',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage([200,200]);
  await expect(addPageOverlay(pdf,{...options,x:0},()=>{})).rejects.toThrow(/beyond page/);
});
it('rejects unsupported characters without exposing the entered text',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage();
  await expect(addPageOverlay(pdf,{...options,text:'私'},()=>{})).rejects.toThrow('Use Western European characters');
});
