# Feature Inventory

This inventory distinguishes capabilities currently implemented on `main` from planned parity work. A check mark means implemented at a basic level, not that every production acceptance criterion has been verified.

## Core platform and privacy
- [x] Minimalist blue/white responsive UI and tool cards
- [x] No login/accounts/authentication
- [x] Drag-and-drop and file-picker upload
- [ ] Searchable tool catalogue
- [x] Basic file type/extension and per-file size validation
- [ ] Validate PDF/image signatures and deeply malformed files before processing
- [x] Local browser processing and downloadable output for implemented tools
- [ ] Complete cleanup verification for every success/failure/cancel path
- [ ] Privacy-safe logging, rate limits, resource limits and abuse protection (no server processing today)
- [ ] Full keyboard/screen-reader audit
- [x] CI, unit tests and dependency security audit
- [ ] Explicit dependency-license checks and lint/format checks
- [ ] Browser E2E coverage (homepage, merge and split smoke tests being added)

## Merge and organize
- [x] Merge multiple PDFs into one PDF
- [ ] Merge PDFs and images together in one operation
- [x] Reorder pages in a PDF
- [ ] Visual combine/reorder across multiple PDFs in a single page organizer
- [ ] Alternate & mix pages from multiple PDFs
- [x] Rotate all pages in a PDF
- [ ] Rotate selected pages only
- [x] Delete selected page ranges
- [x] Extract selected page ranges
- [x] Split into a separate PDF per page
- [ ] Split by custom page ranges / ZIP multiple outputs
- [ ] Split in half
- [ ] Split by file size (best-effort with documented constraints)
- [ ] Split by bookmarks
- [ ] Split by text (needs text extraction/OCR fallback)
- [ ] Create PDF bookmarks / outline
- [ ] Rename output based on text (optional batch operation)

## Edit and sign
- [x] PDF page preview and thumbnails (first 6 pages)
- [ ] Selectable page thumbnails for targeted operations
- [ ] Add text and image overlays
- [ ] Annotations, highlights, strike-through, shapes and links
- [ ] Fill existing AcroForm fields
- [ ] Add signature by draw/type/upload
- [ ] Create fillable forms
- [ ] Remove annotations
- [ ] Add headers and footers
- [ ] Add page numbers and Bates numbering
- [ ] Watermarks
- [ ] Edit metadata
- [ ] Flatten form fields/annotations

## Compress, scan and security
- [ ] Compression presets and image-quality/resolution controls
- [ ] Deskew scanned PDF pages
- [ ] OCR scanned documents to searchable PDF/text
- [ ] Protect/encrypt PDF with password
- [ ] Unlock/remove password only where the user supplies a valid password and has authorization
- [ ] Repair/rewrite damaged PDFs (best-effort)
- [ ] Grayscale conversion
- [ ] Remove/flatten annotations

## Convert from PDF
- [ ] PDF to text
- [ ] PDF to images (PNG/JPG/TIFF; selected pages and resolution)
- [ ] PDF to Word (DOCX)
- [ ] PDF to Excel/CSV
- [ ] PDF to PowerPoint
- [ ] Extract embedded images

## Convert to PDF
- [x] PNG/JPEG images to PDF
- [ ] Word to PDF
- [ ] HTML/web page to PDF (secure renderer and SSRF controls required)

## Page layout and utility tools
- [ ] Crop pages
- [ ] Resize page dimensions and margins/padding
- [ ] Flip pages
- [ ] N-up / multiple pages per sheet
- [ ] Grayscale
- [ ] Header/footer
- [ ] Create/edit bookmarks
- [ ] Edit metadata
- [ ] Remove annotations
- [ ] Repair
- [ ] Batch operations

## Future / evaluate separately
- [ ] Desktop/offline wrapper
- [ ] Workflow presets / chained jobs
- [ ] Optional client-side processing for supported operations
- [ ] More languages and internationalization
- [ ] Optional OCR language packs
- [ ] Advanced office conversion parity (depends on external engines)
