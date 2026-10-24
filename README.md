# PaperKit

A minimalist, open-source PDF workspace inspired by the breadth of modern online PDF utilities.

**Product principles**
- No login, accounts, or user tracking requirement.
- Minimalist, accessible interface using LinkedIn-inspired blue and white accents, without LinkedIn branding.
- Upload → process → download. No persistent document storage.
- Process files in memory or in an isolated temporary workspace; delete temporary files automatically after completion, failure, or a short timeout.
- Build tools incrementally, with explicit limits and security checks.

## Product scope
See [FEATURES.md](FEATURES.md) and [ROADMAP.md](ROADMAP.md).

## Privacy model
PaperKit must not store uploaded documents in a database, object store, logs, analytics, or backups. Avoid logging filenames and document contents. Temporary disk use is allowed only when required by a processor, in an isolated per-job directory with strict size/time limits and guaranteed cleanup. Do not claim files never leave the device unless the selected operation genuinely runs client-side.

## Proposed stack
- Frontend: TypeScript + React + Vite
- UI: lightweight custom components, accessible controls, blue/white visual system
- PDF preview: PDF.js
- PDF manipulation: evaluate PDF-lib and/or qpdf / Ghostscript server-side based on tool requirements and licenses
- API: small stateless processing service for operations that need server-side dependencies
- Tests: Vitest + Playwright; sample PDFs with clear licensing
- Deployment: Docker-ready, self-hostable

## Development
The application will be built feature-by-feature. The initial milestone focuses on the upload/job/download lifecycle, security, and foundational page operations. See the GitHub issues for the task backlog.

## License
MIT for original PaperKit code unless dependency or engine licensing requires otherwise. Each bundled dependency and document-processing binary must be reviewed independently before distribution.
