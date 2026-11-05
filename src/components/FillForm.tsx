import { useEffect, useRef, useState } from 'react';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, StandardFonts } from 'pdf-lib';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from '../utils/resourceLimits';

type Field = { name: string; kind: 'text' | 'check' | 'radio'; value: string | boolean; options?: string[]; maxLength?: number };
export default function FillForm({ file }: { file: File }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [message, setMessage] = useState('Reading form fields…');
  const [busy, setBusy] = useState(true);
  const [output, setOutput] = useState('');
  const [flatten, setFlatten] = useState(false);
  const job = useRef(0);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output); }, [output]);
  useEffect(() => {
    const id = ++job.current;
    async function load() {
      try {
        if (!/\.pdf$/i.test(file.name) || file.size > RESOURCE_LIMITS.maxFileBytes) throw new Error();
        if (await validateFileSignatures([file])) throw new Error();
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        const limit = validatePageCount(pdf.getPageCount());
        if (limit) throw new Error(limit);
        const form = pdf.getForm();
        if (form.hasXFA()) throw new Error('XFA forms are unsupported. Choose a standard PDF form.');
        const all = form.getFields();
        if (all.length > 200) throw new Error('This tool supports up to 200 form fields.');
        const supported: Field[] = [];
        for (const field of all) {
          if (field.isReadOnly()) continue;
          if (field instanceof PDFTextField && !field.isRichFormatted() && !field.isFileSelector()) supported.push({
            name: field.getName(), kind: 'text', value: field.getText() || '', maxLength: field.getMaxLength(),
          });
          if (field instanceof PDFCheckBox) supported.push({name: field.getName(), kind: 'check', value: field.isChecked()});
          if (field instanceof PDFRadioGroup) supported.push({name: field.getName(), kind: 'radio', value: field.getSelected() || '', options: field.getOptions()});
        }
        if (job.current !== id) return;
        setFields(supported);
        setMessage(supported.length ? 'Edit the supported fields below. Other fields retain their values.' : 'No editable text, checkbox or radio fields were found.');
      } catch {
        if (job.current === id) setMessage('Cannot read this form. Choose an unencrypted standard PDF with at most 500 pages and 200 fields.');
      } finally {
        if (job.current === id) setBusy(false);
      }
    }
    void load();
    return () => { job.current++; };
  }, [file]);

  async function save() {
    const id = ++job.current;
    const deadline = Date.now() + RESOURCE_LIMITS.processingTimeoutMs;
    setOutput('');
    setBusy(true);
    const active = () => { if (job.current !== id || Date.now() > deadline) throw new Error(); };
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      active();
      const form = pdf.getForm();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const field of fields) {
        active();
        if (field.kind === 'text') {
          // Validate encoding without exposing the user's value in an error.
          font.encodeText(String(field.value));
          form.getTextField(field.name).setText(String(field.value));
        } else if (field.kind === 'check') {
          const target = form.getCheckBox(field.name);
          if (field.value) target.check(); else target.uncheck();
        } else {
          const target = form.getRadioGroup(field.name);
          if (field.value) target.select(String(field.value)); else target.clear();
        }
      }
      form.updateFieldAppearances(font);
      if (flatten) form.flatten();
      const bytes = await pdf.save();
      active();
      if (validateOutputSize(bytes.byteLength)) throw new Error();
      setOutput(URL.createObjectURL(new Blob([bytes as BlobPart], {type:'application/pdf'})));
      setMessage('Your completed form is ready to download.');
    } catch {
      if (job.current === id) setMessage('Could not save this form. Text must use characters supported by Helvetica (most Western European text). Check field lengths or try a simpler PDF.');
    } finally {
      if (job.current === id) setBusy(false);
    }
  }
  function update(index: number, value: string | boolean) {
    setOutput('');
    setFields(current => current.map((field, i) => i === index ? {...field, value} : field));
  }
  return <section aria-label="Fill form">
    <p role="status">{message}</p>
    {fields.map((field, index) => <div className="option-row" key={field.name}>
      <label htmlFor={'form-field-'+index}>{field.name}</label>
      {field.kind === 'text' && <textarea id={'form-field-'+index} disabled={busy} maxLength={field.maxLength} value={String(field.value)} onChange={event=>update(index,event.target.value)}/>}
      {field.kind === 'check' && <input id={'form-field-'+index} disabled={busy} type="checkbox" checked={Boolean(field.value)} onChange={event=>update(index,event.target.checked)}/>}
      {field.kind === 'radio' && <select id={'form-field-'+index} disabled={busy} value={String(field.value)} onChange={event=>update(index,event.target.value)}>
        <option value="">No selection</option>{field.options?.map(option=><option key={option}>{option}</option>)}
      </select>}
    </div>)}
    {fields.length > 0 && <>
      <label><input type="checkbox" disabled={busy} checked={flatten} onChange={event=>{setOutput('');setFlatten(event.target.checked);}}/> Flatten all form fields in the downloaded PDF</label>
      <p className="inline-help">Leave this off to keep fields editable. Flattening makes their current values permanent page content. Processing stays on this device. Clear all to discard the form and entered values.</p>
      <button className="primary-button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save filled PDF'}</button>
      {output && <a className="primary-button" href={output} download="paperkit-filled.pdf">Download filled PDF</a>}
    </>}
  </section>;
}
