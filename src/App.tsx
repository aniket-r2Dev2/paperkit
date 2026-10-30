import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpDown, Check, ChevronDown, FileImage, FileText, Files, FileUp, FileWarning, LockKeyhole, Menu, RotateCw, Scissors, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import PdfPreview from './components/PdfPreview';
import PageReorder from './components/PageReorder';
import { validateFileSignatures, validateFilesForTool } from './utils/fileValidation';
import { parsePageRange } from './utils/pageRange';
import { MAX_SPLIT_OUTPUTS, parseSplitRanges } from './utils/splitRanges';
import { createPdfZip } from './utils/zip';
import { mergeFilesInOrder } from './utils/mergePdfFiles';
import { revokeObjectUrls } from './utils/objectUrl';
import { assertProcessingActive, createProcessingDeadline, RESOURCE_LIMITS, validateIncomingFiles, validateOutputSize, validatePageCount } from './utils/resourceLimits';

type ToolKey = 'merge' | 'rotate' | 'extract' | 'split' | 'delete' | 'reorder' | 'images';
const tools = [
 {key:'merge' as const,label:'Merge PDF',description:'Combine PDFs and images in the order you choose.',icon:Files,tag:'Popular'},
 {key:'rotate' as const,label:'Rotate pages',description:'Turn pages the right way up.',icon:RotateCw},
 {key:'extract' as const,label:'Extract pages',description:'Save selected pages as a new file.',icon:Scissors},
 {key:'split' as const,label:'Split PDF',description:'Split every page or choose custom ranges.',icon:Files},
 {key:'delete' as const,label:'Delete pages',description:'Remove selected pages from a PDF.',icon:Trash2},
 {key:'reorder' as const,label:'Reorder pages',description:'Drag pages into the order you want.',icon:ArrowUpDown},
 {key:'images' as const,label:'Images to PDF',description:'Turn JPG or PNG images into a PDF.',icon:FileImage}
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
 const resetOutput=useCallback(()=>{processingControllerRef.current?.abort();processingControllerRef.current=null;setOutputUrl('');setZipUrl('');setSplitOutputs([]);setStatus('idle');setError('');},[]);
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
   const { PDFDocument, degrees } = await import('pdf-lib');
   let outputBytes:Uint8Array;let name='paperkit-output.pdf';
   if(activeTool==='split'){
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
     const source=await PDFDocument.load(await pdfFiles[0].arrayBuffer());checkActive();const pageLimitError=validatePageCount(source.getPageCount());if(pageLimitError)throw new Error(pageLimitError);const indices=parsePageRange(pageRange,source.getPageCount());
     if(!indices.length)throw new Error('Enter valid page numbers or ranges, e.g. 1-3, 5.');
     if(activeTool==='delete'){
      if(indices.length>=source.getPageCount())throw new Error('Keep at least one page in the PDF. Choose fewer pages to delete.');
      [...indices].sort((a,b)=>b-a).forEach(index=>source.removePage(index));
      outputBytes=await source.save();checkActive();name='paperkit-pages-removed.pdf';
     }else{
      const extracted=await PDFDocument.create();const pages=await extracted.copyPages(source,indices);pages.forEach(page=>extracted.addPage(page));
      outputBytes=await extracted.save();checkActive();name='paperkit-pages.pdf';
     }
    }
   }
   checkActive();const outputLimitError=validateOutputSize(outputBytes.byteLength);if(outputLimitError)throw new Error(outputLimitError);
   const outputObjectUrl=URL.createObjectURL(new Blob([outputBytes as BlobPart],{type:'application/pdf'}));createdObjectUrls.push(outputObjectUrl);setOutputUrl(outputObjectUrl);setOutputName(name);setStatus('done');
  }catch(e){revokeObjectUrls(createdObjectUrls);setError(e instanceof DOMException&&e.name==='AbortError'?'Processing was cancelled.':e instanceof Error?e.message:'We could not process that file. Try another PDF.');setStatus('error');
  }finally{if(processingControllerRef.current===controller)processingControllerRef.current=null;}
 };
 const cancelProcessing=()=>{processingControllerRef.current?.abort();};
 const clearSession=()=>{processingControllerRef.current?.abort();processingControllerRef.current=null;setFiles([]);setOutputUrl('');setZipUrl('');setSplitOutputs([]);setOutputName('paperkit-output.pdf');setError('');setStatus('idle');setPageRange('1');if(inputRef.current)inputRef.current.value='';};
 const activeToolInfo=tools.find(tool=>tool.key===activeTool)!;const ActiveIcon=activeToolInfo.icon;
 return <div className="app-shell">
  <header className="topbar">
   <a className="brand" href="#" aria-label="PaperKit home" onClick={event=>{event.preventDefault();clearSession();}}><span className="brand-mark"><FileText size={20} strokeWidth={2.3}/></span><span>paperkit</span></a>
   <nav className={mobileMenuOpen?'main-nav is-open':'main-nav'} aria-label="Main navigation"><a href="#tools" onClick={()=>setMobileMenuOpen(false)}>All tools <ChevronDown size={14}/></a><a href="#how-it-works" onClick={()=>setMobileMenuOpen(false)}>How it works</a><a href="https://github.com/aniket-r2Dev2/paperkit" target="_blank" rel="noreferrer">Open source <ArrowRight size={14}/></a></nav>
   <div className="topbar-right"><span className="privacy-chip"><LockKeyhole size={13}/> No account needed</span><button className="icon-button menu-toggle" aria-label="Toggle navigation" onClick={()=>setMobileMenuOpen(open=>!open)}><Menu size={19}/></button></div>
  </header>
  <main>
   <section className="hero"><div className="hero-eyebrow"><span className="eyebrow-dot"/> A simpler way to work with PDFs</div><h1>Your PDF tasks,<br/><span>without the clutter.</span></h1><p>Useful tools for your documents. No account, no file library.<br className="desktop-break"/> Just upload, get it done, and download.</p><button className="primary-button hero-cta" onClick={()=>inputRef.current?.click()}><UploadCloud size={18}/> Choose a PDF <ArrowRight size={16}/></button><div className="hero-note"><ShieldCheck size={15}/> The starter tools run locally in your browser. Files aren't uploaded to a PaperKit server.</div></section>
   <section className="workspace" aria-label="PDF workspace">
    <div className="workspace-header"><div><p className="section-kicker">YOUR WORKSPACE</p><h2>What would you like to do?</h2><p className="workspace-subtitle">Choose a tool, add your files, and download the result.</p></div><div className="privacy-note"><LockKeyhole size={16}/><span>Private by default</span></div></div>
    <div className="tool-grid" id="tools">{tools.map(tool=>{const Icon=tool.icon;return <button key={tool.key} className={activeTool===tool.key?'tool-card selected':'tool-card'} onClick={()=>{setActiveTool(tool.key);resetOutput();setError('');}}><span className="tool-icon"><Icon size={18}/></span><span className="tool-copy"><span className="tool-title">{tool.label}{tool.tag&&<span className="tool-tag">{tool.tag}</span>}</span><span className="tool-description">{tool.description}</span></span><ArrowRight className="tool-arrow" size={16}/></button>;})}</div>
    <div className="work-panel" id="upload-panel">
     <div className="work-panel-heading"><div className="active-tool-icon"><ActiveIcon size={19}/></div><div><h3>{activeToolInfo.label}</h3><p>{activeToolInfo.description}</p></div></div>
     <div className={dragging?'dropzone is-dragging':'dropzone'} role="button" tabIndex={0} onClick={()=>inputRef.current?.click()} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();inputRef.current?.click();}}} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);addFiles(event.dataTransfer.files);}}>
      <div className="upload-icon"><FileUp size={24}/></div><p className="drop-title">Drop your files here, or <span>browse</span></p><p className="drop-subtitle">PDF, PNG or JPG/JPEG · 50 MB per file · 200 MB total · 20 files max</p><input ref={inputRef} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple onChange={event=>{if(event.target.files)addFiles(event.target.files);event.target.value='';}}/>
     </div>
     {files.length > 0 && (
      <div className="file-list">
       <div className="file-list-heading"><span>{files.length} file{files.length === 1 ? '' : 's'} added</span><button className="text-button" onClick={clearSession}>Clear all</button></div>
       {activeTool==='merge'&&<p className="inline-help">Files merge from top to bottom. Use the arrows to change their order; each image becomes one PDF page.</p>}
       {files.map((file, index) => (
        <div className="file-row" key={file.name + file.size + index}>
         <div className="file-type-icon">{/\.(png|jpe?g)$/i.test(file.name)?<FileImage size={18}/>:<FileText size={18}/>}</div>
         <div className="file-meta"><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
         {activeTool==='merge'&&<><button className="icon-button" aria-label={'Move file '+(index+1)+' up: '+file.name} disabled={index===0} onClick={()=>moveFile(index,-1)}><ArrowUp size={17}/></button><button className="icon-button" aria-label={'Move file '+(index+1)+' down: '+file.name} disabled={index===files.length-1} onClick={()=>moveFile(index,1)}><ArrowDown size={17}/></button></>}
         <button className="icon-button remove-file" aria-label={'Remove ' + file.name} onClick={() => removeFile(index)}><X size={17}/></button>
        </div>
       ))}
      </div>
     )}
     {activeTool !== 'images' && files.some(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) && (
      activeTool==='reorder' ? <PageReorder file={files.find(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))!} order={pageOrder} onOrderChange={setPageOrder}/> : <PdfPreview file={files.find(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))!} />
     )}
     {activeTool==='split'&&<div className="option-row"><label htmlFor="split-mode">Split mode</label><select id="split-mode" value={splitMode} onChange={event=>{setSplitMode(event.target.value as 'every'|'ranges');resetOutput();}}><option value="every">Every page into its own PDF</option><option value="ranges">Custom page ranges</option></select><span className="field-help">Up to {MAX_SPLIT_OUTPUTS} output PDFs per operation.</span></div>}
     {activeTool==='split'&&splitMode==='ranges'&&<div className="option-row"><label htmlFor="split-ranges">Page ranges</label><input id="split-ranges" value={splitRangeInput} onChange={event=>{setSplitRangeInput(event.target.value);resetOutput();}} placeholder="e.g. 1-3, 5, 8-10"/><span className="field-help">Each comma-separated range creates its own PDF. Ranges must not overlap.</span></div>}
     {activeTool==='rotate'&&<div className="option-row"><label htmlFor="rotation">Rotate pages by</label><select id="rotation" value={rotation} onChange={event=>setRotation(event.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>}
     {(activeTool==='extract'||activeTool==='delete')&&<div className="option-row"><label htmlFor="page-range">{activeTool==='delete'?'Pages to delete':'Pages to extract'}</label><input id="page-range" value={pageRange} onChange={event=>setPageRange(event.target.value)} placeholder="e.g. 1-3, 5, 8"/><span className="field-help">Page numbers start at 1.</span></div>}
     {activeTool==='images'&&<p className="inline-help"><FileImage size={15}/> Each image becomes one page; currently PNG and JPG/JPEG.</p>}
     {error&&<div className="alert alert-error" role="alert"><FileWarning size={17}/><span>{error}</span></div>}
     {status==='done'&&(outputUrl||splitOutputs.length>0)&&<div className="alert alert-success" role="status"><Check size={18}/><span>{splitOutputs.length>0?`Split complete: ${splitOutputs.length} PDFs are ready to download.`:'Your PDF is ready to download.'}</span></div>}
     <div className="work-actions"><p className="local-badge"><ShieldCheck size={15}/> Processing stays on this device</p>{status==='done'&&(outputUrl||splitOutputs.length>0)?(splitOutputs.length>0?<div className="split-downloads">{zipUrl&&<a className="primary-button process-button" href={zipUrl} download={zipName}><ArrowDownToLine size={18}/> Download all as ZIP</a>}{splitOutputs.map(output=><a key={output.name} className="primary-button process-button" href={output.url} download={output.name}><ArrowDownToLine size={18}/> {output.name}</a>)}</div>:<a className="primary-button process-button" href={outputUrl} download={outputName}><ArrowDownToLine size={18}/> Download PDF</a>):<button className="primary-button process-button" onClick={processFiles} disabled={status==='processing'||files.length===0}>{status==='processing'?<span className="spinner"/>:<Sparkles size={17}/>} {status==='processing'?'Working…':'Process PDF'} <ArrowRight size={16}/></button>}{status==='processing'&&<button className="text-button" onClick={cancelProcessing}>Cancel processing</button>}</div>
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