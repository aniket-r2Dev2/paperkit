# Feature Inventory

This is a broad capability inventory based on the supplied Sejda homepage capture and follow-up requirements. A check mark means planned/inventory item, not implemented.

## Core platform and privacy
- [ ] Minimalist blue/white responsive UI, navigation, searchable tool catalogue
- [ ] No login/accounts/authentication
- [ ] Drag-and-drop and file-picker upload
- [ ] File/type/signature validation, limits, progress/error states
- [ ] Stateless job processing and download responses
- [ ] Automatic cleanup of temporary files on every exit path
- [ ] Privacy-safe logging, rate limits, resource limits, abuse protection
- [ ] Accessible keyboard and screen-reader experience
- [ ] Local/dev Docker setup, CI, security/dependency review, tests

## Merge and organize
- [ ] Merge PDFs and images into one PDF
- [ ] Visual combine/reorder/organize pages
- [ ] Alternate & mix pages from multiple PDFs
- [ ] Rotate pages
- [ ] Delete selected pages
- [ ] Extract selected pages
- [ ] Split by page ranges / every page
- [ ] Split in half
- [ ] Split by file size (best-effort with documented constraints)
- [ ] Split by bookmarks
- [ ] Split by text (needs text extraction/OCR fallback)
- [ ] Create PDF bookmarks / outline
- [ ] Rename output based on text (optional batch operation)

## Edit and sign
- [ ] PDF page preview and thumbnails
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
- [ ] Images to PDF
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
