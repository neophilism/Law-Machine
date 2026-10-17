import {describe,it,expect} from 'vitest';
import {importText} from '../../packages/legislation/src/import-text.ts';
import {normalizeSource,VersionedSourceStore} from '../../packages/legislation/src/provision-tree.ts';
import {resolveVersionedCitation} from '../../packages/legislation/src/citations.ts';
import {diffSourceVersions} from '../../packages/legislation/src/version-diff.ts';
import type {ProvisionCorrespondence,DerivedArtifact} from '../../packages/legislation/src/version-diff.ts';
const text=new TextEncoder();
async function sources(){
 const before=normalizeSource('source-v1',await importText(text.encode('Section 1 Original duty\nSection 2 Other rule'),{format:'text',name:'toy.txt'}));
 const after=normalizeSource('source-v2',await importText(text.encode('Section 1 Amended exception\nSection 2 Other rule'),{format:'text',name:'toy.txt'}));
 const pairs:ProvisionCorrespondence[]=before.provisions.map((p,i)=>({beforeId:p.id,afterId:after.provisions[i]!.id,confidence:'provisional'}));
 return {before,after,pairs};
}
const refs=(before:Awaited<ReturnType<typeof sources>>['before'])=>[
 {versionId:before.versionId,sourceDigest:before.sourceDigest,provisionId:before.provisions[0]!.id}
];
describe('LM-016 immutable source difference and invalidation',()=>{
 it('invalidates a rule, linked scenario, scene and translation when an operative exception changes',async()=>{
  const {before,after,pairs}=await sources();const original=JSON.stringify(before);
  const refs1=refs(before);
  const dependencies:DerivedArtifact[]=[
   {id:'rule',kind:'rule',sourceRefs:refs1,dependsOn:[]},
   {id:'scenario',kind:'scenario',sourceRefs:[],dependsOn:['rule']},
   {id:'scene',kind:'scene',sourceRefs:[],dependsOn:['scenario']},
   {id:'translation',kind:'translation',sourceRefs:[],dependsOn:['scene']}
  ];
  const r=diffSourceVersions(before,after,pairs,dependencies);
  expect(r.status).toBe('valid');
  expect(r.changes[0]?.differences).toEqual(expect.arrayContaining(['TEXT_CHANGED','SOURCE_DIGEST_CHANGED']));
  expect(r.invalidations.map(x=>x.id)).toEqual(['rule','scenario','scene','translation']);
  expect(r.invalidations.find(x=>x.id==='scenario')?.reason).toBe('DEPENDENCY_STALE');
  expect(JSON.stringify(before)).toBe(original);
 });
 it('does not assert legal meaning after a citation-only renumber',async()=>{
  const {before,after,pairs}=await sources();
  const synthetic={...after,sourceDigest:before.sourceDigest,provisions:after.provisions.map((p,i)=>({...p,
    sourceDigest:before.sourceDigest,text:before.provisions[i]!.text,
    citation:i===0?'44':before.provisions[i]!.citation
  }))};
  const result=diffSourceVersions(before,synthetic,pairs,[{id:'citation',kind:'citation',sourceRefs:refs(before),dependsOn:[]}]);
  expect(result.status).toBe('valid');
  expect(result.changes[0]?.differences).toContain('CITATION_CHANGED');
  expect(result.changes[0]?.differences).not.toContain('TEXT_CHANGED');
  expect(result.changes[0]?.meaningStatus).toBe('unreviewed');
  expect(result.invalidations.map(x=>x.id)).toEqual(['citation']);
 });
 it('never invents provision identity from matching displayed labels',async()=>{
  const {before,after}=await sources();
  const result=diffSourceVersions(before,after,[]);
  expect(result.changes.filter(x=>x.category==='removed')).toHaveLength(2);
  expect(result.changes.filter(x=>x.category==='added')).toHaveLength(2);
 });
 it('rejects duplicate, nonexistent and unreviewed ambiguous mappings',async()=>{
  const {before,after,pairs}=await sources();
  expect(diffSourceVersions(before,after,[pairs[0]!,pairs[0]!]).diagnostics.map(d=>d.code)).toContain('INVALID_CORRESPONDENCE');
  expect(diffSourceVersions(before,after,[{beforeId:'missing',afterId:pairs[0]!.afterId,confidence:'provisional'}]).status).toBe('unresolved');
  expect(diffSourceVersions(before,after,[{...pairs[0]!,confidence:'asserted-in-code' as never}]).status).toBe('unresolved');
 });
 it('rejects forged source anchors and dangling dependencies before publishing stale findings',async()=>{
  const {before,after,pairs}=await sources();
  const forged:DerivedArtifact[]=[{id:'rule',kind:'rule',sourceRefs:[{...refs(before)[0]!,sourceDigest:'f'.repeat(64)}],dependsOn:[]}];
  expect(diffSourceVersions(before,after,pairs,forged).diagnostics.map(d=>d.code)).toContain('INVALID_DERIVATIVE');
  const dangling:DerivedArtifact[]=[{id:'scene',kind:'scene',sourceRefs:[],dependsOn:['absent']}];
  expect(diffSourceVersions(before,after,pairs,dangling).diagnostics.map(d=>d.code)).toContain('UNKNOWN_DERIVATIVE_DEPENDENCY');
 });
 it('keeps old source and citation fully reproducible after the new version is stored',async()=>{
  const {before,after,pairs}=await sources();
  const store=new VersionedSourceStore();
  store.put(before);store.put(after);
  const anchor={versionId:before.versionId,sourceDigest:before.sourceDigest,
    provisionId:before.provisions[0]!.id,quote:'Section 1 Original duty'};
  const old=resolveVersionedCitation(store,anchor,{published:true});
  expect(old.status).toBe('resolved');
  expect(old.quote).toBe(anchor.quote);
  expect(diffSourceVersions(before,after,pairs).status).toBe('valid');
  expect(resolveVersionedCitation(store,anchor,{published:true})).toEqual(old);
 });
});
