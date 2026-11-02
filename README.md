# PaperKit

> **⚠️ LEGAL NOTICE — LAWFUL USE ONLY**
>
> **Use PaperKit only for lawful and authorized purposes. Do not use this project to commit, facilitate, or conceal any illegal activity, or to infringe another person's rights. You are solely responsible for how you use this software and for ensuring that your use complies with all applicable laws. To the maximum extent permitted by law, the repository owner and contributors disclaim responsibility and liability for misuse of this project or for consequences arising from its use. This notice does not limit any rights or obligations that cannot legally be excluded.**
>
A minimalist, open-source PDF workspace inspired by the breadth of modern online PDF utilities.

## Product principles
- No login, accounts, user profiles, or authentication wall.
- Minimalist, accessible interface with LinkedIn-inspired blue and white accents, without LinkedIn branding.
- Upload → process → download.
- No persistent document storage. The initial tools process entirely in your browser using PDF-Lib; files and generated outputs remain in page memory.
- Clear files and revoke output object URLs when the user clears the session.

## Current prototype
- Merge PDFs, PNGs and JPG/JPEGs in one document, with reorder/remove controls before processing
- Rotate all pages in a PDF
- Extract and delete page ranges (example: `1-3, 5`)
- Reorder pages in a PDF
- Split every page into individual PDFs, or split custom ranges such as `1-3, 5, 8-10` into separate PDFs
- Download split results individually or as a single local ZIP archive (STORE/no compression, no extra dependency)
- Convert PNG/JPEG images to PDF
- Export PDF pages as PNG/JPEG at 72, 150, 200, or 300 DPI; select page ranges and download individually or as ZIP
- Compress PDFs with three presets (preserve quality, balanced or small file) and show exact before/after size and percentage saved; keep the original if no improvement is found
- Local PDF preview (up to the first 6 pages)
- Drag-and-drop upload, file picker, file removal, output download and responsive layout
- Extension/MIME validation plus PDF, PNG and JPEG file-signature checks
- Configurable client-side resource caps: 20 files, 50 MB per file, 200 MB total input, 500 pages per PDF (500 pages total for merge), and 250 MB generated output. Splitting is limited to 100 outputs per job, and the ZIP file must also fit within 250 MB.
- Cooperative cancellation at processing checkpoints and a 2-minute processing deadline; cancellation cannot interrupt a PDF library call already in progress
- Unit tests, dependency security audit and browser smoke tests in CI

This is an initial functional slice, not full Sejda feature parity. Some limitations remain, including deeper structural PDF validation, selected-page rotation, TIFF export and full end-to-end coverage. See [FEATURES.md](FEATURES.md) and [ROADMAP.md](ROADMAP.md).

## Merge PDF usage
Choose **Merge PDF** and add PDF, PNG or JPG/JPEG files in any combination. Files are merged **top to bottom**; use the up/down arrows to change their order or remove a file before processing. Each PDF contributes all its pages, and every supported image adds one page. Images retain their original pixel dimensions as PDF points (no automatic A4 resizing). The combined document is limited to **500 pages**. For safety, each image is limited to **40 megapixels** and **14,400 pixels per side**. Files are signature-checked before processing; unreadable images and PDFs show actionable errors. All processing stays local to your browser.

## Split PDF usage
Choose **Split PDF** and pick **Every page** or **Custom page ranges**. In custom mode, each comma-separated item becomes its own PDF: `1-3, 5, 8-10` produces three PDFs containing pages 1–3, 5, and 8–10. Overlapping, reversed and out-of-range segments are rejected. Download an individual PDF or all outputs as a ZIP. The ZIP is created locally in your browser and retains PDF bytes without additional compression.

## PDF to Images usage
Choose **PDF to Images**, upload **one PDF**, select **PNG** (lossless) or **JPEG** (quality 90%), and set the resolution to **72, 150, 200, or 300 DPI**. Export all pages or specify page numbers/ranges such as `1-3, 5`. A single selected page downloads directly; multiple pages can be downloaded individually or together as a local ZIP archive. Outputs are ordered by page number; repeated page references are deduplicated.

