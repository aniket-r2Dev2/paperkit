import { describe,it,expect } from 'vitest';
import { PDFDocument,degrees,PDFName } from 'pdf-lib';
import { editPdf,placement,type EditorItem } from './pdfEditor';
const item:EditorItem={id:1,kind:'text',text:'Added text',page:1,x:10,y:20,width:30,height:10};
async function fixture(rotation=0){const p=await PDFDocument.create();p.setTitle('Original title');const page=p.addPage([400,600]);page.setCropBox(20,30,300,500);page.setRotation(degrees(rotation));page.drawText('Original text');p.addPage([200,300]);return p;}
describe('PDF overlay editor',()=>{
  it.each([0,90,180,270])('positions within the visible crop box at rotation %s',async rotation=>{
    const p=await fixture(rotation);const box=placement(p.getPage(0),item);
    const expected:Record<number,number[]>={0:[50,380,90,50],90:[110,80,150,30],180:[290,180,90,50],270:[230,480,150,30]};
    expect([box.x,box.y,box.width,box.height]).toEqual(expected[rotation]);expect(box.rotate.angle).toBe(rotation);
    const bytes=await editPdf(await p.save(),[item]);const out=await PDFDocument.load(bytes);
    expect(out.getTitle()).toBe('Original title');expect(out.getPageCount()).toBe(2);expect(out.getPage(0).getCropBox()).toEqual(p.getPage(0).getCropBox());expect(out.getPage(0).getRotation().angle).toBe(rotation);
  });
  it('embeds image overlays and preserves the original page structure',async()=>{
    const source=await fixture();const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7X8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    const bytes=await editPdf(await source.save(),[{...item,kind:'image',bytes:png,format:'png'}]);const out=await PDFDocument.load(bytes);
    expect(out.getPage(0).node.Resources()?.has(PDFName.of('XObject'))).toBe(true);expect(out.getPage(1).getWidth()).toBe(200);
  });
  it('rejects invalid pages, out-of-bounds placement, unsupported text and empty edits',async()=>{
    const bytes=await(await fixture()).save();
    for(const invalid of [{...item,page:3},{...item,page:1.5},{...item,x:90},{...item,width:0},{...item,y:NaN},{...item,text:''},{...item,text:'漢字'},{...item,text:'two\nlines'},{...item,text:'a'.repeat(201)}])await expect(editPdf(bytes,[invalid])).rejects.toThrow();
    await expect(editPdf(bytes,[])).rejects.toThrow();await expect(editPdf(bytes,Array(51).fill(item))).rejects.toThrow();
  });
  it('stops exporting cancelled work',async()=>{const bytes=await(await fixture()).save();await expect(editPdf(bytes,[item],()=>{throw new Error('Cancelled');})).rejects.toThrow('Cancelled');});
});
