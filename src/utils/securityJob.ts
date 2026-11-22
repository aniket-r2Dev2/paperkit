import { RESOURCE_LIMITS } from './resourceLimits';
import type { SecurityMode } from './pdfSecurity';

export function runSecurityJob(bytes: Uint8Array, mode: SecurityMode, password: string, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { bytes.fill(0); reject(new Error('Processing cancelled.')); return; }
    const worker = new Worker(new URL('../workers/pdfSecurity.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); worker.terminate(); };
    const fail = (message: string) => { cleanup(); reject(new Error(message)); };
    const cancel = () => fail('Processing cancelled.');
    const timer = setTimeout(() => fail('Processing took too long. Try a smaller or simpler PDF.'), RESOURCE_LIMITS.processingTimeoutMs);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = event => { event.preventDefault(); fail('The PDF processor could not run. Please try again.'); };
    worker.onmessage = event => {
      const {bytes: output, error} = event.data;
      cleanup();
      if (output instanceof Uint8Array && output.length) resolve(output);
      else reject(new Error(error || 'The PDF processor could not complete the operation.'));
    };
    try { worker.postMessage({bytes, mode, password}, [bytes.buffer as ArrayBuffer]); }
    catch { bytes.fill(0); fail('The PDF processor could not start.'); }
  });
}
