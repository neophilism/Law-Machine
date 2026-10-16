import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { loadPublicRelease, SDK_ENGINE_VERSION, type LoadPublicReleaseInput } from '../../packages/sdk/src/index.ts';
import { sha256Hex, canonicalDigest, contentAddress, type ReleaseManifest } from '../../packages/contracts/src/index.ts';

const fixture = new URL('../../packages/contracts/fixtures/v1-hypothetical.json',import.meta.url);
type MutableFixture = {
  schemaVersion: string;
  billVersions:{id:string;sourceDigest:string}[];
  provisions:{id:string;versionId:string;citation:string;text:string;source:{versionId:string;provisionId:string;sourceDigest:string;quote:string}}[];
  rules:{versionId:string;sourceRefs:{sourceDigest:string}[]}[];
  traces:{scenarioId:string;sourceRefs:{sourceDigest:string}[]}[];
  releases:{id:string;billVersionId:string;sourceDigest:string}[];
};
const bytes = (s:string):Uint8Array => new TextEncoder().encode(s);
async function validInput(): Promise<{input:LoadPublicReleaseInput; model:MutableFixture}> {
  const model=JSON.parse(readFileSync(fixture,'utf8')) as MutableFixture;
  const source=bytes('Original fictional draft\n');
  const digest=await sha256Hex(source);
  model.billVersions.find(v=>v.id==='v1')!.sourceDigest=digest;
  for(const p of model.provisions.filter(v=>v.versionId==='v1')) p.source.sourceDigest=digest;
  for(const r of model.rules.filter(v=>v.versionId==='v1')) for(const s of r.sourceRefs) s.sourceDigest=digest;
  for(const t of model.traces) for(const s of t.sourceRefs) s.sourceDigest=digest;
  model.releases.find(r=>r.billVersionId==='v1')!.sourceDigest=digest;
  const asset=bytes('Fictional released artifact');
  const path=await contentAddress(asset,'txt');
  const manifest:ReleaseManifest={schemaVersion:'1.0.0',releaseId:'rel1',sourceDigest:digest,assets:[{path,digest:await sha256Hex(asset)}]};
  return {model,input:{bundle:model,manifest,releaseId:'rel1',requestedEngineVersion:SDK_ENGINE_VERSION,
    originalSourceBytes:source,assets:new Map([[path,asset]]),expectedManifestDigest:await canonicalDigest(manifest)}};
}

describe('LM-006 provider-free headless SDK',()=>{
  it('loads a pinned verified fixture and resolves its provision without a web application',async()=>{
    const {input}=await validInput();
    const response=await loadPublicRelease(input);
    expect(response.ok).toBe(true);
    if(!response.ok) return;
    expect(response.value.release.id).toBe('rel1');
    expect(response.value.getProvision('p1')).toMatchObject({ok:true,value:{versionId:'v1',text:'Toy requirement'}});
    expect(response.value.findProvisionByCitation('1(a)')).toMatchObject({ok:true,value:{id:'p1'}});
    expect(response.value.listProvisions()).toHaveLength(1);
  });
  it('rejects incompatible engine/schema versions explicitly',async()=>{
    const {input}=await validInput();
    expect(await loadPublicRelease({...input,requestedEngineVersion:'99.0.0'})).toMatchObject({ok:false,error:{code:'INCOMPATIBLE_ENGINE'}});
    expect(await loadPublicRelease({...input,bundle:{...input.bundle as object,schemaVersion:'2.0.0'}})).toMatchObject({ok:false,error:{code:'INCOMPATIBLE_SCHEMA'}});
  });
  it('fails safe on unknown releases, mismatched manifests and corrupted assets',async()=>{
    const {input}=await validInput();
    expect(await loadPublicRelease({...input,releaseId:'other'})).toMatchObject({ok:false,error:{code:'RELEASE_NOT_FOUND'}});
    expect(await loadPublicRelease({...input,manifest:{...input.manifest,releaseId:'other'}})).toMatchObject({ok:false,error:{code:'RELEASE_MISMATCH'}});
    expect(await loadPublicRelease({...input,assets:new Map()})).toMatchObject({ok:false,error:{code:'INTEGRITY_FAILED'}});
  });
  it('returns not found rather than silently resolving across versions',async()=>{
    const response=await loadPublicRelease((await validInput()).input);
    expect(response.ok).toBe(true);if(!response.ok)return;
    expect(response.value.getProvision('not-in-release')).toMatchObject({ok:false,error:{code:'NOT_FOUND'}});
    expect(response.value.findProvisionByCitation('7(z)')).toMatchObject({ok:false,error:{code:'NOT_FOUND'}});
  });
  it('does not guess when a pinned version has two matching displayed citations',async()=>{
    const {input,model}=await validInput();
    const first=model.provisions[0]!;
    model.provisions.push({...first,id:'p2',text:'Toy requirement supplemented',source:{...first.source,provisionId:'p2'}});
    const response=await loadPublicRelease(input);expect(response.ok).toBe(true);if(!response.ok)return;
    expect(response.value.findProvisionByCitation('1(a)')).toMatchObject({ok:false,error:{code:'AMBIGUOUS_CITATION'}});
  });
  it('keeps its immutable release snapshot when caller mutates original input',async()=>{
    const {input,model}=await validInput();
    const response=await loadPublicRelease(input);expect(response.ok).toBe(true);if(!response.ok)return;
    model.provisions[0]!.text='User-mutated source';
    expect(response.value.getProvision('p1')).toMatchObject({ok:true,value:{text:'Toy requirement'}});
    expect(Object.isFrozen(response.value.listProvisions())).toBe(true);
  });
  it('returns an explicit unsupported response for simulation',async()=>{
    const response=await loadPublicRelease((await validInput()).input);
    expect(response.ok).toBe(true);if(!response.ok)return;
    expect(response.value.simulate('s1')).toMatchObject({ok:false,error:{code:'UNSUPPORTED_FEATURE'}});
  });
});
