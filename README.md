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
- Merge multiple PDFs
- Rotate all pages in a PDF
- Extract and delete page ranges (example: `1-3, 5`)
- Reorder pages in a PDF
- Split a PDF into one downloadable PDF per page
- Convert PNG/JPEG images to PDF
- Local PDF preview (up to the first 6 pages)
- Drag-and-drop upload, file picker, file removal, output download and responsive layout
- Extension/MIME validation plus PDF, PNG and JPEG file-signature checks
- Configurable client-side resource caps: 20 files, 50 MB per file, 200 MB total input, 500 pages per PDF (500 pages total for merge), and 250 MB generated output
- Cooperative cancellation at processing checkpoints and a 2-minute processing deadline; cancellation cannot interrupt a PDF library call already in progress
- Unit tests, dependency security audit and browser smoke tests in CI

This is an initial functional slice, not full Sejda feature parity. Some limitations remain, including deeper structural PDF validation, custom-range splitting, selected-page rotation and full end-to-end coverage. See [FEATURES.md](FEATURES.md) and [ROADMAP.md](ROADMAP.md).

## Development
Requires Node.js 20+.

```bash
npm install
npm run dev
npm test
npm run build
```

## Privacy model
The prototype does not send selected files to a PaperKit server or persist them. Local processing still consumes browser memory and runs in the current page. To reduce accidental browser exhaustion, the prototype limits sessions to 20 files and 200 MB total input (50 MB per file), caps PDF operations at 500 pages per PDF (and 500 pages total for merge), caps generated output at 250 MB, and applies a 2-minute processing deadline. Cancellation is cooperative between processing steps; an active PDF-Lib operation cannot be forcibly interrupted. Users can clear the session to release generated object URLs. More complex future operations should preserve local processing where practical; clearly disclose any unavoidable temporary server-side processing. Never use a database or object store for document retention. Avoid logging filenames, file contents, extracted text, or passwords.

## Proposed stack
- TypeScript + React + Vite
- PDF-Lib for initial page operations
- PDF.js for future page previews
- Vitest + browser automation for tests
- Self-hostable deployment

## Licensing
Original PaperKit code is provided under the MIT License. Review each dependency's license and any external processing engine before bundling or distribution.
