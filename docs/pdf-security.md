# Local PDF password protection

## Engine decision

Use pinned `@soulehshaikh99/qpdf-wasm@0.4.1`, containing qpdf 12.4.2, instead of implementing PDF cryptography in application code. The existing pdf-lib dependency does not provide encryption/decryption. QPDF preserves PDF objects rather than rendering pages into images. Its browser WebAssembly asset is served with the application and loaded only when processing starts (about 3.25 MB uncompressed).

Reviewed the upstream build recipe, package declarations and bundled JavaScript, and tested the actual binary. Upstream: https://github.com/soulehshaikh99/qpdf-wasm. Encryption behavior: https://qpdf.readthedocs.io/en/stable/encryption.html. CLI: https://qpdf.readthedocs.io/en/stable/cli.html.

The build recipe pins qpdf commit `4eba95899886e851cc41d76886483b347612f2a8`, zlib `da607da739fa6047df13e66a2af6b8bec7c2a498`, and libjpeg-turbo `7b4993786d856cbccabfc0ed2f923ba000e326cc`. Applicable ISC, Apache-2.0, zlib, IJG and BSD notices are distributed under `public/licenses`. This software is based in part on the work of the Independent JPEG Group. npm audit covers JavaScript advisories; it does not independently audit the compiled native dependencies. The upstream prebuilt WASM is a supply-chain dependency, not a locally reproducible build attestation.

## Behavior and boundaries

Protect accepts an unencrypted PDF, uses AES-256 revision 6, and requires matching password fields (8 characters minimum, 127 UTF-8 bytes maximum; control characters rejected). User and owner passwords are the same, so the password grants full access. No separate printing/editing restrictions are advertised. Unlock requires a nonempty, valid user or owner password; empty-user-password documents still require an actual supplied password match. Password cracking, certificate encryption and password recovery are not supported.

Each operation has its own worker and in-memory filesystem. No filenames enter engine paths. Passwords are cleared from UI state when processing begins, and on clear/tool/file changes. No documents or passwords are transmitted, persisted, or logged. Native stdout/stderr are suppressed inside the worker because diagnostics and legacy encryption inspection may contain sensitive data. Files are unlinked in `finally`; the worker is terminated on success, error, cancellation, teardown and the 120-second deadline. This releases memory; JavaScript does not guarantee cryptographic erasure of every string copy.

Limits: one file, 50 MB input, 500 pages, 250 MB output, 120 seconds. The deadline can terminate synchronous native execution because it runs off the main thread. WASM memory remains subject to the engine/browser allocation limit; these limits do not guarantee a fixed peak memory budget for hostile PDFs. Existing broader hardening issue #23 remains open.

Output verification reopens the result with qpdf, checks page count and encryption parameters, requires password protection for Protect, and confirms removal of encryption for Unlock. Tests additionally open encrypted output with independent PDF.js, reject missing/wrong passwords, and check selectable text, geometry, metadata and forms. Rewriting invalidates existing digital signatures. Malformed inputs that produce qpdf warnings are rejected rather than silently repaired.
