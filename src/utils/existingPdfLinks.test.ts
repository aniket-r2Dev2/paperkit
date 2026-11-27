import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFRef, degrees } from 'pdf-lib';
import { readExistingLinks, updateExistingLinks } from './existingPdfLinks';
const n = PDFName.of;
async function fixture(angle = 0) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 600]); page.setCropBox(20, 30, 300, 500); page.setRotation(degrees(angle)); pdf.addPage(); pdf.addPage();
  page.drawText('Original content', { x: 50, y: 200, size: 12 });
  const add = (props: Record<string, unknown>) => page.node.addAnnot(pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [50, 400, 150, 420], Border: [0, 0, 2], C: [1, 0, 0], ...props })));
  add({ A: { S: 'URI', URI: PDFString.of('https://example.com/original') } });
  add({ Dest: [pdf.getPage(1).ref, 'XYZ', 10, 20, 2] });
  add({ A: { S: 'GoTo', D: [pdf.getPage(2).ref, 'Fit'] } });
  add({ Dest: PDFString.of('named-target') });
  add({ A: { S: 'JavaScript', JS: PDFString.of('app.alert(1)') } });
  add({ Subtype: 'Text', Contents: PDFString.of('Keep comment') });
  return pdf;
}
describe('existing PDF link editing', () => {
  it.each([0, 90, 180, 270])('updates destinations and preserves geometry, appearance and unsupported annotations at %s degrees', async angle => {
    const pdf = await fixture(angle); const source = await pdf.save();
    const parsed = await readExistingLinks(source); expect(parsed.links).toHaveLength(3); expect(parsed.skipped).toBe(2);
    const result = await PDFDocument.load(await updateExistingLinks(source, [{ id: '1:0', url: 'https://example.com/updated' }, { id: '1:2', destination: 2 }]));
    const annots = result.getPage(0).node.Annots()!; expect(annots.size()).toBe(6);
    expect(annots.lookup(0, PDFDict).lookup(n('A'), PDFDict).lookup(n('URI'), PDFString).decodeText()).toBe('https://example.com/updated');
    expect(annots.lookup(2, PDFDict).has(n('A'))).toBe(false);
    expect(annots.lookup(2, PDFDict).lookup(n('Dest'), PDFArray).get(0).toString()).toBe(result.getPage(1).ref.toString());
    for (let i = 0; i < 6; i++) for (const key of ['Rect', 'Border', 'C']) expect(annots.lookup(i, PDFDict).get(n(key))?.toString()).toBe(pdf.getPage(0).node.Annots()!.lookup(i, PDFDict).get(n(key))?.toString());
    for (const i of [1, 3, 4, 5]) expect(annots.lookup(i, PDFDict).toString()).toBe(pdf.getPage(0).node.Annots()!.lookup(i, PDFDict).toString());
    expect(result.getPage(0).getRotation().angle).toBe(angle); expect(result.getPage(0).getCropBox()).toEqual(pdf.getPage(0).getCropBox());
  });
  it('removes multiple slots without shifting the identity of another edit', async () => {
    const source = await (await fixture()).save();
    const result = await readExistingLinks(await updateExistingLinks(source, [{ id: '1:0', remove: true }, { id: '1:1', remove: true }, { id: '1:2', destination: 1 }]));
    expect(result.links).toEqual([{ id: '1:0', page: 1, index: 0, kind: 'page', destination: 1 }]); expect(result.skipped).toBe(2);
  });
  it('does not change shared annotation dictionaries or arrays on another page', async () => {
    const pdf = await fixture(); pdf.getPage(1).node.set(n('Annots'), pdf.getPage(0).node.Annots()!);
    const result = await PDFDocument.load(await updateExistingLinks(await pdf.save(), [{ id: '1:0', url: 'https://changed.example/' }, { id: '1:1', remove: true }]));
    expect(result.getPage(0).node.Annots()!.size()).toBe(5); expect(result.getPage(1).node.Annots()!.size()).toBe(6);
    expect(result.getPage(1).node.Annots()!.lookup(0, PDFDict).lookup(n('A'), PDFDict).lookup(n('URI'), PDFString).decodeText()).toBe('https://example.com/original');
  });
  it('rejects unsafe destinations, invalid selections and cancellation', async () => {
    const source = await (await fixture()).save();
    for (const changes of [[], [{ id: '1:0', url: 'javascript:alert(1)' }], [{ id: '1:1', destination: 4 }], [{ id: '1:1', destination: 1.5 }], [{ id: '1:4', remove: true }], [{ id: '1:0' }, { id: '1:0' }]]) await expect(updateExistingLinks(source, changes)).rejects.toThrow();
    await expect(readExistingLinks(source, () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
  });
  it('skips locked and chained actions, limits imported links and fails on excessive annotation counts', async () => {
    const pdf = await fixture(); const page = pdf.getPage(0); const first = page.node.Annots()!.lookup(0, PDFDict); first.set(n('F'), pdf.context.obj(128));
    const second = page.node.Annots()!.lookup(2, PDFDict).lookup(n('A'), PDFDict); second.set(n('Next'), pdf.context.obj({ S: 'URI', URI: PDFString.of('https://example.com') }));
    expect((await readExistingLinks(await pdf.save())).links).toHaveLength(1);
    first.delete(n('F')); for (let i = 0; i < 201; i++) page.node.addAnnot(pdf.context.register(first.clone(pdf.context)));
    const read = await readExistingLinks(await pdf.save()); expect(read.links).toHaveLength(200); expect(read.skipped).toBe(6);
    const ref = page.node.Annots()!.get(0); for (let i = 0; i < 10000; i++) page.node.addAnnot(ref as PDFRef);
    await expect(readExistingLinks(await pdf.save())).rejects.toThrow('10,000');
  });
});
