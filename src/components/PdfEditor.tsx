import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import PdfPreview from './PdfPreview';
import { editPdf, type EditorItem } from '../utils/pdfEditor';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount } from '../utils/resourceLimits';

export default function PdfEditor({file}: {file: File}) {
  const [items,setItems]=useState<EditorItem[]>([]);
  const [history,setHistory]=useState<EditorItem[][]>([]);
  const [count,setCount]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [output,setOutput]=useState('');
  const [preview,setPreview]=useState<File|null>(null);
  const generation=useRef(0),sequence=useRef(0);
  useEffect(()=>()=>{if(output)URL.revokeObjectURL(output);},[output]);
  useEffect(()=>{
    const id=++generation.current;
    setItems([]);setHistory([]);setCount(0);setError('');setOutput('');setPreview(null);
    async function read(){try{
      if(file.size>RESOURCE_LIMITS.maxFileBytes||!file.name.toLowerCase().endsWith('.pdf')||await validateFileSignatures([file]))throw new Error();
      const pdf=await PDFDocument.load(await file.arrayBuffer());
      if(validatePageCount(pdf.getPageCount()))throw new Error();
      if(generation.current===id)setCount(pdf.getPageCount());
    }catch{if(generation.current===id)setError('Choose a valid, unencrypted PDF with up to 500 pages and no more than 50 MB.');}}
    void read();return()=>{generation.current++;};
  },[file]);
  function invalidate(){generation.current++;setOutput('');setPreview(null);setError('');setBusy(false);}
  function change(next:EditorItem[]){invalidate();setHistory(old=>[...old,items].slice(-20));setItems(next);}
  function update(id:number, values:Partial<EditorItem>){change(items.map(item=>item.id===id?{...item,...values} as EditorItem:item));}
  function base(){return {id:++sequence.current,page:1,x:10,y:10,width:40,height:10};}
  async function upload(image:File|undefined){
    if(!image)return;
    invalidate();const id=generation.current;setBusy(true);
    try{
      if(items.length>=50||image.size>2*1024*1024||!['image/png','image/jpeg'].includes(image.type)||await validateFileSignatures([image]))throw new Error();
      const bitmap=await createImageBitmap(image);
      try{if(bitmap.width*bitmap.height>4_000_000)throw new Error();}finally{bitmap.close();}
      const bytes=new Uint8Array(await image.arrayBuffer());
      if(generation.current!==id)return;
      change([...items,{...base(),height:30,kind:'image',format:image.type==='image/png'?'png':'jpg',bytes}]);
    }catch{if(generation.current===id)setError('Choose a genuine PNG or JPEG up to 2 MB and 4 megapixels.');}
    finally{if(generation.current===id)setBusy(false);}
  }
  async function save(){
    invalidate();const id=generation.current;setBusy(true);
    const deadline=Date.now()+RESOURCE_LIMITS.processingTimeoutMs;
    const active=()=>{if(id!==generation.current||Date.now()>deadline)throw new Error('Processing cancelled or timed out.');};
    try{
      const bytes=await editPdf(new Uint8Array(await file.arrayBuffer()),items,active);active();
      const result=new File([bytes as BlobPart],'paperkit-edited.pdf',{type:'application/pdf'});
      setPreview(result);setOutput(URL.createObjectURL(result));
    }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Could not edit this PDF.');}
    finally{if(id===generation.current)setBusy(false);}
  }
  return <section aria-label="Text and image editor">
    <p>Add new text and images over existing pages. This does not edit or remove existing PDF text, and is not a redaction tool. Digital signatures will be invalidated.</p>
    <p className="inline-help">Up to 50 overlays. Text uses Helvetica, one line up to 200 characters; size fits its box (6–144 pt). Images retain their proportions inside the box. Coordinates are percentages from the visible page’s top-left. Preview shows the actual exported result.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="option-row"><button type="button" disabled={!count||busy||items.length>=50} onClick={()=>change([...items,{...base(),kind:'text',text:'New text'}])}>Add text</button><label>Add image PNG or JPEG<input type="file" accept="image/png,image/jpeg" disabled={!count||busy||items.length>=50} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label><button type="button" disabled={busy||!history.length} onClick={()=>{invalidate();setItems(history[history.length-1]);setHistory(history.slice(0,-1));}}>Undo last change</button></div>
    {items.map((item,index)=><fieldset key={item.id} disabled={busy} className="editor-item"><legend>{item.kind==='text'?'Text':'Image'} overlay {index+1}</legend>
      {item.kind==='text'&&<label>Text<input aria-label={`Overlay ${index+1} text`} maxLength={200} value={item.text} onChange={e=>update(item.id,{text:e.target.value})}/></label>}
      {(['page','x','y','width','height'] as const).map(key=><label key={key}>{({page:'Page',x:'Left (%)',y:'Top (%)',width:'Width (%)',height:'Height (%)'})[key]}<input aria-label={`Overlay ${index+1} ${key}`} type="number" min={key==='page'?1:key==='width'||key==='height'?0.1:0} max={key==='page'?count:100} step={key==='page'?1:0.1} value={item[key]} onChange={e=>update(item.id,{[key]:Number(e.target.value)})}/></label>)}
      <button type="button" onClick={()=>change(items.filter(entry=>entry.id!==item.id))}>Remove overlay {index+1}</button>
    </fieldset>)}
    <p className="inline-help">Processing stays on this device. Undo retains the last 20 changes until you clear files or switch tools. Later overlays are drawn on top of earlier ones.</p>
    <button className="primary-button" disabled={busy||!count||!items.length} onClick={save}>{busy?'Preparing preview…':'Preview edited PDF'}</button>
    {busy&&<button className="text-button" onClick={()=>{invalidate();setError('Processing cancelled.');}}>Cancel editing</button>}
    {preview&&<PdfPreview file={preview}/>}
    {output&&<><p role="status">Edited PDF verified. Review the preview before downloading.</p><a className="primary-button" href={output} download="paperkit-edited.pdf">Download edited PDF</a></>}
  </section>;
}
