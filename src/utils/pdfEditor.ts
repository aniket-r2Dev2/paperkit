import { PDFDocument, StandardFonts, degrees, rgb, BlendMode, PDFString, PDFName, type PDFPage } from 'pdf-lib';
import { validatePageCount, validateOutputSize } from './resourceLimits';
export type MarkupKind = 'rectangle' | 'ellipse' | 'highlight' | 'strike';
export type MarkupStyle = { kind: MarkupKind; color: string; opacity: number; thickness: number };
export type EditorItem = { id: number; page: number; x: number; y: number; width: number; height: number } & (
  { kind: 'text'; text: string } | { kind: 'image'; bytes: Uint8Array; format: 'png' | 'jpg' } | MarkupStyle | { kind: 'web-link'; url: string } | { kind: 'page-link'; destination: number }
);
export function validateLinkUrl(value: string): string {
  if(value.length>2048||/[\u0000-\u0020\u007f]/.test(value))throw new Error('Enter an HTTP or HTTPS URL without spaces, control characters or credentials (up to 2048 characters).');
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('Enter a complete HTTP or HTTPS URL.');}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Use an HTTP or HTTPS URL without credentials.');
  if(url.href.length>2048)throw new Error('The encoded URL is too long.');
  return url.href;
}
export function linkRectangle(box:ReturnType<typeof placement>):number[]{
  const angle=box.rotate.angle*Math.PI/180;
  const corners=[[0,0],[box.width,0],[0,box.height],[box.width,box.height]].map(([x,y])=>[box.x+x*Math.cos(angle)-y*Math.sin(angle),box.y+x*Math.sin(angle)+y*Math.cos(angle)]);
  return [Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
}
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
    }else if(item.kind==='image'){
      if(!item.bytes.length||item.bytes.length>2*1024*1024)throw new Error('Each image must be 2 MB or smaller.');
      const image=item.format==='png'?await pdf.embedPng(item.bytes):await pdf.embedJpg(item.bytes);active();
      if(image.width*image.height>4_000_000)throw new Error('Each image must be 4 megapixels or smaller.');
      // Contain without stretching; anchor at the lower-left of the chosen box.
      const scale=Math.min(box.width/image.width,box.height/image.height);
      page.drawImage(image,{...box,width:image.width*scale,height:image.height*scale});
    }else if(item.kind==='web-link'||item.kind==='page-link'){
      const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:linkRectangle(box),Border:[0,0,0],P:page.ref});
      if(item.kind==='web-link')annotation.set(PDFName.of('A'),pdf.context.obj({S:'URI',URI:PDFString.of(validateLinkUrl(item.url))}));
      else{
        if(!Number.isInteger(item.destination)||item.destination<1||item.destination>count)throw new Error(`Choose a destination page from 1 to ${count}.`);
        annotation.set(PDFName.of('Dest'),pdf.context.obj([pdf.getPage(item.destination-1).ref,'Fit']));
      }
      page.node.addAnnot(pdf.context.register(annotation));
      // Render a thin blue frame in page content so the exact link area is visible
      // in canvas-only previews and in the downloaded document.
      const radians=box.rotate.angle*Math.PI/180;
      const stroke=Math.min(1,box.width/4,box.height/4),inset=stroke/2;
      page.drawRectangle({x:box.x+inset*Math.cos(radians)-inset*Math.sin(radians),y:box.y+inset*Math.sin(radians)+inset*Math.cos(radians),width:box.width-stroke,height:box.height-stroke,rotate:box.rotate,borderColor:rgb(0.04,0.4,0.76),borderWidth:stroke});
    }else{
      if(!/^#[0-9a-f]{6}$/i.test(item.color)||!Number.isFinite(item.opacity)||item.opacity<0.05||item.opacity>1||!Number.isFinite(item.thickness)||item.thickness<0.5||item.thickness>12)throw new Error('Choose a valid color, opacity from 0.05 to 1, and line thickness from 0.5 to 12 pt.');
      const color=rgb(parseInt(item.color.slice(1,3),16)/255,parseInt(item.color.slice(3,5),16)/255,parseInt(item.color.slice(5,7),16)/255);
      const radians=box.rotate.angle*Math.PI/180;
      const point=(x:number,y:number)=>({x:box.x+x*Math.cos(radians)-y*Math.sin(radians),y:box.y+x*Math.sin(radians)+y*Math.cos(radians)});
      if(item.kind==='highlight'){
        page.drawRectangle({...box,color,opacity:item.opacity,borderWidth:0,blendMode:BlendMode.Multiply});
      }else{
        if(item.thickness>=Math.min(box.width,box.height))throw new Error('Enlarge the markup box or reduce line thickness.');
        const inset=item.thickness/2;
        if(item.kind==='strike')page.drawLine({start:point(inset,box.height/2),end:point(box.width-inset,box.height/2),thickness:item.thickness,color,opacity:item.opacity});
        else if(item.kind==='rectangle')page.drawRectangle({...point(inset,inset),width:box.width-item.thickness,height:box.height-item.thickness,rotate:box.rotate,borderColor:color,borderWidth:item.thickness,borderOpacity:item.opacity});
        else page.drawEllipse({...point(box.width/2,box.height/2),xScale:(box.width-item.thickness)/2,yScale:(box.height-item.thickness)/2,rotate:box.rotate,borderColor:color,borderWidth:item.thickness,borderOpacity:item.opacity});
      }
    }
  }
  const bytes=await pdf.save();active();
  const sizeError=validateOutputSize(bytes.byteLength);if(sizeError)throw new Error(sizeError);
  const verified=await PDFDocument.load(bytes,{updateMetadata:false});active();
  if(verified.getPageCount()!==count)throw new Error('Output verification failed.');
  return bytes;
}
