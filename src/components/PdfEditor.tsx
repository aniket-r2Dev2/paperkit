import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import PdfPreview from './PdfPreview';
import { editPdf, type EditorItem, type MarkupKind } from '../utils/pdfEditor';
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
  function addMarkup(kind:MarkupKind){change([...items,{...base(),kind,height:kind==='strike'?5:20,color:kind==='highlight'?'#ffff00':'#e02020',opacity:kind==='highlight'?0.35:1,thickness:2}]);}
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
    <p>Add text, images, shapes, highlights, strike-through, links and comments over existing pages. Markups become permanent page graphics, not editable PDF comments. This does not edit or remove existing PDF text, and is not a redaction tool. Digital signatures will be invalidated.</p>
    <p className="inline-help">Up to 50 overlays. Text uses Helvetica, one line up to 200 characters; size fits its box (6–144 pt). Images retain their proportions inside the box. Coordinates are percentages from the visible page’s top-left. Preview shows the actual exported result.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="option-row"><button type="button" disabled={!count||busy||items.length>=50} onClick={()=>change([...items,{...base(),kind:'text',text:'New text'}])}>Add text</button><label>Add image PNG or JPEG<input type="file" accept="image/png,image/jpeg" disabled={!count||busy||items.length>=50} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label><button type="button" disabled={busy||!history.length} onClick={()=>{invalidate();setItems(history[history.length-1]);setHistory(history.slice(0,-1));}}>Undo last change</button></div>
    <div className="option-row">{(['rectangle','ellipse','highlight','strike'] as const).map(kind=><button key={kind} type="button" disabled={!count||busy||items.length>=50} onClick={()=>addMarkup(kind)}>Add {kind==='strike'?'strike-through':kind}</button>)}</div>
    <div className="option-row"><button type="button" disabled={!count||busy||items.length>=50} onClick={()=>change([...items,{...base(),kind:'web-link',url:''}])}>Add web link</button><button type="button" disabled={!count||busy||items.length>=50} onClick={()=>change([...items,{...base(),kind:'page-link',destination:1}])}>Add page link</button></div>
    <div className="option-row"><button type="button" disabled={!count||busy||items.length>=50} onClick={()=>change([...items,{...base(),kind:'comment',text:'',author:''}])}>Add comment</button></div>
    <p className="inline-help">Comments are editable sticky notes in supporting PDF viewers. Enter up to 2000 characters and an optional author. The 22 pt note icon must fit inside the page. The canvas preview does not display comment icons or text; open the download in a PDF viewer to review them. Existing comments are preserved but are not loaded into these controls.</p>
    <p className="inline-help">Links use a blue outlined area in the exported PDF. Use HTTP/HTTPS URLs or a destination page. Preview shows placement; open the download in a PDF viewer to follow links. Existing links are preserved; this editor changes only links added in this session.</p>
    <p className="inline-help">Highlights use translucent color; strike-through runs through the center of its box. Shapes are outlines. Position and size them with the fields below, then preview. Existing text remains selectable.</p>
    {items.map((item,index)=><fieldset key={item.id} disabled={busy} className="editor-item"><legend>{({text:'Text',image:'Image',rectangle:'Rectangle',ellipse:'Ellipse',highlight:'Highlight',strike:'Strike-through','web-link':'Web link','page-link':'Page link',comment:'Comment'})[item.kind]} overlay {index+1}</legend>
      {item.kind==='comment'&&<><label>Comment<textarea aria-label={`Overlay ${index+1} comment`} maxLength={2000} rows={4} value={item.text} onChange={e=>update(item.id,{text:e.target.value})}/></label><label>Author (optional)<input aria-label={`Overlay ${index+1} author`} maxLength={100} value={item.author} onChange={e=>update(item.id,{author:e.target.value})}/></label></>}
      {item.kind==='text'&&<label>Text<input aria-label={`Overlay ${index+1} text`} maxLength={200} value={item.text} onChange={e=>update(item.id,{text:e.target.value})}/></label>}
      {item.kind==='web-link'&&<label>Destination URL<input aria-label={`Overlay ${index+1} URL`} type="url" maxLength={2048} placeholder="https://example.com" value={item.url} onChange={e=>update(item.id,{url:e.target.value})}/></label>}
      {item.kind==='page-link'&&<label>Destination page<input aria-label={`Overlay ${index+1} destination`} type="number" min={1} max={count} value={item.destination} onChange={e=>update(item.id,{destination:Number(e.target.value)})}/></label>}
      {'color' in item&&<><label>Color<input aria-label={`Overlay ${index+1} color`} type="color" value={item.color} onChange={e=>update(item.id,{color:e.target.value})}/></label><label>Opacity<input aria-label={`Overlay ${index+1} opacity`} type="number" min={0.05} max={1} step={0.05} value={item.opacity} onChange={e=>update(item.id,{opacity:Number(e.target.value)})}/></label>{item.kind!=='highlight'&&<label>Line thickness (pt)<input aria-label={`Overlay ${index+1} thickness`} type="number" min={0.5} max={12} step={0.5} value={item.thickness} onChange={e=>update(item.id,{thickness:Number(e.target.value)})}/></label>}</>}
      {(['page','x','y','width','height'] as const).filter(key=>item.kind!=='comment'||(key!=='width'&&key!=='height')).map(key=><label key={key}>{({page:'Page',x:'Left (%)',y:'Top (%)',width:'Width (%)',height:'Height (%)'})[key]}<input aria-label={`Overlay ${index+1} ${key}`} type="number" min={key==='page'?1:key==='width'||key==='height'?0.1:0} max={key==='page'?count:100} step={key==='page'?1:0.1} value={item[key]} onChange={e=>update(item.id,{[key]:Number(e.target.value)})}/></label>)}
      <button type="button" onClick={()=>change(items.filter(entry=>entry.id!==item.id))}>Remove overlay {index+1}</button>
    </fieldset>)}
    <p className="inline-help">Processing stays on this device. Undo retains the last 20 changes until you clear files or switch tools. Later overlays are drawn on top of earlier ones.</p>
    <button className="primary-button" disabled={busy||!count||!items.length} onClick={save}>{busy?'Preparing preview…':'Preview edited PDF'}</button>
    {busy&&<button className="text-button" onClick={()=>{invalidate();setError('Processing cancelled.');}}>Cancel editing</button>}
    {preview&&<PdfPreview file={preview}/>}
    {output&&<><p role="status">Edited PDF verified. Review the preview before downloading.</p><a className="primary-button" href={output} download="paperkit-edited.pdf">Download edited PDF</a></>}
  </section>;
}
