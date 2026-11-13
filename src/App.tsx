import PdfBookmarks from './components/PdfBookmarks';
import PdfMetadata from './components/PdfMetadata';
import type { OverlayOptions } from './utils/pageOverlay';
import SignPdf from './components/SignPdf';
import FillForm from './components/FillForm';
import { paperSizes } from './utils/resizeOptions';
import CropPreview from './components/CropPreview';
import { cropPages, edges, initialMargins } from './utils/cropPages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpDown, Check, ChevronDown, FileImage, FileText, Files, FileUp, FileWarning, LockKeyhole, Menu, RotateCw, Scissors, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import PdfPreview from './components/PdfPreview';
import PageReorder from './components/PageReorder';
import { validateFileSignatures, validateFilesForTool } from './utils/fileValidation';
import { parsePageRange } from './utils/pageRange';
import { MAX_SPLIT_OUTPUTS, parseSplitRanges } from './utils/splitRanges';
import { createPdfZip, createImageZip } from './utils/zip';
import { type ImageFormat, type Resolution } from './utils/imageExportOptions';
import { COMPRESSION_PRESETS, type CompressionPreset, type CompressionOutcome } from './utils/compressionOptions';
import { mergeFilesInOrder } from './utils/mergePdfFiles';
import { revokeObjectUrls } from './utils/objectUrl';
import { assertProcessingActive, createProcessingDeadline, RESOURCE_LIMITS, validateIncomingFiles, validateOutputSize, validatePageCount } from './utils/resourceLimits';

type ToolKey = 'merge' | 'rotate' | 'extract' | 'split' | 'delete' | 'reorder' | 'images' | 'pdf-images' | 'compress' | 'pdf-text' | 'crop' | 'resize' | 'forms' | 'sign' | 'overlay' | 'metadata' | 'bookmarks';
const tools = [
 {key:'merge' as const,label:'Merge PDF',description:'Combine PDFs and images in the order you choose.',icon:Files,tag:'Popular'},
 {key:'rotate' as const,label:'Rotate pages',description:'Turn pages the right way up.',icon:RotateCw},
 {key:'extract' as const,label:'Extract pages',description:'Save selected pages as a new file.',icon:Scissors},
 {key:'split' as const,label:'Split PDF',description:'Split every page or choose custom ranges.',icon:Files},
 {key:'delete' as const,label:'Delete pages',description:'Remove selected pages from a PDF.',icon:Trash2},
 {key:'reorder' as const,label:'Reorder pages',description:'Drag pages into the order you want.',icon:ArrowUpDown},
 {key:'images' as const,label:'Images to PDF',description:'Turn JPG or PNG images into a PDF.',icon:FileImage},
 {key:'pdf-images' as const,label:'PDF to Images',description:'Export PDF pages as PNG or JPEG images.',icon:FileImage},
 {key:'bookmarks' as const,label:'Create PDF bookmarks',description:'Add and reorder navigation to important pages.',icon:FileText},
 {key:'metadata' as const,label:'Edit PDF properties',description:'View and edit title, author, subject and keywords.',icon:FileText},
 {key:'overlay' as const,label:'Watermark & page labels',description:'Add watermarks, numbering, headers and footers.',icon:FileText},
 {key:'sign' as const,label:'Sign PDF',description:'Type, draw or upload and place a signature.',icon:FileText},
 {key:'forms' as const,label:'Fill PDF Form',description:'Complete existing text, checkbox and radio fields.',icon:FileText},
 {key:'resize' as const,label:'Resize PDF',description:'Fit PDF pages to a standard or custom sheet.',icon:Files},
 {key:'crop' as const,label:'Crop PDF',description:'Trim margins on all or selected pages.',icon:Scissors},
 {key:'pdf-text' as const,label:'PDF to Text',description:'Download selectable PDF text as a UTF-8 text file.',icon:FileText},
 {key:'compress' as const,label:'Compress PDF',description:'Reduce PDF size with clear quality trade-offs.',icon:Files}
];
type Status = 'idle'|'processing'|'done'|'error';

