# PaperKit

A minimalist, open-source PDF workspace inspired by the breadth of modern online PDF utilities.

## Product principles
- No login, accounts, user profiles, or authentication wall.
- Minimalist, accessible interface with LinkedIn-inspired blue and white accents, without LinkedIn branding.
- Upload → process → download.
- No persistent document storage. The initial tools process entirely in your browser using PDF-Lib; inputs and generated blobs are held in page memory only.
- Clear all files and revoke output object URLs when the user clears the session.

## Current prototype
- Merge PDFs
- Rotate all pages in a PDF
- Extract pages by ranges (for example `1-3, 5`)
- Convert PNG and JPG/JPEG images to PDF
- Drag-and-drop upload, file picker, file removal, output download, mobile responsive layout
- 50 MB per-file limit in this prototype

This is an initial functional slice, not full Sejda feature parity. The planned catalogue is in [FEATURES.md](FEATURES.md), with phased delivery in [ROADMAP.md](ROADMAP.md).

## Development
Requires Node.js 20+.

```bash
npm install
npm run dev
npm test
npm run build
```

## Privacy model
The prototype does not send selected files to a PaperKit server or persist them. Local processing still consumes browser memory and runs in the current page. Users can clear the session to release generated object URLs. More complex future operations must retain this model: choose browser-side processing or explain any unavoidable temporary server processing honestly. Never use a database or object store for document retention. Avoid logging filenames, file contents, extracted text, or passwords.

## Proposed stack
- TypeScript + React + Vite
- PDF-Lib for the initial page operations
- PDF.js for future page previews
- Vitest + browser automation for tests
- Self-hostable deployment

## Licensing
Original PaperKit code is provided under the MIT License. Review each dependency's license and any external processing engine before bundling or distribution.
