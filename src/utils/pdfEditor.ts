import { PDFDocument, StandardFonts, degrees, type PDFPage } from 'pdf-lib';
import { validatePageCount, validateOutputSize } from './resourceLimits';
export type EditorItem = { id: number; page: number; x: number; y: number; width: number; height: number } & (
  { kind: 'text'; text: string } | { kind: 'image'; bytes: Uint8Array; format: 'png' | 'jpg' }
);
export function placement(page: PDFPage, item: EditorItem) {
  const {x,y,width,height}=item;
  if (![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>100||y+height>100) throw new Error('Keep each overlay inside the page, with a positive width and height.');
  const crop=page.getCropBox(),media=page.getMediaBox();
  const left=Math.max(crop.x,media.x),bottom=Math.max(crop.y,media.y);
  const w=Math.min(crop.x+crop.width,media.x+media.width)-left;
  const h=Math.min(crop.y+crop.height,media.y+media.height)-bottom;
  const angle=((page.getRotation().angle%360)+360)%360;
  if(!(w>0&&h>0)||![0,90,180,270].includes(angle))throw new Error('Unsupported page geometry.');
  const u=x/100,v=(y+height)/100;
  const origins:Record<number,number[]>={0:[u,1-v],90:[v,u],180:[1-u,v],270:[1-v,1-u]};
  const [px,py]=origins[angle];
  return {x:left+w*px,y:bottom+h*py,width:(angle%180?h:w)*width/100,height:(angle%180?w:h)*height/100,rotate:degrees(angle)};
}
export async function editPdf(source: Uint8Array, items: EditorItem[], active:()=>void=()=>{}) {
  if(!items.length||items.length>50)throw new Error('Add between 1 and 50 overlays.');
  const pdf=await PDFDocument.load(source,{updateMetadata:false});active();
  const count=pdf.getPageCount();const limit=validatePageCount(count);if(limit)throw new Error(limit);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const item of items){
    active();
    if(!Number.isInteger(item.page)||item.page<1||item.page>count)throw new Error(`Choose a page from 1 to ${count}.`);
    const page=pdf.getPage(item.page-1),box=placement(page,item);
    if(item.kind==='text'){
      if(!item.text.trim()||item.text.length>200||/[\r\n]/.test(item.text))throw new Error('Text must be one non-empty line of up to 200 characters.');
      try{font.encodeText(item.text);}catch{throw new Error('Use Western European characters supported by Helvetica.');}
      // Fit both font ascent and descenders inside the same visual box used for images.
      const unitWidth=font.widthOfTextAtSize(item.text,1);
      const unitHeight=font.heightAtSize(1,{descender:true});
      const size=Math.min(box.width/unitWidth,box.height/unitHeight,144);
      if(!Number.isFinite(size)||size<6)throw new Error('Text is too small. Enlarge its box or shorten the text.');
      const descent=font.heightAtSize(size,{descender:true})-font.heightAtSize(size,{descender:false});
      const radians=box.rotate.angle*Math.PI/180;
      page.drawText(item.text,{x:box.x-descent*Math.sin(radians),y:box.y+descent*Math.cos(radians),font,size,rotate:box.rotate});
    }else{
      if(!item.bytes.length||item.bytes.length>2*1024*1024)throw new Error('Each image must be 2 MB or smaller.');
      const image=item.format==='png'?await pdf.embedPng(item.bytes):await pdf.embedJpg(item.bytes);active();
      if(image.width*image.height>4_000_000)throw new Error('Each image must be 4 megapixels or smaller.');
      // Contain without stretching; anchor at the lower-left of the chosen box.
      const scale=Math.min(box.width/image.width,box.height/image.height);
      page.drawImage(image,{...box,width:image.width*scale,height:image.height*scale});
    }
  }
  const bytes=await pdf.save();active();
  const sizeError=validateOutputSize(bytes.byteLength);if(sizeError)throw new Error(sizeError);
  const verified=await PDFDocument.load(bytes,{updateMetadata:false});active();
  if(verified.getPageCount()!==count)throw new Error('Output verification failed.');
  return bytes;
}
