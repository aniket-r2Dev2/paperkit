import {describe,it,expect} from 'vitest';
import {PDFDocument,PDFName,PDFDict,PDFArray,PDFString,degrees} from 'pdf-lib';
import {editPdf,validateLinkUrl,placement,linkRectangle,type EditorItem} from './pdfEditor';
const web:EditorItem={id:1,kind:'web-link',url:'https://example.com/help?a=1#details',page:1,x:10,y:10,width:40,height:10};
const internal:EditorItem={id:2,kind:'page-link',destination:2,page:1,x:10,y:30,width:40,height:10};
async function fixture(angle=0){const pdf=await PDFDocument.create();const p=pdf.addPage([400,600]);p.setCropBox(20,30,300,500);p.setRotation(degrees(angle));pdf.addPage();p.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[20,30,50,50],A:{S:'URI',URI:PDFString.of('https://existing.example/')}})));return pdf;}
describe('PDF link annotations',()=>{
  it.each([0,90,180,270])('exports URI and page targets while retaining original annotations at rotation %s',async angle=>{
    const original=await fixture(angle);const saved=await PDFDocument.load(await editPdf(await original.save(),[web,internal]));
    const annotations=saved.getPage(0).node.Annots()!;expect(annotations.size()).toBe(3);
    const old=annotations.lookup(0,PDFDict).lookup(PDFName.of('A'),PDFDict);expect(old.lookup(PDFName.of('URI'),PDFString).decodeText()).toBe('https://existing.example/');
    const added=annotations.lookup(1,PDFDict);expect(added.lookup(PDFName.of('A'),PDFDict).lookup(PDFName.of('URI'),PDFString).decodeText()).toBe(web.url);
    const rect=added.lookup(PDFName.of('Rect'),PDFArray).asArray().map(n=>Number(n.toString()));
    const expected=linkRectangle(placement(original.getPage(0),web));rect.forEach((n,i)=>expect(n).toBeCloseTo(expected[i]));
    const dest=annotations.lookup(2,PDFDict).lookup(PDFName.of('Dest'),PDFArray);expect(dest.get(0).toString()).toBe(saved.getPage(1).ref.toString());expect(dest.get(1).toString()).toBe('/Fit');
  });
  it('rejects unsafe, malformed, credential-bearing and oversized URLs',()=>{
    for(const url of ['', 'javascript:alert(1)','data:text/html,hi','file:///tmp/a','ftp://example.com','//example.com','https://user:pass@example.com','https://example.com/\nsecret','https://example.com/a b','https://example.com/'+ 'a'.repeat(2048)])expect(()=>validateLinkUrl(url)).toThrow();
    expect(validateLinkUrl('https://example.com/é')).toBe('https://example.com/%C3%A9');expect(validateLinkUrl('http://example.com')).toBe('http://example.com/');
  });
  it('rejects invalid internal pages and areas before producing output',async()=>{
    const bytes=await(await fixture()).save();for(const destination of [0,3,1.5,NaN])await expect(editPdf(bytes,[{...internal,destination}])).rejects.toThrow('destination');
    await expect(editPdf(bytes,[{...web,x:99}])).rejects.toThrow('inside');
    await expect(editPdf(bytes,[{...web,url:'javascript:alert(1)'}])).rejects.toThrow('HTTP');
  });
});
