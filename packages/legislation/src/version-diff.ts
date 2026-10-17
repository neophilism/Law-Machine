import type { NormalizedDocument, NormalizedProvision } from './provision-tree.ts';

/**
 * LM-016: source-version diffs with explicit, provisional correspondence.
 * No legal meaning is inferred by textual similarity or renumbering.
 */
export type ProvisionCorrespondence = {
  readonly beforeId:string; readonly afterId:string;
  readonly confidence:'provisional'|'editor-confirmed';
};
export type ProvisionChange = {
  readonly beforeId:string|null;readonly afterId:string|null;
  readonly category:'corresponded'|'added'|'removed';
  readonly differences:readonly ('TEXT_CHANGED'|'CITATION_CHANGED'|'PARENT_CHANGED'|'SPAN_CHANGED'|'SOURCE_DIGEST_CHANGED')[];
  readonly meaningStatus:'unreviewed';
};
export type DerivedArtifact = {
  readonly id:string;
  readonly kind:'rule'|'scenario'|'scene'|'translation'|'citation';
  readonly sourceRefs:readonly {readonly versionId:string;readonly provisionId:string;readonly sourceDigest:string}[];
  readonly dependsOn:readonly string[];
};
export type SourceInvalidation = {readonly id:string;readonly kind:DerivedArtifact['kind'];readonly reason:'PINNED_SOURCE_CHANGED'|'DEPENDENCY_STALE'};
export type DiffDiagnostic={readonly code:string;readonly path:string};
export type SourceDiff={
 readonly status:'valid'|'unresolved';
 readonly beforeVersionId:string;readonly afterVersionId:string;
 readonly changes:readonly ProvisionChange[];
 readonly invalidations:readonly SourceInvalidation[];
 readonly diagnostics:readonly DiffDiagnostic[];
};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const isObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);

function inspectDocument(doc:NormalizedDocument):boolean{
 if(!doc||!id(doc.versionId)||!digest(doc.sourceDigest)||!Array.isArray(doc.provisions)||
   doc.provisions.length>10000)return false;
 const seen=new Set<string>();
 for(const p of doc.provisions){
  if(!p||!id(p.id)||seen.has(p.id)||p.versionId!==doc.versionId||
    p.sourceDigest!==doc.sourceDigest||typeof p.text!=='string'||p.text.length>100000||
    !(p.citation===null||(typeof p.citation==='string'&&p.citation.length<=512))||
    !(p.parentId===null||id(p.parentId))||!isObject(p.span)||
    !['line','utf16-offset','page'].includes(String(p.span.kind))||
    !Number.isSafeInteger(p.span.start)||!Number.isSafeInteger(p.span.end)||
    p.span.start<0||p.span.end<p.span.start)return false;
  seen.add(p.id);
 }
 return true;
}
const spanChanged=(a:NormalizedProvision,b:NormalizedProvision)=>
 a.span.kind!==b.span.kind||a.span.start!==b.span.start||a.span.end!==b.span.end;

