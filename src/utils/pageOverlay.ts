import { degrees, StandardFonts, type PDFDocument } from 'pdf-lib';
import { parsePageRange } from './pageRange';
import { validatePageCount } from './resourceLimits';

export type OverlayOptions = {
  kind: 'watermark' | 'numbers' | 'header' | 'footer';
  text: string;
  range: string;
  size: number;
  opacity: number;
  angle: number;
  start: number;
  x: number;
  y: number;
};

export async function addPageOverlay(pdf: PDFDocument, options: OverlayOptions, checkActive: () => void) {
  const count = pdf.getPageCount();
  const limit = validatePageCount(count);
  if (limit) throw new Error(limit);
  const {size,opacity,angle,start,x,y} = options;
  if (![size,opacity,angle,start,x,y].every(Number.isFinite) || size < 6 || size > 144 ||
      opacity < 0.05 || opacity > 1 || Math.abs(angle) > 180 ||
      !Number.isInteger(start) || start < 0 || start > 100000 ||
      x < 0 || x > 100 || y < 0 || y > 100) {
    throw new Error('Check the overlay size, position, opacity, angle and starting number.');
  }
  if (!options.text.trim() || options.text.length > 200 || /[\r\n]/.test(options.text)) {
    throw new Error('Enter a single line of text, up to 200 characters.');
  }
  const indices = options.range.trim() ? parsePageRange(options.range,count) : Array.from({length:count},(_,i)=>i);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const date = new Date().toISOString().slice(0,10);
  for (const [ordinal,index] of indices.entries()) {
    checkActive();
    const text = options.text.replace(/\{(page|pages|date|number)\}/g,(_,key:string)=>
      ({page:String(index+1),pages:String(count),date,number:String(start+ordinal)})[key]!);
    try { font.encodeText(text); } catch { throw new Error('Use Western European characters supported by Helvetica.'); }
    const page = pdf.getPage(index);
    const crop = page.getCropBox(), media = page.getMediaBox();
    const left = Math.max(crop.x,media.x), bottom = Math.max(crop.y,media.y);
    const w = Math.min(crop.x+crop.width,media.x+media.width)-left;
    const h = Math.min(crop.y+crop.height,media.y+media.height)-bottom;
    const rotation = ((page.getRotation().angle%360)+360)%360;
    if (!(w>0&&h>0) || ![0,90,180,270].includes(rotation)) throw new Error('Unsupported page geometry.');
    const vw = rotation%180 ? h : w, vh = rotation%180 ? w : h;
    const textWidth = font.widthOfTextAtSize(text,size);
    const radians = angle*Math.PI/180;
    // Center the text's bounding rectangle on the visual position.
    const dx = textWidth/2, dy = size/2;
    const cx = vw*x/100, cy = vh*(1-y/100);
    const corners = [[-dx,-dy],[-dx,dy],[dx,-dy],[dx,dy]].map(([a,b])=>[
      cx+a*Math.cos(radians)-b*Math.sin(radians),
      cy+a*Math.sin(radians)+b*Math.cos(radians),
    ]);
    if (corners.some(([a,b])=>a<0||a>vw||b<0||b>vh)) throw new Error('Overlay extends beyond page '+(index+1)+'. Reduce the size or move it inward.');
    const px = cx-dx*Math.cos(radians)+dy*Math.sin(radians);
    const py = cy-dx*Math.sin(radians)-dy*Math.cos(radians);
    const origins:Record<number,number[]> = {0:[px,py],90:[w-py,px],180:[w-px,h-py],270:[py,h-px]};
    const [a,b] = origins[rotation];
    page.drawText(text,{x:left+a,y:bottom+b,size,font,opacity,rotate:degrees(rotation+angle)});
  }
}
