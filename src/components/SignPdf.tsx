import { useEffect, useRef, useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from '../utils/resourceLimits';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function SignPdf({file}: {file: File}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<HTMLCanvasElement>(null);
  const job = useRef(0);
  const drawing = useRef(false);
  const [pageNumber,setPageNumber] = useState(1);
  const [count,setCount] = useState(0);
  const [name,setName] = useState('');
  const [signature,setSignature] = useState('');
  const [x,setX] = useState(10);
  const [y,setY] = useState(70);
  const [width,setWidth] = useState(30);
  const [height,setHeight] = useState(10);
  const [output,setOutput] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  useEffect(()=>()=>{job.current++;},[]);
  useEffect(()=>()=>{if(output)URL.revokeObjectURL(output);},[output]);
  useEffect(()=>{
    let stopped=false;
    let task: ReturnType<typeof getDocument>|undefined;
    setReady(false);
    async function preview(){
      try{
        if(file.size>RESOURCE_LIMITS.maxFileBytes||await validateFileSignatures([file]))throw new Error();
        const data=await file.arrayBuffer();
        if(stopped)return;
        task=getDocument({data});
        const doc=await task.promise;
        if(validatePageCount(doc.numPages))throw new Error();
        if(!stopped)setCount(doc.numPages);
        const page=await doc.getPage(pageNumber);
        const natural=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:600/Math.max(natural.width,natural.height)});
        const buffer=document.createElement('canvas');
        buffer.width=Math.ceil(viewport.width);buffer.height=Math.ceil(viewport.height);
        await page.render({canvasContext:buffer.getContext('2d')!,viewport}).promise;
        if(stopped||!canvas.current)return;
        canvas.current.width=buffer.width;canvas.current.height=buffer.height;
        canvas.current.getContext('2d')!.drawImage(buffer,0,0);
        setReady(true);setMessage('');
      }catch{if(!stopped)setMessage('Cannot preview this PDF. Choose a valid, unencrypted PDF with up to 500 pages.');}
      finally{await task?.destroy();}
    }
    void preview();
    return()=>{stopped=true;void task?.destroy();};
  },[file,pageNumber]);
  function changed(){job.current++;setOutput('');setBusy(false);}
  function typeSignature(value:string){
    changed();setName(value);
    const image=document.createElement('canvas');image.width=600;image.height=160;
    const context=image.getContext('2d')!;
    context.font='italic 64px Georgia';context.fillStyle='#142337';
    context.fillText(value,10,105,580);
    setSignature(value.trim()?image.toDataURL('image/png'):'');
  }
  async function upload(file:File|undefined){
    changed();setSignature('');setName('');
    if(!file)return;
    const id=job.current;
    try{
      if(file.size>2*1024*1024||!['image/png','image/jpeg'].includes(file.type)||await validateFileSignatures([file]))throw new Error();
      const bitmap=await createImageBitmap(file);
      try{
        if(bitmap.width*bitmap.height>4_000_000)throw new Error();
        const image=document.createElement('canvas');
        image.width=600;image.height=160;
        const scale=Math.min(600/bitmap.width,160/bitmap.height);
        image.getContext('2d')!.drawImage(bitmap,0,0,bitmap.width*scale,bitmap.height*scale);
        if(job.current===id)setSignature(image.toDataURL('image/png'));
      }finally{bitmap.close();}
    }catch{if(job.current===id)setMessage('Choose a PNG or JPEG signature under 2 MB and 4 megapixels.');}
  }
  async function save(){
    changed();const id=job.current;setBusy(true);
    const deadline=Date.now()+RESOURCE_LIMITS.processingTimeoutMs;
    const active=()=>{if(id!==job.current||Date.now()>deadline)throw new Error();};
    try{
      const pdf=await PDFDocument.load(await file.arrayBuffer());
      if(validatePageCount(pdf.getPageCount()))throw new Error();
      active();
      const page=pdf.getPage(pageNumber-1);
      const crop=page.getCropBox(),media=page.getMediaBox();
      const left=Math.max(crop.x,media.x),bottom=Math.max(crop.y,media.y);
      const w=Math.min(crop.x+crop.width,media.x+media.width)-left;
      const h=Math.min(crop.y+crop.height,media.y+media.height)-bottom;
      const angle=((page.getRotation().angle%360)+360)%360;
      if(!(w>0&&h>0)||![0,90,180,270].includes(angle)||x+width>100||y+height>100)throw new Error();
      const u=x/100,v=(y+height)/100;
      const origins:Record<number,number[]>={0:[u,1-v],90:[v,u],180:[1-u,v],270:[1-v,1-u]};
      const [px,py]=origins[angle];
      const image=await pdf.embedPng(signature);
      active();
      page.drawImage(image,{x:left+w*px,y:bottom+h*py,width:(angle%180?h:w)*width/100,height:(angle%180?w:h)*height/100,rotate:degrees(angle)});
      const bytes=await pdf.save();
      active();
      if(validateOutputSize(bytes.byteLength))throw new Error();
      if(id!==job.current)return;
      setOutput(URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'})));
      setMessage('Your signed PDF is ready.');
    }catch{if(id===job.current)setMessage('Could not add the signature. Check the page and keep the signature inside its edges.');}
    finally{if(id===job.current)setBusy(false);}
  }
  return <section aria-label="Sign PDF">
    <p role="status">{message}</p>
    <div className="option-row"><label htmlFor="signature-name">Type signature</label><input id="signature-name" maxLength={80} value={name} onChange={e=>typeSignature(e.target.value)}/></div>
    <label>Upload signature PNG or JPEG<input type="file" accept="image/png,image/jpeg" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
    <p>Or draw your signature below.</p>
    <canvas ref={pad} width={600} height={160} aria-label="Draw signature" style={{border:'1px solid #9ba8b5',maxWidth:'100%',touchAction:'none'}}
      onPointerDown={e=>{changed();drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();const c=e.currentTarget.getContext('2d')!;c.beginPath();c.moveTo((e.clientX-r.left)*600/r.width,(e.clientY-r.top)*160/r.height);}}
      onPointerMove={e=>{if(!drawing.current)return;const r=e.currentTarget.getBoundingClientRect();const c=e.currentTarget.getContext('2d')!;c.lineWidth=3;c.lineCap='round';c.lineTo((e.clientX-r.left)*600/r.width,(e.clientY-r.top)*160/r.height);c.stroke();setSignature(e.currentTarget.toDataURL('image/png'));setName('');}}
      onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}}/>
    <button className="text-button" onClick={()=>{changed();pad.current?.getContext('2d')?.clearRect(0,0,600,160);setSignature('');setName('');}}>Clear signature</button>
    <div className="option-row"><label htmlFor="sign-page">Page</label><input id="sign-page" type="number" min={1} max={count||1} value={pageNumber} onChange={e=>{changed();setPageNumber(Number(e.target.value));}}/></div>
    {([['Left',x,setX],['Top',y,setY],['Width',width,setWidth],['Height',height,setHeight]] as const).map(([label,value,setter])=><div className="option-row" key={label}><label htmlFor={'sign-'+label}>{label} (%)</label><input id={'sign-'+label} type="range" min={label==='Width'||label==='Height'?1:0} max={100} value={value} onChange={e=>{changed();setter(Number(e.target.value));}}/><span>{value}%</span></div>)}
    <div className="crop-sheet" hidden={!ready}>
      <canvas ref={canvas}/>
      {signature&&<img alt="Signature placement" src={signature} style={{position:'absolute',left:x+'%',top:y+'%',width:width+'%',height:height+'%'}}/>}
    </div>
    <p className="inline-help">The signature becomes a permanent image on this page. Existing form fields stay editable. This adds a visual signature without certificate verification. Clear all or switch tools to discard signature data.</p>
    <button className="primary-button" disabled={busy||!ready||!signature||x+width>100||y+height>100} onClick={save}>{busy?'Saving…':'Apply signature'}</button>
    {output&&<a className="primary-button" href={output} download="paperkit-signed.pdf">Download signed PDF</a>}
  </section>;
}