export default function App() {
 const inputRef=useRef<HTMLInputElement>(null);
 const processingControllerRef=useRef<AbortController|null>(null);
 const [files,setFiles]=useState<File[]>([]);
 const [activeTool,setActiveTool]=useState<ToolKey>('merge');
 const [status,setStatus]=useState<Status>('idle');
 const [error,setError]=useState('');
 const [dragging,setDragging]=useState(false);
 const [pageRange,setPageRange]=useState('1');
 const [splitMode,setSplitMode]=useState<'every'|'ranges'>('every');
 const [splitRangeInput,setSplitRangeInput]=useState('1-3, 5');
 const [size,setSize]=useState<keyof typeof paperSizes|'custom'>('A4');
 const [customWidth,setCustomWidth]=useState('210');
 const [customHeight,setCustomHeight]=useState('297');
 const [resizeRange,setResizeRange]=useState('');
 const [overlay,setOverlay]=useState<OverlayOptions>({kind:'watermark',text:'DRAFT',range:'',size:36,opacity:0.25,angle:0,start:1,x:50,y:50});
 const [cropRange,setCropRange]=useState('');
 const [margins,setMargins]=useState(initialMargins);
 const [textRange,setTextRange]=useState('');
 const [imageFormat,setImageFormat]=useState<ImageFormat>('png');
 const [imageDpi,setImageDpi]=useState<Resolution>(150);
 const [imageSelection,setImageSelection]=useState<'all'|'selected'>('all');
 const [imageRange,setImageRange]=useState('1-3');
 const [compressionPreset,setCompressionPreset]=useState<CompressionPreset>('lossless');
 const [compressionSummary,setCompressionSummary]=useState<Omit<CompressionOutcome,'bytes'>|null>(null);
 const [pageOrder,setPageOrder]=useState<number[]>([]);
 const [rotation,setRotation]=useState('90');
 const [outputUrl,setOutputUrl]=useState('');
 const [zipUrl,setZipUrl]=useState('');
 const [zipName,setZipName]=useState('paperkit-split.zip');
 const [splitOutputs,setSplitOutputs]=useState<{url:string;name:string}[]>([]);
 const [outputName,setOutputName]=useState('paperkit-output.pdf');
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
 useEffect(() => () => { processingControllerRef.current?.abort(); }, []);
 useEffect(() => () => { revokeObjectUrls([outputUrl, zipUrl, ...splitOutputs.map(output=>output.url)].filter(Boolean)); }, [outputUrl,zipUrl,splitOutputs]);
 const resetOutput=useCallback(()=>{processingControllerRef.current?.abort();processingControllerRef.current=null;setOutputUrl('');setZipUrl('');setSplitOutputs([]);setCompressionSummary(null);setStatus('idle');setError('');},[]);
 const addFiles=(incoming:FileList|File[])=>{
  resetOutput();
  const accepted=Array.from(incoming);
  if(!accepted.length){setError('Choose a PDF, PNG, or JPG/JPEG file.');setStatus('error');return;}
  const invalidFile=accepted.some(file=>{
   const typeOk=file.type==='application/pdf'||file.type==='image/png'||file.type==='image/jpeg';
   const extOk=/\.(pdf|png|jpe?g)$/i.test(file.name);
   return !typeOk||!extOk||file.size<=0;
  });
  if(invalidFile){setError('Only non-empty PDF, PNG, and JPG/JPEG files are supported. Remove unsupported files and try again.');setStatus('error');return;}
  const limitError=validateIncomingFiles(files,accepted);
  if(limitError){setError(limitError);setStatus('error');return;}
  setFiles(current=>[...current,...accepted]);setStatus('idle');setError('');
 };
 const removeFile=(index:number)=>{resetOutput();setFiles(current=>current.filter((_,i)=>i!==index));};
 const moveFile=(index:number,direction:-1|1)=>{
  const target=index+direction;
  if(target<0||target>=files.length)return;
  resetOutput();
  setFiles(current=>{
   const next=[...current];
   [next[index],next[target]]=[next[target],next[index]];
   return next;
  });
 };
 const processFiles=async()=>{
  if(!files.length){setError('Add at least one file to get started.');setStatus('error');return;}
  resetOutput();setStatus('processing');setError('');
  const createdObjectUrls: string[] = [];
  const controller=new AbortController();processingControllerRef.current=controller;
  const deadline=createProcessingDeadline();
  const checkActive=()=>assertProcessingActive(controller.signal,deadline);
  try{
   checkActive();
   const validationError=validateFilesForTool(activeTool,files);
   if(validationError)throw new Error(validationError);
   const signatureError = await validateFileSignatures(files);
   checkActive();
   if (signatureError) throw new Error(signatureError);
   if(activeTool==='pdf-text'){
    if(files.length!==1)throw new Error('PDF to Text accepts one PDF at a time.');
    const { extractPdfText } = await import('./utils/pdfToText');
    const result=await extractPdfText(files[0],textRange.trim()||null,controller.signal,checkActive);
    checkActive();
    const url=URL.createObjectURL(result);
    createdObjectUrls.push(url);
    setOutputUrl(url);setOutputName('paperkit-text.txt');setStatus('done');return;
   }
   if(activeTool==='compress'){
    if(files.length!==1)throw new Error('Compress one PDF at a time. Remove extra files.');
    const { compressPdf } = await import('./utils/compressPdf');
    checkActive();
    const result=await compressPdf(files[0],compressionPreset,controller.signal,checkActive);
    checkActive();
    const url=URL.createObjectURL(new Blob([result.bytes as BlobPart],{type:'application/pdf'}));
    createdObjectUrls.push(url);
    checkActive();
    setOutputUrl(url);
    setOutputName(result.usedOriginal?'paperkit-original.pdf':'paperkit-compressed.pdf');
    setCompressionSummary({
     originalBytes:result.originalBytes,outputBytes:result.outputBytes,
     savedBytes:result.savedBytes,savingsPercent:result.savingsPercent,
     usedOriginal:result.usedOriginal,
    });
    setStatus('done');return;
   }
   if(activeTool==='pdf-images'){
    if(files.length!==1)throw new Error('PDF to Images accepts one PDF at a time. Remove extra files.');
    const { renderPdfAsImages } = await import('./utils/pdfToImages');
    checkActive();
    const results=await renderPdfAsImages(files[0],{
     format:imageFormat,dpi:imageDpi,pages:imageSelection,range:imageRange
    },controller.signal,checkActive);
    checkActive();
    const mime=imageFormat==='png'?'image/png':'image/jpeg';
    if(results.length===1){
     const file=results[0];
     const url=URL.createObjectURL(new Blob([file.bytes as BlobPart],{type:mime}));
     createdObjectUrls.push(url);
     checkActive();
     setOutputUrl(url);setOutputName(file.name);setStatus('done');
     return;
    }
    const archive=createImageZip(results);
    checkActive();
    const zip=URL.createObjectURL(new Blob([archive as BlobPart],{type:'application/zip'}));
    createdObjectUrls.push(zip);
    const outputLinks:{url:string;name:string}[]=[];
    for(const result of results){
     checkActive();
     const url=URL.createObjectURL(new Blob([result.bytes as BlobPart],{type:mime}));
     createdObjectUrls.push(url);
     outputLinks.push({url,name:result.name});
    }
    checkActive();
    setZipUrl(zip);
    setZipName(files[0].name.replace(/\.pdf$/i,'').replace(/[^a-z0-9-_]+/gi,'-')+'-images.zip');
    setSplitOutputs(outputLinks);setStatus('done');return;
   }
   const { PDFDocument, degrees } = await import('pdf-lib');
   let outputBytes:Uint8Array;let name='paperkit-output.pdf';
   if(activeTool==='overlay'){
    if(files.length!==1)throw new Error('Choose one PDF to label.');
    const { addPageOverlay }=await import('./utils/pageOverlay');
    const pdf=await PDFDocument.load(await files[0].arrayBuffer());
    await addPageOverlay(pdf,overlay,checkActive);
    outputBytes=await pdf.save();name='paperkit-labelled.pdf';
   }else if(activeTool==='resize'){
    if(files.length!==1)throw new Error('Choose one PDF to resize.');
    const { resizePages }=await import('./utils/resizePages');
    const pdf=await PDFDocument.load(await files[0].arrayBuffer());
    const [width,height]=size==='custom'?[Number(customWidth),Number(customHeight)]:paperSizes[size];
    resizePages(pdf,width,height,resizeRange,checkActive);
    outputBytes=await pdf.save();name='paperkit-resized.pdf';
   }else if(activeTool==='crop'){
    if(files.length!==1)throw new Error('Choose one PDF to crop.');
    const pdf=await PDFDocument.load(await files[0].arrayBuffer());
    cropPages(pdf,margins,cropRange,checkActive);
    outputBytes=await pdf.save();name='paperkit-cropped.pdf';
   }else if(activeTool==='split'){
    const pdfFiles=files.filter(file=>file.type==='application/pdf'||/\.pdf$/i.test(file.name));
    if(pdfFiles.length!==1)throw new Error('Split one PDF at a time.');
    const source=await PDFDocument.load(await pdfFiles[0].arrayBuffer());checkActive();
    const pageLimitError=validatePageCount(source.getPageCount());if(pageLimitError)throw new Error(pageLimitError);
    const count=source.getPageCount();
    if(splitMode==='every'&&count<2)throw new Error('This PDF needs at least two pages to split every page.');
    if(splitMode==='every'&&count>MAX_SPLIT_OUTPUTS){
     throw new Error('Splitting every page supports up to '+MAX_SPLIT_OUTPUTS+' outputs. Choose custom ranges for a larger PDF.');
    }
    const groups=splitMode==='every'
     ?Array.from({length:count},(_,index)=>({start:index+1,end:index+1,indices:[index]}))
     :parseSplitRanges(splitRangeInput,count);
    const baseName=pdfFiles[0].name.replace(/\.pdf$/i,'').replace(/[^a-z0-9-_]+/gi,'-')||'paperkit';
    const generated:{name:string;bytes:Uint8Array}[]=[];
    let totalOutputBytes=0;
    for(const group of groups){
     checkActive();
     const part=await PDFDocument.create();
     const pages=await part.copyPages(source,group.indices);checkActive();
     pages.forEach(page=>part.addPage(page));
     const bytes=await part.save();checkActive();
     totalOutputBytes+=bytes.byteLength;
     const outputLimitError=validateOutputSize(totalOutputBytes);
     if(outputLimitError)throw new Error(outputLimitError);
     const suffix=splitMode==='every'
      ?'page-'+group.start
      :'pages-'+group.start+(group.start===group.end?'':'-'+group.end);
     generated.push({name:baseName+'-'+suffix+'.pdf',bytes});
    }
    checkActive();
    const zipBytes=createPdfZip(generated);checkActive();
    const archiveName=baseName+'-split.zip';
    const archiveUrl=URL.createObjectURL(new Blob([zipBytes as BlobPart],{type:'application/zip'}));
    createdObjectUrls.push(archiveUrl);
    const outputs:{url:string;name:string}[]=[];
    for(const result of generated){
     checkActive();
     const url=URL.createObjectURL(new Blob([result.bytes as BlobPart],{type:'application/pdf'}));
     createdObjectUrls.push(url);
     outputs.push({url,name:result.name});
    }
    checkActive();
    setZipUrl(archiveUrl);setZipName(archiveName);
    setSplitOutputs(outputs);setOutputUrl('');setStatus('done');return;
   }else if(activeTool==='images'){
    if(files.length>RESOURCE_LIMITS.maxPages)throw new Error('Images to PDF supports up to 500 images per session.');
    const pdf=await PDFDocument.create();
    for(const file of files){
     checkActive();
     const bytes=await file.arrayBuffer();checkActive();
     if(!/\.(png|jpe?g)$/i.test(file.name))throw new Error('Images to PDF currently supports PNG and JPG/JPEG only.');
     const image=file.type==='image/png'||/\.png$/i.test(file.name)?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
     const page=pdf.addPage([image.width,image.height]);page.drawImage(image,{x:0,y:0,width:image.width,height:image.height});
    }
    outputBytes=await pdf.save();checkActive();name='paperkit-images.pdf';
   }else{
    const pdfFiles=files.filter(file=>file.type==='application/pdf'||/\.pdf$/i.test(file.name));
    if(!pdfFiles.length&&activeTool!=='merge')throw new Error('This tool needs at least one PDF file.');
    if(activeTool==='merge'){
     outputBytes=await mergeFilesInOrder(files,PDFDocument,checkActive);
     name='paperkit-merged.pdf';
    }else if(activeTool==='rotate'){
     if(pdfFiles.length!==1)throw new Error('Rotate one PDF at a time for now.');
     const pdf=await PDFDocument.load(await pdfFiles[0].arrayBuffer());checkActive();const pageLimitError=validatePageCount(pdf.getPageCount());if(pageLimitError)throw new Error(pageLimitError);const turn=Number(rotation);
     pdf.getPages().forEach(page=>page.setRotation(degrees((page.getRotation().angle+turn)%360)));
     outputBytes=await pdf.save();checkActive();name='paperkit-rotated.pdf';
    }else if(activeTool==='reorder'){
     if(pdfFiles.length!==1)throw new Error('Reorder pages in one PDF at a time for now.');
     const source=await PDFDocument.load(await pdfFiles[0].arrayBuffer());checkActive();
     const pageLimitError=validatePageCount(source.getPageCount());if(pageLimitError)throw new Error(pageLimitError);
     const count=source.getPageCount();
     const indices=pageOrder.length===count&&new Set(pageOrder).size===count&&pageOrder.every(index=>Number.isInteger(index)&&index>=0&&index<count)?pageOrder:Array.from({length:count},(_,index)=>index);
     const reordered=await PDFDocument.create();
     const pages=await reordered.copyPages(source,indices);pages.forEach(page=>reordered.addPage(page));
     outputBytes=await reordered.save();checkActive();name='paperkit-reordered.pdf';
    }else{
     if(pdfFiles.length!==1)throw new Error(activeTool==='delete'?'Delete pages from one PDF at a time for now.':'Extract pages from one PDF at a time for now.');
     const source=await PDFDocument.load(await pdfFiles[0].arrayBuffer());checkActive();const pageLimitError=validatePageCount(source.getPageCount());if(pageLimitError)throw new Error(…2492 tokens truncated…onChange={event=>{resetOutput();setImageFormat(event.target.value as ImageFormat);}}><option value="png">PNG — lossless</option><option value="jpeg">JPEG — smaller files</option></select></div>}
     {activeTool==='pdf-images'&&<div className="option-row"><label htmlFor="image-dpi">Resolution</label><select id="image-dpi" value={imageDpi} onChange={event=>{resetOutput();setImageDpi(Number(event.target.value) as Resolution);}}><option value="72">72 DPI — small</option><option value="150">150 DPI — standard</option><option value="200">200 DPI — sharp</option><option value="300">300 DPI — high resolution</option></select></div>}
     {activeTool==='pdf-images'&&<div className="option-row"><label htmlFor="image-pages">Pages to export</label><select id="image-pages" value={imageSelection} onChange={event=>{resetOutput();setImageSelection(event.target.value as 'all'|'selected');}}><option value="all">All pages (up to 100)</option><option value="selected">Selected pages</option></select></div>}
     {activeTool==='pdf-images'&&imageSelection==='selected'&&<div className="option-row"><label htmlFor="image-page-range">Page numbers or ranges</label><input id="image-page-range" value={imageRange} onChange={event=>{resetOutput();setImageRange(event.target.value);}} placeholder="e.g. 1-3, 5, 8"/><span className="field-help">Up to 100 pages, without duplicate outputs.</span></div>}
     {activeTool==='pdf-images'&&<p className="inline-help">Export up to 100 pages as individual images or a ZIP. Each page is limited to 16 megapixels; lower the DPI for large pages. Files stay on this device.</p>}
     {activeTool==='overlay'&&<section aria-label="Page labels">
      <div className="option-row"><label htmlFor="overlay-kind">Label type</label><select id="overlay-kind" value={overlay.kind} onChange={event=>{
       resetOutput();const kind=event.target.value as OverlayOptions['kind'];
       setOverlay(current=>({...current,kind,text:kind==='numbers'?'Page {number}':kind==='watermark'?'DRAFT':'{page} / {pages}',size:kind==='watermark'?36:12,opacity:kind==='watermark'?0.25:1,angle:0,x:50,y:kind==='header'?5:kind==='watermark'?50:95}));
      }}><option value="watermark">Text watermark</option><option value="numbers">Page numbers</option><option value="header">Header</option><option value="footer">Footer</option></select></div>
      <div className="option-row"><label htmlFor="overlay-text">Label text</label><input id="overlay-text" maxLength={200} value={overlay.text} onChange={e=>{resetOutput();setOverlay(current=>({...current,text:e.target.value}));}}/></div>
      <p className="inline-help">Use {'{page}'} for the source page, {'{pages}'} for total pages, {'{number}'} for sequential numbering of selected pages, or {'{date}'} for today’s UTC date. Text supports Western European characters.</p>
      <div className="option-row"><label htmlFor="overlay-range">Pages to label</label><input id="overlay-range" placeholder="All pages" value={overlay.range} onChange={e=>{resetOutput();setOverlay(current=>({...current,range:e.target.value}));}}/></div>
      {([['size','Font size',6,144,1],['opacity','Opacity',0.05,1,0.05],['angle','Rotation (degrees)',-180,180,1],['start','Starting number',0,100000,1],['x','Horizontal position (%)',0,100,1],['y','Vertical position (%)',0,100,1]] as const).map(([key,label,min,max,step])=><div className="option-row" key={key}><label htmlFor={'overlay-'+key}>{label}</label><input id={'overlay-'+key} type="number" min={min} max={max} step={step} value={overlay[key]} onChange={e=>{resetOutput();setOverlay(current=>({...current,[key]:Number(e.target.value)}));}}/></div>)}
      {outputUrl&&<CropPreview file={outputUrl} range={overlay.range}/>}
     </section>}
     {activeTool==='resize'&&<section aria-label="Resize settings">
      <div className="option-row"><label htmlFor="sheet-size">Sheet size</label><select id="sheet-size" value={size} onChange={e=>{resetOutput();setSize(e.target.value as typeof size);}}>
       {Object.entries(paperSizes).map(([name,[w,h]])=><option key={name} value={name}>{name} ({w} × {h} mm)</option>)}<option value="custom">Custom dimensions</option>
      </select></div>
      {size==='custom'&&<div className="option-row"><label htmlFor="sheet-width">Width (mm)</label><input id="sheet-width" type="number" min="1" max="5080" step="any" value={customWidth} onChange={e=>{resetOutput();setCustomWidth(e.target.value);}}/><label htmlFor="sheet-height">Height (mm)</label><input id="sheet-height" type="number" min="1" max="5080" step="any" value={customHeight} onChange={e=>{resetOutput();setCustomHeight(e.target.value);}}/></div>}
      <div className="option-row"><label htmlFor="resize-pages">Pages to resize</label><input id="resize-pages" value={resizeRange} placeholder="All pages" onChange={e=>{resetOutput();setResizeRange(e.target.value);}}/></div>
      <p className="inline-help">Leave the range blank for all pages, or enter a range such as 2-4. Visible content is centered and scaled proportionally. Selected pages with links, forms or annotations are unsupported.</p>
      {outputUrl&&<CropPreview file={outputUrl} range={resizeRange}/>}
     </section>}
     {activeTool==='crop'&&<section aria-label="Crop settings">
      <div className="option-row"><label htmlFor="crop-range">Pages to crop</label><input id="crop-range" placeholder="All pages" value={cropRange} onChange={event=>{resetOutput();setCropRange(event.target.value);}}/><span className="field-help">Leave blank for all pages or enter a range such as 2-4, 7.</span></div>
      {edges.map(edge=>{
       const update=(value:string)=>{resetOutput();setMargins(current=>({...current,[edge]:Number(value)}));};
       return <div className="option-row" key={edge}><label htmlFor={'crop-'+edge}>{edge} margin (%)</label><input id={'crop-'+edge} type="number" min="0" max="99" step="any" value={margins[edge]} onChange={event=>update(event.target.value)}/><input aria-label={'Adjust '+edge+' margin'} type="range" min="0" max="99" value={margins[edge]} onChange={event=>update(event.target.value)}/></div>;
      })}
      <p className="inline-help">Cropping hides content outside the visible area. Use a redaction tool to permanently remove sensitive information.</p>
      {files.length===1&&<CropPreview file={files[0]} range={cropRange} margins={margins}/>}
     </section>}
     {activeTool==='pdf-text'&&<div className="option-row"><label htmlFor="text-pages">Pages to export</label><input id="text-pages" value={textRange} placeholder="All pages" onChange={event=>{resetOutput();setTextRange(event.target.value);}}/><span className="field-help">Leave blank for all pages or enter a range such as 2-3, 5. Image-only scans require OCR.</span></div>}
     {activeTool==='rotate'&&<div className="option-row"><label htmlFor="rotation">Rotate pages by</label><select id="rotation" value={rotation} onChange={event=>setRotation(event.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>}
     {(activeTool==='extract'||activeTool==='delete')&&<div className="option-row"><label htmlFor="page-range">{activeTool==='delete'?'Pages to delete':'Pages to extract'}</label><input id="page-range" value={pageRange} onChange={event=>setPageRange(event.target.value)} placeholder="e.g. 1-3, 5, 8"/><span className="field-help">Page numbers start at 1.</span></div>}
     {activeTool==='images'&&<p className="inline-help"><FileImage size={15}/> Each image becomes one page; currently PNG and JPG/JPEG.</p>}
     {error&&<div className="alert alert-error" role="alert"><FileWarning size={17}/><span>{error}</span></div>}
     {status==='done'&&(outputUrl||splitOutputs.length>0)&&<div className="alert alert-success" role="status"><Check size={18}/><span>{activeTool==='pdf-images'?`${splitOutputs.length||1} image${(splitOutputs.length||1)===1?' is':'s are'} ready to download.`:splitOutputs.length>0?`Split complete: ${splitOutputs.length} PDFs are ready to download.`:activeTool==='pdf-text'?'Your text file is ready to download.':'Your PDF is ready to download.'}</span></div>}
     {activeTool==='compress'&&compressionSummary&&status==='done'&&<p className="inline-help" data-testid="compression-summary">Original: {formatBytes(compressionSummary.originalBytes)} · Result: {formatBytes(compressionSummary.outputBytes)} · Reduced by {compressionSummary.savingsPercent.toFixed(1)}% ({formatBytes(compressionSummary.savedBytes)} saved). {compressionSummary.usedOriginal?'This PDF could not be reduced with the selected preset; the original file was retained.':compressionPreset==='lossless'?'PDF structure was rewritten without rasterizing pages.':'Compressed pages have been flattened to JPEG images; text and form interactivity are not preserved.'}</p>}
     {activeTool==='sign'&&(files.length===1?<SignPdf key={files[0].name+files[0].size+files[0].lastModified} file={files[0]}/>:<p>Choose one PDF to sign.</p>)}
     {activeTool==='bookmarks'&&(files.length===1?<PdfBookmarks key={files[0].name+files[0].size+files[0].lastModified} file={files[0]}/>:<p>Choose one PDF to add bookmarks.</p>)}
     {activeTool==='metadata'&&(files.length===1?<PdfMetadata key={files[0].name+files[0].size+files[0].lastModified} file={files[0]}/>:<p>Choose one PDF to edit its properties.</p>)}
     {activeTool==='forms'&&(files.length===1?<FillForm key={files[0].name+files[0].size+files[0].lastModified} file={files[0]}/>:<p>Choose one PDF with existing form fields.</p>)}
     {activeTool!=='forms'&&activeTool!=='sign'&&activeTool!=='metadata'&&activeTool!=='bookmarks'&&<div className="work-actions"><p className="local-badge"><ShieldCheck size={15}/> Processing stays on this device</p>{status==='done'&&(outputUrl||splitOutputs.length>0)?(splitOutputs.length>0?<div className="split-downloads">{zipUrl&&<a className="primary-button process-button" href={zipUrl} download={zipName}><ArrowDownToLine size={18}/> Download all as ZIP</a>}{splitOutputs.map(output=><a key={output.name} className="primary-button process-button" href={output.url} download={output.name}><ArrowDownToLine size={18}/> {output.name}</a>)}</div>:<a className="primary-button process-button" href={outputUrl} download={outputName}><ArrowDownToLine size={18}/> {activeTool==='pdf-images'?'Download image':activeTool==='pdf-text'?'Download text':'Download PDF'}</a>):<button className="primary-button process-button" onClick={processFiles} disabled={status==='processing'||files.length===0}>{status==='processing'?<span className="spinner"/>:<Sparkles size={17}/>} {status==='processing'?'Working…':'Process PDF'} <ArrowRight size={16}/></button>}{status==='processing'&&<button className="text-button" onClick={cancelProcessing}>Cancel processing</button>}</div>}
     {status==='done'&&<button className="start-over" onClick={clearSession}>Done? Clear this session <Trash2 size={14}/></button>}
    </div>
   </section>
   <section className="how-section" id="how-it-works"><div className="how-heading"><p className="section-kicker">STRAIGHTFORWARD BY DESIGN</p><h2>Three steps. That’s it.</h2><p>No account, no saved files, no noise.</p></div><div className="steps-grid"><div className="step"><span className="step-number">01</span><div className="step-icon"><UploadCloud size={20}/></div><h3>Upload</h3><p>Choose a PDF or drop it into the workspace. Supported tools process files in this browser.</p></div><div className="step"><span className="step-number">02</span><div className="step-icon"><Sparkles size={20}/></div><h3>Get it done</h3><p>Pick a tool and set the options. We keep the workflow focused on the task.</p></div><div className="step"><span className="step-number">03</span><div className="step-icon"><ArrowDownToLine size={20}/></div><h3>Download</h3><p>Save your result, then clear the session. PaperKit has no document library.</p></div></div></section>
   <section className="promise-strip"><div className="promise-icon"><ShieldCheck size={21}/></div><div><h3>Your files are yours.</h3><p>This prototype processes files locally in your browser. It does not upload documents to a PaperKit server or save them to an account.</p></div><a href="https://github.com/aniket-r2Dev2/paperkit" target="_blank" rel="noreferrer">Review the code <ArrowRight size={15}/></a></section>
  </main>
  <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><FileText size={17}/></span><span>paperkit</span></a><p>Made for simple, private PDF work.</p><div><a href="https://github.com/aniket-r2Dev2/paperkit" target="_blank" rel="noreferrer">GitHub</a><span className="footer-dot">·</span><span>Open source</span></div></footer>
 </div>;
}
function formatBytes(bytes:number):string{return bytes<1024*1024?(bytes/1024).toFixed(0)+' KB':(bytes/(1024*1024)).toFixed(1)+' MB';}