import { useEffect, useRef, useState } from 'react';
import { passwordError, type SecurityMode } from '../utils/pdfSecurity';
import { runSecurityJob } from '../utils/securityJob';
import { validateFileSignatures } from '../utils/fileValidation';
import { RESOURCE_LIMITS } from '../utils/resourceLimits';

export default function PdfSecurity({ file, mode }: { file: File; mode: SecurityMode }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const job = useRef<AbortController | null>(null);
  useEffect(() => {
    setPassword(''); setConfirmation(''); setOutput(''); setError(''); setBusy(false);
    return () => { job.current?.abort(); job.current = null; };
  }, [file, mode]);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output); }, [output]);
  function cancel() {
    job.current?.abort(); job.current = null;
    setPassword(''); setConfirmation(''); setBusy(false); setError('Processing cancelled.');
  }
  async function process() {
    setOutput(''); setError('');
    const invalid = passwordError(mode, password, confirmation);
    if (invalid) { setError(invalid); return; }
    const controller = new AbortController(); job.current = controller;
    setBusy(true);
    const secret = password;
    setPassword(''); setConfirmation('');
    try {
      if (file.size > RESOURCE_LIMITS.maxFileBytes || !/\.pdf$/i.test(file.name) || await validateFileSignatures([file])) throw new Error('Choose a valid PDF no larger than 50 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await runSecurityJob(bytes, mode, secret, controller.signal);
      if (job.current !== controller) return;
      setOutput(URL.createObjectURL(new Blob([result as BlobPart], { type: 'application/pdf' })));
      result.fill(0);
    } catch (caught) {
      if (job.current === controller) setError(caught instanceof Error ? caught.message : 'Could not process this PDF.');
    } finally {
      if (job.current === controller) { job.current = null; setBusy(false); }
    }
  }
  return <section aria-label="PDF password security">
    <p>{mode === 'protect' ? 'Add AES-256 password protection. Keep your password safe: PaperKit cannot recover it.' : 'Remove encryption using the correct password for a PDF you are authorized to unlock.'}</p>
    <p className="inline-help">Processing stays on this device. One PDF, up to 50 MB and 500 pages. Passwords are never saved and are cleared when processing starts. Rewriting a PDF invalidates existing digital signatures.</p>
    <div className="option-row"><label htmlFor="pdf-password">{mode === 'protect' ? 'New password' : 'PDF password'}</label><input id="pdf-password" type="password" autoComplete="off" spellCheck={false} disabled={busy} value={password} onChange={event => { setOutput(''); setError(''); setPassword(event.target.value); }}/></div>
    {mode === 'protect' && <><div className="option-row"><label htmlFor="pdf-confirm-password">Confirm password</label><input id="pdf-confirm-password" type="password" autoComplete="off" spellCheck={false} disabled={busy} value={confirmation} onChange={event => { setOutput(''); setError(''); setConfirmation(event.target.value); }}/></div><p className="inline-help">Use a long, unique password: at least 8 characters, up to 127 UTF-8 bytes.</p></>}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Processing and verifying your PDF…</p>}
    <div className="work-actions"><button className="primary-button" disabled={busy} onClick={process}>{mode === 'protect' ? 'Protect PDF' : 'Unlock PDF'}</button>{busy && <button className="text-button" onClick={cancel}>Cancel processing</button>}</div>
    {output && <><p role="status">{mode === 'protect' ? 'Password protection verified.' : 'Encryption removed and output verified.'}</p><a className="primary-button" href={output} download={`paperkit-${mode === 'protect' ? 'protected' : 'unlocked'}.pdf`}>Download {mode === 'protect' ? 'protected' : 'unlocked'} PDF</a></>}
  </section>;
}
