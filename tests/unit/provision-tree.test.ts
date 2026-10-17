import { describe,it,expect } from 'vitest';
import { importText } from '../../packages/legislation/src/import-text.ts';
import { importLegislativeXML } from '../../packages/legislation/src/import-xml.ts';
import type { ImportedPdf } from '../../packages/legislation/src/import-pdf.ts';
import { normalizeSource,serializeSource,parseStoredSource,VersionedSourceStore,publishExplorer } from '../../packages/legislation/src/provision-tree.ts';
const enc=new TextEncoder();
const source='Section 1 Intro\n(a) A "term" means something under § 7.\nSection 2 Another\n(a) Apply.';
describe('LM-012 stable provision tree and persistence',()=>{
  it('retains displayed numbering, parent links, line anchors and candidates',async()=>{
    const imported=await importText(enc.encode(source),{format:'text',name:'toy.txt'});
    const out=normalizeSource('toy-v1',imported);
    expect(out.format).toBe('text');
    expect(out.provisions.map(p=>p.citation)).toEqual(['1','a','2','a']);
    expect(out.provisions[1]!.parentId).toBe(out.provisions[0]!.id);
    expect(out.provisions[3]!.parentId).toBe(out.provisions[2]!.id);
    expect(out.provisions[1]!.proposedDefinitions).toContain('term');
    expect(out.provisions[1]!.proposedCrossRefs).toContain('§ 7');
    expect(out.provisions[2]!.span).toEqual({kind:'line',start:3,end:3});
    expect(out.provisions[1]!.sourceDigest).toBe(imported.sourceDigest);
  });
  it('does not overwrite prior version when text or displayed numbering changes',async()=>{
    const store=new VersionedSourceStore();
    const old=normalizeSource('toy-v1',await importText(enc.encode(source),{format:'text',name:'toy.txt'}));
    store.put(old);store.put(old);
    const amended=normalizeSource('toy-v2',await importText(enc.encode(source.replace('Section 2','Section 4')),{format:'text',name:'toy.txt'}));
    store.put(amended);
    expect(store.versions()).toEqual(['toy-v1','toy-v2']);
    expect(store.get('toy-v1')!.provisions[2]!.citation).toBe('2');
    expect(store.get('toy-v2')!.provisions[2]!.citation).toBe('4');
    expect(()=>store.put({...amended,versionId:'toy-v1'})).toThrow('VERSION_IMMUTABLE');
    expect(parseStoredSource(serializeSource(old))).toEqual(old);
  });
  it('detects duplicate sibling numbering without silently deduplicating',async()=>{
    const doc=await importText(enc.encode('Section 1 First\nSection 1 Another'),{format:'text',name:'toy.txt'});
    const out=normalizeSource('toy-v1',doc);
    expect(out.diagnostics.map(x=>x.code)).toContain('DUPLICATE_SECTION_LABEL');
    expect(()=>publishExplorer(out,true)).toThrow('SOURCE_STRUCTURE_INVALID');
  });
  it('rejects missing source parents and preserves XML source offsets',async()=>{
    const xml='<bill xmlns="http://xml.house.gov/schemas/uslm/1.0"><main><section id="s1"><num>1</num><content>Text.</content><subsection id="s1a"><num>(a)</num><content>Clause.</content></subsection></section></main></bill>';
    const imported=await importLegislativeXML(enc.encode(xml),{name:'toy.xml'});
    const altered={...imported,provisions:imported.provisions.map(p=>p.id==='s1a'?{...p,parentId:'missing'}:p)};
    const out=normalizeSource('toy-v1',altered);
    expect(out.provisions[1]!.span.kind).toBe('utf16-offset');
    expect(out.diagnostics.map(x=>x.code)).toContain('MISSING_PARENT');
  });
  it('keeps scanned/low-confidence pages explicitly unverified and private source bytes unpublished',()=>{
    const imported:ImportedPdf={name:'private.pdf',originalBytes:new Uint8Array([1,2,3]),sourceDigest:'a'.repeat(64),
      pages:[{page:1,objectId:2,text:'',quality:'scanned-or-image',diagnostics:['SCANNED_OR_IMAGE_ONLY']}],diagnostics:[]};
    const out=normalizeSource('toy-pdf-v1',imported);
    expect(out.provisions[0]!.status).toBe('unresolved');
    expect(out.diagnostics.map(d=>d.code)).toContain('PDF_SOURCE_REQUIRES_REVIEW');
    expect(()=>publishExplorer(out,false)).toThrow('PUBLICATION_NOT_AUTHORIZED');
    const released=publishExplorer(out,true);
    expect(JSON.stringify(released)).not.toContain('originalBytes');
    expect(JSON.stringify(released)).not.toContain('private.pdf');
  });
  it('rejects malformed persistence before exposing a source',()=>{
    expect(()=>parseStoredSource('{"bad":true}')).toThrow('STORED_SOURCE_INVALID');
    expect(()=>parseStoredSource('{broken')).toThrow('STORED_SOURCE_INVALID');
  });
});
