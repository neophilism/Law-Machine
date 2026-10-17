import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { verifyOfficialExcerptSnapshots } from '../../packages/legislation/src/official-excerpts.ts';
import { assessApplicability, validateBaseline, type Baseline } from '../../packages/legislation/src/baselines.ts';

const fixture=()=>JSON.parse(readFileSync(new URL('../../content/packs/federal-claims-excerpt-baseline.json', import.meta.url),'utf8')) as {
  notice:string;sources:Record<string,unknown>[];baseline:Baseline;
};
describe('LM-014 pinned federal source excerpt inventory',()=>{
 it('verifies verbatim UTF-8 excerpt hashes, not publisher authenticity or complete originals',async()=>{
   const f=fixture(); const r=await verifyOfficialExcerptSnapshots(f.sources);
   expect(r).toEqual({excerptIntegrityValid:true,publisherAuthenticated:false,fullOriginalBytesVerified:false,diagnostics:[]});
   expect(validateBaseline(f.baseline)).toEqual([]);
   expect(f.baseline.sources.map(s=>s.digest)).toEqual(f.sources.map(s=>s.excerptSha256));
 });
 it('fails closed when a letter of curated source text changes',async()=>{
   const f=fixture();f.sources[0]!.excerpt+=' tampered';
   const r=await verifyOfficialExcerptSnapshots(f.sources);
   expect(r.excerptIntegrityValid).toBe(false);
   expect(r.diagnostics.map(x=>x.code)).toContain('EXCERPT_DIGEST_MISMATCH');
 });
 it('does not treat a hostile lookalike host as official',async()=>{
   const f=fixture();f.sources[0]!.sourceUrl='https://www.ecfr.gov.attacker.example/claims';
   expect((await verifyOfficialExcerptSnapshots(f.sources)).diagnostics.map(x=>x.code)).toContain('UNTRUSTED_SOURCE_LOCATOR');
 });
 it('rejects duplicate excerpts and poisoned nonrecords',async()=>{
   const f=fixture();f.sources.push({...f.sources[0]});
   expect((await verifyOfficialExcerptSnapshots(f.sources)).diagnostics.map(x=>x.code)).toContain('DUPLICATE_EXCERPT');
   f.sources.push(null as never);
   expect((await verifyOfficialExcerptSnapshots(f.sources)).diagnostics.map(x=>x.code)).toContain('INVALID_EXCERPT');
 });
 it('keeps legal coverage explicitly unknown with only curated excerpts',()=>{
   const f=fixture();
   expect(assessApplicability({id:'p',status:'enacted',effectiveOn:'2020-01-01'},'2026-10-16',{baseline:f.baseline}))
    .toMatchObject({state:'unknown',reasons:['BASELINE_SOURCE_GAP']});
 });
 it('rejects corrupted source records and conflicting duplicate pinned identities',()=>{
   const f=fixture(); const b=f.baseline;
   expect(validateBaseline({...b,sources:[null as never]})).toContain('INVALID_SOURCE_SCOPE');
   expect(validateBaseline({...b,sources:[...b.sources,b.sources[0]!]})).toContain('DUPLICATE_BASELINE_SOURCE');
 });
 it('does not accept a transition that ends before its effective date',()=>{
   expect(()=>assessApplicability({id:'p',status:'enacted',effectiveOn:'2026-08-01',transitionEndsOn:'2026-07-01'},'2026-09-01')).toThrow('INVALID_TEMPORAL_INPUT');
 });
});
