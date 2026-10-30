# Roadmap

Priorities are provisional and may be reshuffled after validating libraries and deployment costs. Checkmarks reflect features currently implemented on `main`; partial or unverified acceptance criteria remain unchecked.

## Milestone 0 — Product and architecture
- [x] Lock product requirements: no login, no persistent file storage, upload/process/download
- [x] Decide processing model for the current tools: local browser processing
- [x] Create React/TypeScript app shell and minimalist blue/white design system
- [x] Establish unit tests, CI and dependency security audit
- [ ] Add linting, formatting and explicit dependency-license checks
- [ ] Define and verify resource limits and complete cleanup policy
- [x] Check PDF, PNG and JPEG file signatures before processing

## Milestone 1 — First usable release (P0)
- [x] Upload via drag/drop and file picker with basic type/size validation
- [x] Local browser processing and downloadable output for implemented tools
- [x] Revoke generated output URLs on replacement, clear and component teardown
- [x] Revoke partially generated split outputs when processing fails
- [ ] Add automated lifecycle tests for success, failure, cancellation and teardown
- [x] PDF preview and page thumbnails (currently capped at the first 6 pages)
- [x] Merge multiple PDFs
- [x] Reorder pages, rotate all pages, delete page ranges and extract page ranges
- [x] Split a PDF into one downloadable PDF per page
- [ ] Split using custom page ranges and package multiple outputs as a ZIP
- [ ] Complete accessibility, privacy copy, limits and error UX review
- [ ] Browser end-to-end coverage for invalid files and all tool workflows

## Milestone 2 — Common PDF tools (P1)
- [ ] Crop and resize pages
- [ ] Add watermark, page numbers, header/footer
- [ ] Compress PDF with quality presets
- [ ] Fill forms and add signatures
- [ ] Protect PDF / unlock with supplied password and authorization
- [x] Images-to-PDF
- [ ] PDF-to-images and PDF-to-text
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
- Uploaded content and generated outputs are never persisted beyond the page/job lifecycle.
- Tests cover cleanup after success, malformed files, processor errors, cancellation, timeout, and restarts where applicable.
- Resource caps prevent memory and CPU exhaustion.
- Errors are human-readable and do not expose document contents.
- Supported operations and limitations are documented, and licenses of included engines are reviewed.
