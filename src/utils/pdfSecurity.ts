import type { QpdfInstance } from '@soulehshaikh99/qpdf-wasm';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from './resourceLimits';

export type SecurityMode = 'protect' | 'unlock';
export function passwordError(mode: SecurityMode, password: string, confirmation = password): string | null {
  if (!password.length) return 'Enter a password.';
  if (/[\u0000-\u001f\u007f]/u.test(password)) return 'Passwords cannot contain control characters.';
  if (new TextEncoder().encode(password).length > 127) return 'Use a password of at most 127 UTF-8 bytes.';
  if (mode === 'protect' && [...password].length < 8) return 'Use at least 8 characters for your new password.';
  if (mode === 'protect' && password !== confirmation) return 'The passwords do not match.';
  return null;
}

// Only generated, fixed paths enter the in-memory filesystem. Never log qpdf output:
// legacy encryption inspection can include a recovered password.
export function transformPdf(qpdf: QpdfInstance, bytes: Uint8Array, mode: SecurityMode, password: string): Uint8Array {
  const paths = ['/input.pdf', '/output.pdf', '/inspect.json'];
  const run = (args: string[]) => { if (qpdf.callMain(args) !== 0) throw new Error('Unable to process this PDF. Check the password and use a valid, supported PDF.'); };
  const inspect = (path: string, secret: string) => {
    run([path, `--password=${secret}`, '--json', '--json-key=encrypt', '--json-key=pages', '/inspect.json']);
    const info = JSON.parse(new TextDecoder().decode(qpdf.FS.readFile('/inspect.json')));
    qpdf.FS.unlink('/inspect.json');
    const error = validatePageCount(info.pages?.length);
    if (error) throw new Error(error);
    return { count: info.pages.length as number, encryption: info.encrypt };
  };
  try {
    const invalid = passwordError(mode, password);
    if (invalid) throw new Error(invalid);
    if (!bytes.length || bytes.length > RESOURCE_LIMITS.maxFileBytes) throw new Error('Choose a PDF no larger than 50 MB.');
    qpdf.FS.writeFile('/input.pdf', bytes);
    const before = inspect('/input.pdf', mode === 'unlock' ? password : '');
    if (mode === 'protect' && before.encryption.encrypted) throw new Error('This PDF is already encrypted. Unlock it first.');
    if (mode === 'unlock' && !before.encryption.encrypted) throw new Error('This PDF is not encrypted.');
    // An empty user password can open an owner-restricted PDF even with a wrong
    // supplied password. Require an actual match, not merely a successful read.
    if (mode === 'unlock' && !before.encryption.userpasswordmatched && !before.encryption.ownerpasswordmatched) throw new Error('The password is incorrect.');
    const options = mode === 'protect'
      ? ['--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--']
      : [`--password=${password}`, '--decrypt'];
    run(['/input.pdf', ...options, '/output.pdf']);
    const output = qpdf.FS.readFile('/output.pdf');
    const sizeError = validateOutputSize(output.byteLength);
    if (sizeError || !output.length) throw new Error(sizeError || 'The generated PDF is empty.');
    const after = inspect('/output.pdf', mode === 'protect' ? password : '');
    if (after.count !== before.count) throw new Error('Output verification failed.');
    if (mode === 'protect') {
      const enc = after.encryption;
      if (!enc.encrypted || !enc.userpasswordmatched || enc.parameters.bits !== 256 || enc.parameters.R !== 6 || qpdf.callMain(['/output.pdf', '--requires-password']) !== 0) throw new Error('Encryption verification failed.');
    } else if (after.encryption.encrypted) throw new Error('Decryption verification failed.');
    return output.slice();
  } finally {
    bytes.fill(0);
    for (const path of paths) { try { qpdf.FS.unlink(path); } catch { /* May not exist on an error path. */ } }
  }
}
