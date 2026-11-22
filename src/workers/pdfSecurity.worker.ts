import createModule from '@soulehshaikh99/qpdf-wasm';
import wasmUrl from '@soulehshaikh99/qpdf-wasm/dist/qpdf.wasm?url';
import { transformPdf, type SecurityMode } from '../utils/pdfSecurity';

// The upstream build binds stdout/stderr to console at instantiation. Suppress
// both within this disposable worker; never forward native diagnostics.
console.log = () => {};
console.warn = () => {};
console.error = () => {};
self.onmessage = async (event: MessageEvent<{bytes: Uint8Array; mode: SecurityMode; password: string}>) => {
  const request = event.data;
  try {
    const qpdf = await createModule({ locateFile: () => wasmUrl });
    const bytes = transformPdf(qpdf, request.bytes, request.mode, request.password);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch {
    // Engine diagnostics may include document data. Keep the public error fixed.
    self.postMessage({ error: 'Could not process this PDF. Check the password, choose the correct tool, and use a valid PDF with 1–500 pages. Already encrypted PDFs must be unlocked before protection.' });
  } finally {
    request.password = '';
    request.bytes.fill(0);
    self.close();
  }
};