export function diffSourceVersions(before:NormalizedDocument,after:NormalizedDocument,
 correspondence:readonly ProvisionCorrespondence[],derived:readonly DerivedArtifact[]=[]):SourceDiff{
 const diagnostics:DiffDiagnostic[]=[];
 const err=(code:string,path:string)=>{if(diagnostics.length<100)diagnostics.push({code,path});};
 const unresolved=():SourceDiff=>({status:'unresolved',beforeVersionId:before?.versionId??'unavailable',
   afterVersionId:after?.versionId??'unavailable',changes:[],invalidations:[],diagnostics});
 if(!inspectDocument(before)||!inspectDocument(after)||before.versionId===after.versionId||
   !Array.isArray(correspondence)||correspondence.length>10000||
   !Array.isArray(derived)||derived.length>10000){
   err('INVALID_VERSION_DIFF','$');return unresolved();
 }
 const oldMap=new Map(before.provisions.map(p=>[p.id,p]));
 const nextMap=new Map(after.provisions.map(p=>[p.id,p]));
 const mappedOld=new Set<string>(),mappedNext=new Set<string>();
 const changes:ProvisionChange[]=[];
 const changedOld=new Set<string>();
 for(const [i,pair] of correspondence.entries()){
  const path='$.correspondence['+i+']';
  if(!pair||!id(pair.beforeId)||!id(pair.afterId)||
    !['provisional','editor-confirmed'].includes(pair.confidence)||
    !oldMap.has(pair.beforeId)||!nextMap.has(pair.afterId)||
    mappedOld.has(pair.beforeId)||mappedNext.has(pair.afterId)){
    err('INVALID_CORRESPONDENCE',path);continue;
  }
  mappedOld.add(pair.beforeId);mappedNext.add(pair.afterId);
  const old=oldMap.get(pair.beforeId)!,next=nextMap.get(pair.afterId)!;
  const differences:ProvisionChange['differences'][number][]=[];
  if(old.text!==next.text)differences.push('TEXT_CHANGED');
  if(old.citation!==next.citation)differences.push('CITATION_CHANGED');
  if(old.parentId!==next.parentId)differences.push('PARENT_CHANGED');
  if(spanChanged(old,next))differences.push('SPAN_CHANGED');
  if(before.sourceDigest!==after.sourceDigest)differences.push('SOURCE_DIGEST_CHANGED');
  if(differences.length)changedOld.add(old.id);
  changes.push({beforeId:old.id,afterId:next.id,category:'corresponded',differences,meaningStatus:'unreviewed'});
 }
 for(const old of before.provisions)if(!mappedOld.has(old.id)){
  changes.push({beforeId:old.id,afterId:null,category:'removed',differences:[],meaningStatus:'unreviewed'});
  changedOld.add(old.id);
 }
 for(const next of after.provisions)if(!mappedNext.has(next.id))
  changes.push({beforeId:null,afterId:next.id,category:'added',differences:[],meaningStatus:'unreviewed'});
 const artifacts=new Map<string,DerivedArtifact>();
 for(const [i,artifact] of derived.entries()){
  const path='$.derived['+i+']';
  if(!artifact||!id(artifact.id)||artifacts.has(artifact.id)||
    !['rule','scenario','scene','translation','citation'].includes(artifact.kind)||
    !Array.isArray(artifact.sourceRefs)||artifact.sourceRefs.length>100||
    !Array.isArray(artifact.dependsOn)||artifact.dependsOn.length>100||
    !artifact.dependsOn.every(id)||new Set(artifact.dependsOn).size!==artifact.dependsOn.length||
    !artifact.sourceRefs.every((r:DerivedArtifact['sourceRefs'][number])=>r&&r.versionId===before.versionId&&
      r.sourceDigest===before.sourceDigest&&oldMap.has(r.provisionId))){
    err('INVALID_DERIVATIVE',path);continue;
  }
  artifacts.set(artifact.id,artifact);
 }
 for(const a of artifacts.values())for(const dep of a.dependsOn)
  if(!artifacts.has(dep))err('UNKNOWN_DERIVATIVE_DEPENDENCY',a.id);
 if(diagnostics.length)return unresolved();
 const stale=new Map<string,SourceInvalidation>();
 const queue:string[]=[];
 const dependents=new Map<string,string[]>();
 for(const artifact of artifacts.values())for(const dep of artifact.dependsOn){
  const children=dependents.get(dep)??[];
  children.push(artifact.id);dependents.set(dep,children);
 }
 for(const artifact of artifacts.values()){
  if(artifact.sourceRefs.some(r=>changedOld.has(r.provisionId))){
   stale.set(artifact.id,{id:artifact.id,kind:artifact.kind,reason:'PINNED_SOURCE_CHANGED'});
   queue.push(artifact.id);
  }
 }
 // A downstream scenario or translation stays stale even if it did not directly
 // quote the modified statute, because its explanatory parent changed.
 for(let i=0;i<queue.length;i++){
  const parent=queue[i]!;
  for(const child of dependents.get(parent)??[]){
   if(!stale.has(child)){
    const artifact=artifacts.get(child)!;
    stale.set(child,{id:child,kind:artifact.kind,reason:'DEPENDENCY_STALE'});
    queue.push(child);
   }
  }
 }
 return {status:'valid',beforeVersionId:before.versionId,afterVersionId:after.versionId,
  changes,invalidations:[...stale.values()].sort((a,b)=>a.id.localeCompare(b.id)),diagnostics};
}
