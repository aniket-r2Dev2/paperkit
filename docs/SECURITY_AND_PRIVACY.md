# Security and Privacy

- Never use a persistent database, object storage, CDN, or analytics platform to retain user documents.
- Uploads may be processed in memory or in a per-job temporary directory when required.
- Temporary files must be deleted on success, exceptions, cancellation, timeout, and worker startup cleanup.
- Apply file size, page count, decompression, CPU, memory, disk, and concurrency limits.
- Treat PDFs and Office documents as untrusted input. Keep processing engines patched and sandboxed.
- Do not use filenames as filesystem paths. Generate cryptographically random job IDs and safe output names.
- Do not log file bytes, extracted text, passwords, document metadata, or user filenames.
- Do not allow user-controlled URLs to be fetched by HTML-to-PDF processing without SSRF safeguards.
- Password-based operations must not bypass access controls. Unlock only when a user provides the required password and is authorized.
- Retention policy: output is available only for the active response/job; temporary artifacts expire quickly. Explain any unavoidable transit time to users.
- Use HTTPS in deployment, secure headers, strict CORS, rate limits, CSRF protections where relevant, and least-privilege workers.
- Avoid the claim “files never leave your device” if processing is server-side.
