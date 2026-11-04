import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { resizePages } from './resizePages';
import { paperSizes } from './resizeOptions';

describe('resizePages',()=>{
  it.each([0,90,180,270])('fits a rotated page to Letter at %i degrees',async angle=>{
    const pdf=await PDFDocument.create();
    const page=pdf.addPage([240,300]);
    page.setRotation(degrees(angle));
    resizePages(pdf,...paperSizes.Letter,'',()=>{});
    const saved=(await PDFDocument.load(await pdf.save())).getPage(0);
    expect(saved.getRotation().angle).toBe(angle);
    expect(saved.getWidth()).toBeCloseTo(angle%180?792:612);
    expect(saved.getHeight()).toBeCloseTo(angle%180?612:792);
  });
  it('accepts an unselected form but rejects resizing its page',async ()=>{
    const pdf=await PDFDocument.create();
    pdf.addPage();
    const field=pdf.getForm().createTextField('sample');
    field.addToPage(pdf.addPage());
    resizePages(pdf,...paperSizes.A3,'1',()=>{});
    expect(()=>resizePages(pdf,...paperSizes.A4,'2',()=>{})).toThrow(/Page 2 contains/);
  });
});
