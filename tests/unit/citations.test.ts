import { describe,it,expect } from 'vitest';
import { importText } from '../../packages/legislation/src/import-text.ts';
import { normalizeSource,VersionedSourceStore } from '../../packages/legislation/src/provision-tree.ts';
import type { ImportedPdf } from '../../packages/legislation/src/import-pdf.ts';
import { resolveCitation,resolveVersionedCitation,locateDisplayedCitation,publicCitationInspector } from '../../packages/legislation/src/citations.ts';
const enc=new TextEncoder();
describe('LM-013 immutable pinned citations',()=>{
  it('resolves an exact quote and never leaks source file paths',async()=>{
    const imported=await importText(enc.encode('Section 1 The toy agency files a copy.'),{format:'text',name:'toy.txt'});
    const document=normalizeSource('v1',imported);
    const anchor={versionId:'v1',sourceDigest:document.sourceDigest,provisionId:document.provisions[0]!.id,quote:'toy agency files'};
    const resolved=resolveCitation(document,anchor,{published:true,officialSourceUrl:'https://www.govinfo.gov/content/pkg/ABC/ABC.pdf'});
    expect(resolved.status).toBe('resolved');
    expect(resolved.excerpt).toContain('toy agency files');
    expect(resolved.officialLink).toBe('https://www.govinfo.gov/content/pkg/ABC/ABC.pdf');
    const inspector=publicCitationInspector(resolved);
    expect(JSON.stringify(inspector)).not.toContain('toy.txt');
    expect(JSON.stringify(inspector)).not.toContain('originalBytes');
    expect(()=>resolveCitation(document,anchor)).toThrow('CITATION_PUBLICATION_NOT_AUTHORIZED');
  });
  it('reports an exact quote changed instead of repairing it by fuzzy matching',async()=>{
    const imported=await importText(enc.encode('Section 1 Source text.'),{format:'text',name:'toy.txt'});
    const doc=normalizeSource('v1',imported);
    const anchor={versionId:'v1',sourceDigest:doc.sourceDigest,provisionId:doc.provisions[0]!.id,quote:'Source text'};
    const altered={...doc,provisions:[{...doc.provisions[0]!,text:'Source wording changed.'}]};
    expect(resolveCitation(altered,anchor,{published:true})).toMatchObject({status:'stale',diagnostic:'EXACT_QUOTE_CHANGED',officialLink:null});
    expect(resolveCitation({...doc,sourceDigest:'b'.repeat(64)},anchor,{published:true})).toMatchObject({status:'stale',diagnostic:'SOURCE_DIGEST_CHANGED'});
  });
  it('resolves old pinned citations even when a new version changes displayed numbering',async()=>{
    const store=new VersionedSourceStore();
    const old=normalizeSource('v1',await importText(enc.encode('Section 1 Original'),{format:'text',name:'toy.txt'}));
    const newer=normalizeSource('v2',await importText(enc.encode('Section 4 Changed'),{format:'text',name:'toy.txt'}));
    store.put(old);store.put(newer);
    const anchor={versionId:'v1',sourceDigest:old.sourceDigest,provisionId:old.provisions[0]!.id,quote:'Original'};
    expect(resolveVersionedCitation(store,anchor,{published:true}).status).toBe('resolved');
    expect(resolveCitation(newer,anchor,{published:true})).toMatchObject({status:'unavailable',diagnostic:'SOURCE_VERSION_UNAVAILABLE'});
    expect(resolveVersionedCitation(new VersionedSourceStore(),anchor,{published:true}).status).toBe('unavailable');
  });
  it('does not claim a unique link for duplicate displayed section numbers',async()=>{
    const doc=normalizeSource('v1',await importText(enc.encode('Section 1 One\nSection 1 Two'),{format:'text',name:'toy.txt'}));
    expect(locateDisplayedCitation(doc,'1')).toEqual({status:'ambiguous',provisionId:null});
    expect(locateDisplayedCitation(doc,'999')).toEqual({status:'missing',provisionId:null});
  });
  it('only exposes official HTTPS links with no embedded credentials; anchors PDF page fragments',()=>{
    const pdf:ImportedPdf={name:'secret-case.pdf',sourceDigest:'a'.repeat(64),originalBytes:new Uint8Array([0]),
      pages:[{page:3,objectId:42,text:'Hypothetical notice',quality:'extracted-unverified',diagnostics:[]}],diagnostics:[]};
    const doc=normalizeSource('v1',pdf);
    const anchor={versionId:'v1',sourceDigest:pdf.sourceDigest,provisionId:'pdf-page-3',quote:'Hypothetical'};
    for(const candidate of ['file:///Users/private/law.pdf','http://www.govinfo.gov/file.pdf',
      'https://evil.example/file.pdf','https://www.govinfo.gov/file.pdf?api_key=SECRET']){
      expect(resolveCitation(doc,anchor,{published:true,officialSourceUrl:candidate}).officialLink).toBe(null);
    }
    expect(resolveCitation(doc,anchor,{published:true,officialSourceUrl:'https://www.govinfo.gov/file.pdf'}).officialLink)
      .toBe('https://www.govinfo.gov/file.pdf#page=3');
  });
  it('rejects malformed version identifiers and empty quote inputs',async()=>{
    const doc=normalizeSource('v1',await importText(enc.encode('Section 1 Source'),{format:'text',name:'toy.txt'}));
    expect(()=>resolveCitation(doc,{versionId:'../',sourceDigest:'a'.repeat(64),provisionId:'x',quote:'x'},{published:true})).toThrow('CITATION_INVALID_ANCHOR');
    expect(()=>resolveCitation(doc,{versionId:'v1',sourceDigest:doc.sourceDigest,provisionId:'x',quote:''},{published:true})).toThrow('CITATION_INVALID_ANCHOR');
  });
});
