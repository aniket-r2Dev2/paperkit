# Roadmap

Priorities are provisional and may be reshuffled after validating libraries and deployment costs.

## Milestone 0 — Product and architecture
- [ ] Lock product requirements: no login, no persistent file storage, upload/process/download
- [ ] Decide client-side versus server-side processing per tool
- [ ] Create React/TypeScript app shell and minimalist blue/white design system
- [ ] Establish linting, formatting, tests, CI, dependency/license checks
- [ ] Define file limits, job lifecycle, temp directory and cleanup policy

## Milestone 1 — First usable release (P0)
- [ ] Upload and validate files; drag/drop and file picker
- [ ] Stateless job API and safe downloadable output
- [ ] Automatic cleanup on success/failure/cancel/timeout/restart
- [ ] PDF preview and page thumbnails
- [ ] Merge PDFs
- [ ] Reorder, rotate, delete, extract pages
- [ ] Split by page ranges
- [ ] Accessibility, privacy copy, limits and error UX

## Milestone 2 — Common PDF tools (P1)
- [ ] Crop and resize pages
- [ ] Add watermark, page numbers, header/footer
- [ ] Compress PDF with quality presets
- [ ] Fill forms and add signatures
- [ ] Protect PDF / unlock with supplied password and authorization
- [ ] Images-to-PDF, PDF-to-images, PDF-to-text
- [ ] Edit basic metadata and create bookmarks

## Milestone 3 — Editing, scans and advanced organization (P2)
- [ ] Add text/image overlays, annotations and links
- [ ] Flatten forms/annotations; remove annotations
- [ ] Alternate/mix and split-by-bookmarks
- [ ] OCR and deskew with language-pack strategy
- [ ] Grayscale, flip, N-up, Bates numbering, split-in-half
- [ ] Repair and split-by-text best-effort workflows

## Milestone 4 — Conversion breadth (P3)
- [ ] Evaluate Word/Excel/PowerPoint conversion engines, fidelity and licensing
- [ ] HTML-to-PDF with sandbox and SSRF controls
- [ ] Batch workflows and multiple-output ZIP downloads
- [ ] Optional desktop/offline mode
- [ ] Internationalization and additional OCR languages

## Release gates
- Uploaded content and generated outputs are never persisted beyond the job lifecycle.
- Tests cover cleanup after success, malformed files, processor errors, cancellation, timeout, and restarts.
- Resource caps prevent memory, CPU, and disk exhaustion.
- Errors are human-readable and do not expose server paths or document contents.
- Supported operations and limitations are documented, and licenses of included engines are reviewed.
