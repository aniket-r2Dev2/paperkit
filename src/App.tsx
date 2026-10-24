import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, FileImage, FileText, Files, FileUp, FileWarning, LockKeyhole, Menu, RotateCw, Scissors, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import { parsePageRange } from './utils/pageRange';

type ToolKey = 'merge' | 'rotate' | 'split' | 'images';
const tools = [
 {key:'merge' as const,label:'Merge PDF',description:'Combine files into one polished PDF.',icon:Files,tag:'Popular'},
 {key:'rotate' as const,label:'Rotate pages',description:'Turn pages the right way up.',icon:RotateCw},
 {key:'split' as const,label:'Extract pages',description:'Save selected pages as a new file.',icon:Scissors},
 {key:'images' as const,label:'Images to PDF',description:'Turn JPG or PNG images into a PDF.',icon:FileImage}
];
type Status = 'idle'|'processing'|'done'|'error';

export default function App() {
 const inputRef=useRef<HTMLInputElement>(null);
 const [files,setFiles]=useState<File[]>([]);
 const [activeTool,setActiveTool]=useState<ToolKey>('merge');
 const [status,setStatus]=useState<Status>('idle');
 const [error,setError]=useState('');
 const [dragging,setDragging]=useState(false);
 const [pageRange,setPageRange]=useState('1');
 const [rotation,setRotation]=useState('90');
 const [outputUrl,setOutputUrl]=useState('');
 const [outputName,setOutputName]=useState('paperkit-output.pdf');
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
 const resetOutput=useCallback(()=>{if(outputUrl)URL.revokeObjectURL(outputUrl);setOutputUrl('');setStatus('idle');setError('');},[outputUrl]);
 const addFiles=(incoming:FileList|File[])=>{
  resetOutput();
  const accepted=Array.from(incoming).filter(file=>{
   const typeOk=file.type==='application/pdf'||file.type==='image/png'||file.type==='image/jpeg';
   const extOk=/\.(pdf|png|jpe?g)$/i.test(file.name);
   return typeOk&&extOk&&file.size>0;
  });
  if(!accepted.length){setError('Choose a valid PDF, PNG, or JPG/JPEG file.');setStatus('error');return;}
  if(accepted.some(file=>file.size>50*1024*1024)){setError('Each file must be 50 MB or smaller for this early preview.');setStatus('error');return;}
  setFiles(current=>[...current,...accepted].slice(0,20));setStatus('idle');setError('');
 };
 const removeFile=(index:number)=>{resetOutput();setFiles(current=>current.filter((_,i)=>i!==index));};
 const processFiles=async()=>{
  if(!files.length){setError('Add at least one file to get started.');setStatus('error');return;}
  resetOutput();setStatus('processing');setError('');
  try{
   let outputBytes:Uint8Array;let name='paperkit-output.pdf';
   if(activeTool==='images'){
    const pdf=await PDFDocument.create();
    for(const file of files){
     const bytes=await file.arrayBuffer();
     if(!/\.(png|jpe?g)$/i.test(file.name))throw new Error('Images to PDF currently supports PNG and JPG/JPEG only.');
     const image=file.type==='image/png'||/\.png$/i.test(file.name)?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
     const page=pdf.addPage([image.width,image.height]);page.drawImage(image,{x:0,y:0,width:image.width,height:image.height});
    }
    outputBytes=await pdf.save();name='paperkit-images.pdf';
   }else{
    const pdfFiles=files.filter(file=>file.type==='application/pdf'||/\.pdf$/i.test(file.name));
    if(!pdfFiles.length)throw new Error('This tool needs at least one PDF file.');
    if(activeTool==='merge'){
     const merged=await PDFDocument.create();
     for(const file of pdfFiles){const source=await PDFDocument.load(await file.arrayBuffer());const pages=await merged.copyPages(source,source.getPageIndices());pages.forEach(page=>merged.addPage(page));}
     outputBytes=await merged.save();name='paperkit-merged.pdf';
    }else if(activeTool==='rotate'){
     if(pdfFiles.length!==1)throw new Error('Rotate one PDF at a time for now.');
     const pdf=await PDFDocument.load(await pdfFiles[0].arrayBuffer());const turn=Number(rotation);
     pdf.getPages().forEach(page=>page.setRotation(degrees((page.getRotation().angle+turn)%360)));
     outputBytes=await pdf.save();name='paperkit-rotated.pdf';
    }else{
     if(pdfFiles.length!==1)throw new Error('Extract pages from one PDF at a time for now.');
     const source=await PDFDocument.load(await pdfFiles[0].arrayBuffer());const indices=parsePageRange(pageRange,source.getPageCount());
     if(!indices.length)throw new Error('Enter valid page numbers or ranges, e.g. 1-3, 5.');
     const extracted=await PDFDocument.create();const pages=await extracted.copyPages(source,indices);pages.forEach(page=>extracted.addPage(page));
     outputBytes=await extracted.save();name='paperkit-pages.pdf';
    }
   }
   setOutputUrl(URL.createObjectURL(new Blob([outputBytes as BlobPart],{type:'application/pdf'})));setOutputName(name);setStatus('done');
  }catch(e){setError(e instanceof Error?e.message:'We could not process that file. Try another PDF.');setStatus('error');}
 };
 const clearSession=()=>{setFiles([]);setOutputUrl('');setOutputName('paperkit-output.pdf');setError('');setStatus('idle');setPageRange('1');if(inputRef.current)inputRef.current.value='';};
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
      <div className="upload-icon"><FileUp size={24}/></div><p className="drop-title">Drop your files here, or <span>browse</span></p><p className="drop-subtitle">PDF, PNG or JPG/JPEG · up to 50 MB per file</p><input ref={inputRef} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple onChange={event=>{if(event.target.files)addFiles(event.target.files);event.target.value='';}}/>
     </div>
     {files.length>0&&<div className="file-list"><div className="file-list-heading"><span>{files.length} file{files.length===1?'':'s'} added</span><button className="text-button" onClick={clearSession}>Clear all</button></div>{files.map((file,index)=><div className="file-row" key={file.name+file.size+index}><div className="file-type-icon"><FileText size={18}/></div><div className="file-meta"><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div><button className="icon-button remove-file" aria-label={'Remove '+file.name} onClick={()=>removeFile(index)}><X size={17}/></button></div>)}</div>}
     {activeTool==='rotate'&&<div className="option-row"><label htmlFor="rotation">Rotate pages by</label><select id="rotation" value={rotation} onChange={event=>setRotation(event.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>}
     {activeTool==='split'&&<div className="option-row"><label htmlFor="page-range">Pages to extract</label><input id="page-range" value={pageRange} onChange={event=>setPageRange(event.target.value)} placeholder="e.g. 1-3, 5, 8"/><span className="field-help">Page numbers start at 1.</span></div>}
     {activeTool==='images'&&<p className="inline-help"><FileImage size={15}/> Each image becomes one page; currently PNG and JPG/JPEG.</p>}
     {error&&<div className="alert alert-error" role="alert"><FileWarning size={17}/><span>{error}</span></div>}
     {status==='done'&&outputUrl&&<div className="alert alert-success" role="status"><Check size={18}/><span>Your PDF is ready to download.</span></div>}
     <div className="work-actions"><p className="local-badge"><ShieldCheck size={15}/> Processing stays on this device</p>{status==='done'&&outputUrl?<a className="primary-button process-button" href={outputUrl} download={outputName}><ArrowDownToLine size={18}/> Download PDF</a>:<button className="primary-button process-button" onClick={processFiles} disabled={status==='processing'||files.length===0}>{status==='processing'?<span className="spinner"/>:<Sparkles size={17}/>} {status==='processing'?'Working…':'Process PDF'} <ArrowRight size={16}/></button>}</div>
     {status==='done'&&<button className="start-over" onClick={clearSession}>Done? Clear this session <Trash2 size={14}/></button>}
    </div>
   </section>
   <section className="how-section" id="how-it-works"><div className="how-heading"><p className="section-kicker">STRAIGHTFORWARD BY DESIGN</p><h2>Three steps. That’s it.</h2><p>No account, no saved files, no noise.</p></div><div className="steps-grid"><div className="step"><span className="step-number">01</span><div className="step-icon"><UploadCloud size={20}/></div><h3>Upload</h3><p>Choose a PDF or drop it into the workspace. Supported tools process files in this browser.</p></div><div className="step"><span className="step-number">02</span><div className="step-icon"><Sparkles size={20}/></div><h3>Get it done</h3><p>Pick a tool and set the options. We keep the workflow focused on the task.</p></div><div className="step"><span className="step-number">03</span><div className="step-icon"><ArrowDownToLine size={20}/></div><h3>Download</h3><p>Save your result, then clear the session. PaperKit has no document library.</p></div></div></section>
   <section className="promise-strip"><div className="promise-icon"><ShieldCheck size={21}/></div><div><h3>Your files are yours.</h3><p>This prototype processes files locally in your browser. It does not upload documents to a PaperKit server or save them to an account.</p></div><a href="https://github.com/aniket-r2Dev2/paperkit" target="_blank" rel="noreferrer">Review the code <ArrowRight size={15}/></a></section>
  </main>
  <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><FileText size={17}/></span><span>paperkit</span></a><p>Made for simple, private PDF work.</p><div><a href="https://github.com/aniket-r2Dev2/paperkit" target="_blank" rel="noreferrer">GitHub</a><span className="footer-dot">·</span><span>Open source</span></div></footer>
 </div>;
}
function parsePageRange(input:string,pageCount:number):number[]{const selected=new Set<number>();for(const part of input.split(',').map(value=>value.trim()).filter(Boolean)){const match=/^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);if(!match)throw new Error('Use page numbers or ranges like 1-3, 5.');const start=Number(match[1]);const end=Number(match[2]??match[1]);if(start<1||end<start||end>pageCount)throw new Error('Invalid page range: '+part);for(let page=start;page<=end;page++)selected.add(page-1);}return [...selected].sort((a,b)=>a-b);}
function formatBytes(bytes:number):string{return bytes<1024*1024?(bytes/1024).toFixed(0)+' KB':(bytes/(1024*1024)).toFixed(1)+' MB';}