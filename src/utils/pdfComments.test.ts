import {describe,it,expect} from 'vitest';
import {PDFDocument,PDFName,PDFDict,PDFArray,PDFHexString,PDFNumber,PDFRawStream,degrees} from 'pdf-lib';
import {editPdf,type EditorItem} from './pdfEditor';
const note:EditorItem={id:1,kind:'comment',text:'Review this\nनमस्ते 👋',author:'Aniket',page:1,x:10,y:10,width:40,height:10};
async function fixture(rotation=0){
  const pdf=await PDFDocument.create();const page=pdf.addPage([400,600]);page.setCropBox(20,30,300,500);page.setRotation(degrees(rotation));page.drawText('Original text');
  page.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Text',Rect:[30,40,52,62],Contents:PDFHexString.fromText('Original comment')})));
  pdf.addPage();return pdf;
}
describe('sticky-note comments',()=>{
  it.each([0,90,180,270])('preserves source annotations and exports editable Unicode notes at %s degrees',async angle=>{
    const original=await PDFDocument.load(await(await fixture(angle)).save());const contentRef=original.getPage(0).node.lookup(PDFName.of('Contents'),PDFArray).get(0);const contents=(original.context.lookup(contentRef) as PDFRawStream).getContents();
    const pdf=await PDFDocument.load(await editPdf(await original.save(),[note]));const page=pdf.getPage(0);const annotations=page.node.Annots()!;
    expect(annotations.size()).toBe(2);expect(annotations.lookup(0,PDFDict).lookup(PDFName.of('Contents'),PDFHexString).decodeText()).toBe('Original comment');
    const added=annotations.lookup(1,PDFDict);expect(added.lookup(PDFName.of('Subtype'),PDFName).toString()).toBe('/Text');
    expect(added.lookup(PDFName.of('Contents'),PDFHexString).decodeText()).toBe(note.text);expect(added.lookup(PDFName.of('T'),PDFHexString).decodeText()).toBe(note.author);
    expect(added.lookup(PDFName.of('F'),PDFNumber).asNumber()).toBe(4);expect(added.has(PDFName.of('A'))).toBe(false);
    expect(page.node.lookup(PDFName.of('Contents'),PDFArray).asArray().map(ref=>ref.toString())).toContain(contentRef.toString());expect((pdf.context.lookup(contentRef) as PDFRawStream).getContents()).toEqual(contents);expect(pdf.getPageCount()).toBe(2);
    const rect=added.lookup(PDFName.of('Rect'),PDFArray).asArray().map(n=>Number(n.toString()));
    const expected:Record<number,number[]>={0:[50,458,72,480],90:[50,80,72,102],180:[268,80,290,102],270:[268,458,290,480]};
    rect.forEach((n,i)=>expect(n).toBeCloseTo(expected[angle][i]));
  });
  it('rejects empty, oversized or control-bearing comments and invalid authors',async()=>{
    const source=await(await fixture()).save();
    for(const text of ['','  \n','a'.repeat(2001),'bad\0text'])await expect(editPdf(source,[{...note,text}])).rejects.toThrow('comment');
    for(const author of ['a'.repeat(101),'two\nlines','bad\0name'])await expect(editPdf(source,[{...note,author}])).rejects.toThrow('Author');
    await expect(editPdf(source,[{...note,author:'',text:'a'.repeat(2000)}])).resolves.toBeInstanceOf(Uint8Array);
  });
  it('rejects icons outside visible bounds and supports mixed overlays',async()=>{
    const source=await(await fixture()).save();await expect(editPdf(source,[{...note,x:99}])).rejects.toThrow('inside');
    await expect(editPdf(source,[{...note,page:3}])).rejects.toThrow('page');
    const out=await PDFDocument.load(await editPdf(source,[note,{id:2,kind:'text',text:'Added text',page:2,x:10,y:10,width:40,height:10}]));expect(out.getPage(0).node.Annots()!.size()).toBe(2);
  });
});
