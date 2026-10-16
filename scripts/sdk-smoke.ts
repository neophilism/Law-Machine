import { readFileSync } from 'node:fs';
import { loadPublicRelease, SDK_ENGINE_VERSION } from '../packages/sdk/src/index.ts';
import { canonicalDigest, sha256Hex } from '../packages/contracts/src/index.ts';

const model=JSON.parse(readFileSync(new URL('../packages/contracts/fixtures/v1-hypothetical.json',import.meta.url),'utf8')) as {
  billVersions:{id:string;sourceDigest:string}[];
  provisions:{versionId:string;source:{sourceDigest:string}}[];
  rules:{versionId:string;sourceRefs:{sourceDigest:string}[]}[];
  traces:{sourceRefs:{sourceDigest:string}[]}[];
  releases:{billVersionId:string;sourceDigest:string}[];
};
const originalBytes=new TextEncoder().encode('CLI synthetic source example\n');
const digest=await sha256Hex(originalBytes);
model.billVersions.find(v=>v.id==='v1')!.sourceDigest=digest;
for(const p of model.provisions.filter(p=>p.versionId==='v1'))p.source.sourceDigest=digest;
for(const r of model.rules.filter(r=>r.versionId==='v1'))for(const s of r.sourceRefs)s.sourceDigest=digest;
for(const t of model.traces)for(const s of t.sourceRefs)s.sourceDigest=digest;
model.releases.find(r=>r.billVersionId==='v1')!.sourceDigest=digest;
const manifest={schemaVersion:'1.0.0' as const,releaseId:'rel1',sourceDigest:digest,assets:[]};
const result=await loadPublicRelease({bundle:model,releaseId:'rel1',manifest,requestedEngineVersion:SDK_ENGINE_VERSION,
  expectedManifestDigest:await canonicalDigest(manifest),originalSourceBytes:originalBytes,assets:new Map()});
if(!result.ok)throw new Error('Headless SDK smoke failed: '+result.error.code);
const found=result.value.getProvision('p1');
if(!found.ok || found.value.text!=='Toy requirement')throw new Error('Headless SDK cannot resolve pinned toy provision');
const unavailable=result.value.simulate('s1');
if(unavailable.ok || unavailable.error.code!=='UNSUPPORTED_FEATURE')throw new Error('Headless SDK falsely reports simulation');
console.log('Headless SDK: source-verified fictional release and pinned provision lookup pass; simulation explicitly unavailable.');
