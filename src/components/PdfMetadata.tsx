import { useEffect, useRef, useState } from 'react';
import { PDFDocument, PDFName } from 'pdf-lib';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from '../utils/resourceLimits';

const propertyNames = ['title', 'author', 'subject', 'keywords'] as const;
type Properties = Record<typeof propertyNames[number], string>;
const emptyProperties: Properties = {title:'', author:'', subject:'', keywords:''};

export default function PdfMetadata({file}: {file: File}) {
  const [properties,setProperties] = useState(emptyProperties);
  const [saved,setSaved] = useState<Properties|null>(null);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(true);
  const [message,setMessage] = useState('Reading document properties…');
  const [output,setOutput] = useState('');
  const job = useRef(0);
  useEffect(()=>()=>{if(output)URL.revokeObjectURL(output);},[output]);
  useEffect(()=>{
    const id=++job.current;
    setReady(false);
    setBusy(true);
    async function read(){
      try {
        if(file.size>RESOURCE_LIMITS.maxFileBytes||await validateFileSignatures([file]))throw new Error('Choose a supported PDF under 50 MB.');
        const pdf=await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false});
        const limit=validatePageCount(pdf.getPageCount());
        if(limit)throw new Error(limit);
        const values={title:pdf.getTitle()||'',author:pdf.getAuthor()||'',subject:pdf.getSubject()||'',keywords:pdf.getKeywords()||''};
        if(id!==job.current)return;
        setProperties(values);
        // Info and XMP can disagree. Keep both intact until XMP editing is supported.
        if(pdf.catalog.has(PDFName.of('Metadata'))){
          setMessage('This PDF also contains XMP metadata. Its document properties are shown below; editing this format is not yet supported.');
          return;
        }
        setReady(true);
        setMessage('Edit the properties below. Empty values clear that property.');
      }catch{
        if(id===job.current)setMessage('Cannot read this PDF. Choose an unencrypted PDF with up to 500 pages and no more than 50 MB.');
      }finally{if(id===job.current)setBusy(false);}
    }
    void read();
    return()=>{job.current++;};
  },[file]);
  async function save(){
    const id=++job.current;
    setBusy(true);setOutput('');setSaved(null);
    const deadline=Date.now()+RESOURCE_LIMITS.processingTimeoutMs;
    const active=()=>{if(id!==job.current||Date.now()>deadline)throw new Error();};
    try{
      if(propertyNames.some(key=>properties[key].length>2000))throw new Error();
      const pdf=await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false});
      active();
      pdf.setTitle(properties.title);
      pdf.setAuthor(properties.author);
      pdf.setSubject(properties.subject);
      pdf.setKeywords([properties.keywords]);
      const bytes=await pdf.save();
      active();
      if(validateOutputSize(bytes.byteLength))throw new Error();
      const reopened=await PDFDocument.load(bytes,{updateMetadata:false});
      active();
      const result={title:reopened.getTitle()||'',author:reopened.getAuthor()||'',subject:reopened.getSubject()||'',keywords:reopened.getKeywords()||''};
      if(propertyNames.some(key=>result[key]!==properties[key]))throw new Error();
      setSaved(result);
      setOutput(URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'})));
      setMessage('Properties verified in the completed PDF.');
    }catch{
      if(id===job.current)setMessage('Could not save these properties. Keep each value within 2,000 characters and try again.');
    }finally{if(id===job.current)setBusy(false);}
  }
  return <section aria-label="PDF properties">
    <p role="status">{message}</p>
    {propertyNames.map(key=><div className="option-row" key={key}>
      <label htmlFor={'metadata-'+key}>{key[0].toUpperCase()+key.slice(1)}</label>
      <input id={'metadata-'+key} maxLength={2000} disabled={busy||!ready} value={properties[key]} onChange={event=>{
        setOutput('');setSaved(null);setProperties(current=>({...current,[key]:event.target.value}));
      }}/>
    </div>)}
    <p className="inline-help">Up to 2,000 characters per property. Unicode text is supported. These properties describe the document. Clear all or switch tools to discard entered values. Processing stays on this device.</p>
    <button className="primary-button" disabled={busy||!ready} onClick={save}>{busy?'Working…':'Save properties'}</button>
    {saved&&<dl aria-label="Saved properties">{propertyNames.map(key=><div key={key}><dt>{key}</dt><dd>{saved[key]||'(empty)'}</dd></div>)}</dl>}
    {output&&<a className="primary-button" href={output} download="paperkit-metadata.pdf">Download updated PDF</a>}
  </section>;
}
