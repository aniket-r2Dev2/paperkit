import {describe,it,expect} from 'vitest';
import {PDFDocument,degrees} from 'pdf-lib';
import {editPdf,type EditorItem,type MarkupKind} from './pdfEditor';
const kinds:MarkupKind[]=['rectangle','ellipse','highlight','strike'];
const base={id:1,page:1,x:10,y:10,width:40,height:20,color:'#ff0000',opacity:0.5,thickness:2};
async function fixture(rotation=0){const pdf=await PDFDocument.create();pdf.setTitle('Markup original');const page=pdf.addPage([400,600]);page.setCropBox(20,30,300,500);page.setRotation(degrees(rotation));page.drawText('Keep this text');return pdf;}
describe('PDF markup export',()=>{
  it.each([0,90,180,270])('exports all markups and preserves geometry at %s degrees',async rotation=>{
    const pdf=await fixture(rotation);const bytes=await editPdf(await pdf.save(),kinds.map((kind,i)=>({...base,id:i,kind})));
    const saved=await PDFDocument.load(bytes);expect(saved.getTitle()).toBe('Markup original');expect(saved.getPage(0).getRotation().angle).toBe(rotation);expect(saved.getPage(0).getCropBox()).toEqual(pdf.getPage(0).getCropBox());expect(saved.getPageCount()).toBe(1);
  });
  it('rejects malformed style values and strokes too thick for their box',async()=>{
    const bytes=await(await fixture()).save();
    for(const values of [{color:'red'},{color:'#ff0000extra'},{opacity:NaN},{opacity:0},{opacity:1.1},{thickness:0},{thickness:13},{thickness:Infinity},{width:0.1,thickness:2}]){
      await expect(editPdf(bytes,[{...base,kind:'rectangle',...values} as EditorItem])).rejects.toThrow();
    }
  });
  it('keeps strokes within a box positioned against the crop edge',async()=>{
    const bytes=await(await fixture()).save();await expect(editPdf(bytes,[{...base,kind:'rectangle',x:0,y:0,width:100,height:100,thickness:12}])).resolves.toBeInstanceOf(Uint8Array);
  });
});
