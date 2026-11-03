import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { cropPages } from './cropPages';

describe('cropPages', () => {
  it.each([[0,10,70,100,180],[90,50,10,120,150],[180,110,70,100,180],[270,50,160,120,150]])(
    'maps visible margins at %i degrees', async (angle,x,y,width,height) => {
      const doc = await PDFDocument.create();
      doc.addPage([500,500]);
      const page = doc.addPage([500,500]);
      page.setCropBox(10,10,200,300);
      page.setRotation(degrees(angle));
      cropPages(doc,{top:20,right:50,bottom:20,left:0},'2',()=>{});
      const box = page.getCropBox();
      // Different margins mark each axis after rotation.
      expect(box.x).toBeCloseTo(x);
      expect(box.y).toBeCloseTo(y);
      expect(box.width).toBeCloseTo(width);
      expect(box.height).toBeCloseTo(height);
      expect(doc.getPage(0).getCropBox().width).toBe(500);
    });
  it('rejects empty crop areas', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(()=>cropPages(doc,{top:60,bottom:40,left:0,right:0},'',()=>{})).toThrow(/visible/);
  });
});