Limits: up to **100 exported pages**, a **250 MB** combined image/ZIP output cap, **16 megapixels** and **8192 pixels per side** per rendered page. Use lower DPI or a smaller page range if a limit is reached. Password-protected PDFs are not currently supported. TIFF export and configurable JPEG quality are future enhancements. Rendering happens locally using PDF.js and browser canvas; no file uploads or document persistence. Generated object URLs are revoked on output replacement, clear, and teardown. PDF.js renders may be canceled between or during page operations.

## PDF to Text usage

Choose one PDF and leave the range blank for all pages, or enter a range such as `2-3, 5`. Download a UTF-8 text file with form-feed separators between selected pages. Reading order depends on the embedded text layer. Blank or scanned pages retain their position, and an entirely textless selection explains that scans need OCR. Password-protected PDFs are unsupported. Processing and downloads stay local.

## Compress PDF usage

Choose **Compress PDF**, upload one PDF, and select a preset:

- **Preserve quality (structural rewrite):** use PDF-Lib object stream serialization to attempt reducing PDF structure without deliberately rasterizing content. **A reduction is not guaranteed.** This processing is not a bit-for-bit identity transformation; existing digital signatures may become invalid if the document is rewritten.
- **Balanced:** render pages locally to JPEG at **144 DPI**, **76%** quality and reassemble as a PDF.
- **Small file:** render pages locally to JPEG at **96 DPI**, **55%** quality and reassemble as a PDF.

**Important:** Balanced and Small file **flatten the pages** when they yield a smaller PDF. Searchable/selectable text, annotations, forms, links, accessibility tags, editable PDF objects and existing digital signatures are not retained. Image detail may visibly degrade. Preserve quality is safer for editable documents, although rewriting may still affect specialized PDF features or digital signatures. Password-protected PDFs are not supported.

The workspace shows the **original file size, actual output size and percentage saved**. If a preset produces an equal or larger file, PaperKit **retains the original bytes**, reports **0% saved**, and explains that the document could not be reduced with that preset. It never claims savings where none occurred.

All processing runs locally using existing PDF-Lib/PDF.js and browser canvas, without sending documents to a server or introducing extra dependencies. Limits: **50 MB** source file, **250 MB** candidate output, **up to 500 pages** for structural rewriting or **100 pages** for raster compression, **16 megapixels / 8192 pixels per side** for rasterization, and the existing **2-minute cooperative processing deadline**. Render work can be cancelled during page processing, but an active PDF-Lib operation cannot be forcibly stopped. Temporary canvases and output links are released after use/reset/teardown; full lifecycle verification is tracked separately.

## Development
Requires Node.js 20+.

```bash
npm install
npm run dev
npm test
npm run build
```

## Privacy model
The prototype does not send selected files to a PaperKit server or persist them. Local processing still consumes browser memory and runs in the current page. To reduce accidental browser exhaustion, the prototype limits sessions to 20 files and 200 MB total input (50 MB per file), caps PDF operations at 500 pages per PDF (and 500 pages total for merge), caps generated output at 250 MB, and applies a 2-minute processing deadline. Cancellation is cooperative between processing steps; an active PDF-Lib operation cannot be forcibly interrupted. Users can clear the session to release generated PDF and ZIP object URLs. These links are also revoked when an output is replaced or the page is closed. More complex future operations should preserve local processing where practical; clearly disclose any unavoidable temporary server-side processing. Never use a database or object store for document retention. Avoid logging filenames, file contents, extracted text, or passwords.

## Proposed stack
- TypeScript + React + Vite
- PDF-Lib for initial page operations
- PDF.js for future page previews
- Vitest + browser automation for tests
- Self-hostable deployment

## Licensing
Original PaperKit code is provided under the MIT License. Review each dependency's license and any external processing engine before bundling or distribution.
