# Product Requirements

## Confirmed decisions
1. **No login:** no account creation, sign in, OAuth, user profiles, or authentication wall.
2. **Minimalist visual design:** lots of whitespace, crisp typography, restrained icons, white/near-white surfaces, and LinkedIn-inspired blue accents (e.g. deep blue and light blue). Do not use LinkedIn's logo or imply affiliation.
3. **No persistent document storage:** upload a file, run the selected operation, download output, and discard working data.
4. **Privacy-first defaults:** no document content in logs or analytics; avoid retaining filenames and metadata unnecessarily.
5. **Incremental delivery:** define and complete one issue at a time.

## Required upload/process/download lifecycle
- Accept files by drag-and-drop and file picker.
- Validate extension, MIME type, magic bytes where feasible, file size, page count, and operation-specific constraints.
- Show clear upload/progress/success/error states.
- Process one job with a generated random job identifier that does not expose filenames.
- Return outputs as downloadable attachments; support multiple outputs as a ZIP where relevant.
- Delete temporary files and job state on success, failure, cancellation, or timeout.
- Configure a short maximum job lifetime and a periodic cleanup sweep for orphaned temporary workspaces.
- Do not persist uploads or outputs to a database, object storage, or CDN.
- Do not put user files in application logs, error traces, analytics, or crash reports.
- Add tests for cleanup on success, errors, cancellation, and worker restarts.
- Add clear limits and a privacy notice to the UI.
- Avoid promising “client-side only” unless the operation actually executes in the browser.

## Design principles
- Simple single-purpose tool pages; obvious primary action; clear file size/type constraints.
- White canvas, subtle neutral borders, accessible contrast, blue primary CTA, muted blue interaction states.
- Responsive layout, keyboard navigation, visible focus indicators, reduced-motion respect.
- No dark-pattern upsells, forced registration, or cluttered navigation.

## Non-goals for initial release
- User accounts, cloud file libraries, cross-device history, saved jobs, persistent recent files.
- Social sign-in or LinkedIn integration.
- Persistent object storage for uploaded documents.
