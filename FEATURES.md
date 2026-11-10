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
- [x] Browser E2E smoke coverage for homepage, PDF merge, mixed PDF/image merge, input order/removal, malformed file handling, split-per-page, custom split ranges, PDF-to-images PNG/JPEG export, compression presets, and ZIP downloads

## Merge and organize
- [x] Merge multiple PDFs into one PDF
- [x] Merge PDFs and images together in one operation (up to 500 total pages)
- [x] Reorder pages in a PDF
- [ ] Visual combine/reorder across multiple PDFs in a single page organizer
- [ ] Alternate & mix pages from multiple PDFs
- [x] Rotate all pages in a PDF
- [ ] Rotate selected pages only
- [x] Delete selected page ranges
- [x] Extract selected page ranges
- [x] Split into a separate PDF per page
- [x] Split by custom page ranges / ZIP multiple outputs (up to 100 PDFs, 250 MB)
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
- [x] Fill existing AcroForm text, checkbox and radio fields with editable or flattened downloads
- [x] Add signature by draw/type/upload with position and size controls
- [ ] Create fillable forms
- [ ] Remove annotations
- [x] Add headers and footers
- [x] Add page numbers
- [ ] Bates numbering
- [x] Text watermarks
- [ ] Edit metadata
- [ ] Flatten form fields/annotations

## Compress, scan and security
- [x] Compression presets: preserve quality, balanced (144 DPI/JPEG 76%), small file (96 DPI/JPEG 55%), plus before/after size and honest no-growth fallback
- [ ] Preserve searchable text, form fields and links while compressing embedded images (raster presets flatten pages)
- [ ] Deskew scanned PDF pages
- [ ] OCR scanned documents to searchable PDF/text
- [ ] Protect/encrypt PDF with password
- [ ] Unlock/remove password only where the user supplies a valid password and has authorization
- [ ] Repair/rewrite damaged PDFs (best-effort)
- [ ] Grayscale conversion
- [ ] Remove/flatten annotations

## Convert from PDF
- [x] PDF to UTF-8 text (all or selected pages, local download)
- [x] PDF to images (PNG/JPEG, selected pages, 72–300 DPI, local ZIP)
- [ ] PDF to images in TIFF format
- [ ] PDF to Word (DOCX)
- [ ] PDF to Excel/CSV
- [ ] PDF to PowerPoint
- [ ] Extract embedded images

## Convert to PDF
- [x] PNG/JPEG images to PDF
- [ ] Word to PDF
- [ ] HTML/web page to PDF (secure renderer and SSRF controls required)

## Page layout and utility tools
- [x] Crop all or selected pages using visual margins and a local preview
- [x] Resize pages to standard or custom dimensions with proportional fit and centered padding
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
