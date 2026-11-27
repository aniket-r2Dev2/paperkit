import { PDFDocument, PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, PDFString, PDFHexString } from 'pdf-lib';
import { validateLinkUrl } from './pdfEditor';
import { RESOURCE_LIMITS, validatePageCount, validateOutputSize } from './resourceLimits';

export type ExistingLink = { id: string; page: number; index: number } & ({ kind: 'web'; url: string } | { kind: 'page'; destination: number });
export type LinkChange = { id: string; remove?: boolean; url?: string; destination?: number };
const name = PDFName.of;
const MAX_LINKS = 200;

function scan(pdf: PDFDocument, active: () => void) {
  const links: ExistingLink[] = [];
  let skipped = 0, scanned = 0;
  const pages = pdf.getPages();
  const pageNumbers = new Map(pages.map((p, i) => [p.ref.toString(), i + 1]));
  pages.forEach((page, pageIndex) => {
    active();
    const annots = page.node.Annots();
    if (!annots) return;
    for (let index = 0; index < annots.size(); index++) {
      if (++scanned > 10000) throw new Error('This PDF has too many annotations to inspect (maximum 10,000).');
      active();
      const entry = annots.lookup(index);
      if (!(entry instanceof PDFDict) || entry.get(name('Subtype'))?.toString() !== '/Link') continue;
      const base = { id: `${pageIndex + 1}:${index}`, page: pageIndex + 1, index };
      try {
        const flags = entry.lookup(name('F'));
        if (entry.has(name('AA')) || (flags instanceof PDFNumber && (flags.asNumber() & (64 | 128 | 512)))) throw new Error();
        const action = entry.lookup(name('A'));
        if (action && (!(action instanceof PDFDict) || action.has(name('Next')) || entry.has(name('Dest')))) throw new Error();
        let link: ExistingLink;
        if (action instanceof PDFDict && action.get(name('S'))?.toString() === '/URI') {
          // IsMap changes URI interpretation; leave such actions intact.
          if (action.has(name('IsMap'))) throw new Error();
          const uri = action.lookup(name('URI'));
          if (!(uri instanceof PDFString || uri instanceof PDFHexString)) throw new Error();
          const url = uri.decodeText();
          validateLinkUrl(url);
          link = { ...base, kind: 'web', url };
        } else {
          if (action && (!(action instanceof PDFDict) || action.get(name('S'))?.toString() !== '/GoTo')) throw new Error();
          const dest = action instanceof PDFDict ? action.lookup(name('D')) : entry.lookup(name('Dest'));
          if (!(dest instanceof PDFArray) || !(dest.get(0) instanceof PDFRef)) throw new Error();
          const destination = pageNumbers.get(dest.get(0).toString());
          if (!destination) throw new Error();
          link = { ...base, kind: 'page', destination };
        }
        if (links.length >= MAX_LINKS) throw new Error();
        links.push(link);
      } catch { skipped++; }
    }
  });
  return { links, skipped, pageCount: pages.length };
}

async function load(source: Uint8Array, active: () => void) {
  if (source.length > RESOURCE_LIMITS.maxFileBytes) throw new Error('Choose a PDF no larger than 50 MB.');
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  active();
  const error = validatePageCount(pdf.getPageCount());
  if (error) throw new Error(error);
  return pdf;
}
export async function readExistingLinks(source: Uint8Array, active: () => void = () => {}) {
  return scan(await load(source, active), active);
}
export async function updateExistingLinks(source: Uint8Array, changes: LinkChange[], active: () => void = () => {}) {
  if (!changes.length || changes.length > MAX_LINKS) throw new Error('Change between 1 and 200 links.');
  const pdf = await load(source, active);
  const original = scan(pdf, active);
  const byId = new Map(original.links.map(link => [link.id, link]));
  const seen = new Set<string>();
  // Descending indexes keep source annotation identities stable during removal.
  const ordered = changes.map(change => {
    const link = byId.get(change.id);
    if (!link || seen.has(change.id)) throw new Error('Invalid or duplicate link selection.');
    seen.add(change.id);
    return { change, link };
  }).sort((a, b) => b.link.page - a.link.page || b.link.index - a.link.index);
  for (const { change, link } of ordered) {
    active();
    const page = pdf.getPage(link.page - 1);
    const annotations = page.node.Annots()!;
    // Copy the annotation array and edited dictionary. PDFs can share these objects
    // across pages; editing one occurrence must not change another occurrence.
    const local = annotations.clone(pdf.context);
    page.node.set(name('Annots'), local);
    if (change.remove) { local.remove(link.index); continue; }
    const annotation = local.lookup(link.index, PDFDict).clone(pdf.context);
    if (link.kind === 'web') {
      const url = validateLinkUrl(change.url ?? link.url);
      annotation.set(name('A'), pdf.context.obj({ S: 'URI', URI: PDFString.of(url) }));
    } else {
      const destination = change.destination ?? link.destination;
      if (!Number.isInteger(destination) || destination < 1 || destination > original.pageCount) throw new Error(`Choose a destination page from 1 to ${original.pageCount}.`);
      annotation.delete(name('A'));
      annotation.set(name('Dest'), pdf.context.obj([pdf.getPage(destination - 1).ref, 'Fit']));
    }
    local.set(link.index, pdf.context.register(annotation));
  }
  const bytes = await pdf.save(); active();
  const error = validateOutputSize(bytes.length); if (error) throw new Error(error);
  const verified = await load(bytes, active);
  if (verified.getPageCount() !== original.pageCount) throw new Error('Output verification failed.');
  // Verify destinations and removal counts using indexes adjusted for deleted slots.
  for (const { change, link } of ordered) {
    const removed = ordered.filter(item => item.link.page === link.page && item.change.remove);
    const beforeCount = pdf.getPage(link.page - 1).node.Annots()!.size();
    const annots = verified.getPage(link.page - 1).node.Annots()!;
    if (annots.size() !== beforeCount) throw new Error('Link verification failed.');
    if (change.remove) continue;
    const index = link.index - removed.filter(item => item.link.index < link.index).length;
    const annotation = annots.lookup(index, PDFDict);
    if (link.kind === 'web') {
      const uri = annotation.lookup(name('A'), PDFDict).lookup(name('URI'), PDFString).decodeText();
      if (uri !== validateLinkUrl(change.url ?? link.url)) throw new Error('Link verification failed.');
    } else if (annotation.lookup(name('Dest'), PDFArray).get(0).toString() !== verified.getPage((change.destination ?? link.destination) - 1).ref.toString()) throw new Error('Link verification failed.');
  }
  return bytes;
}
