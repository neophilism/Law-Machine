import { describe,it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  canonicalJSON, canonicalDigest, contentAddress, sha256Hex, verifyRelease,
  type ReleaseManifest, SCHEMA_VERSION
} from '../../packages/contracts/src/index.ts';

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

async function sample() {
  const source = bytes('fictional source bytes\n');
  const asset = bytes('fictional public text');
  const digest = await sha256Hex(asset);
  const path = await contentAddress(asset, 'txt');
  const manifest: ReleaseManifest = {
    schemaVersion: SCHEMA_VERSION, releaseId:'fictional:1',
    sourceDigest: await sha256Hex(source), assets:[{path,digest}]
  };
  return {source,asset,path,manifest,assets:new Map<string,Uint8Array>([[path,asset]]),
    trustedDigest:await canonicalDigest(manifest)};
}

describe('LM-004 canonical identity and byte integrity',()=>{
  it('sorts keys recursively and matches an independently pinned digest',async()=>{
    const original={z:[3,'c'],a:{b:true,a:null}};
    const reordered={a:{a:null,b:true},z:[3,'c']};
    expect(canonicalJSON(original)).toBe('{"a":{"a":null,"b":true},"z":[3,"c"]}');
    expect(await canonicalDigest(original)).toBe('1b553761187d54000ee70b6abf35733ac138ce77905aa7f6e8552456bd58910e');
    expect(await canonicalDigest(original)).toBe(await canonicalDigest(reordered));
  });
  it('changes digest when original source bytes change, even if text only changes newlines',async()=>{
    expect(await sha256Hex(bytes('x\r\n'))).not.toBe(await sha256Hex(bytes('x\n')));
    expect(await sha256Hex(bytes('abc'))).toBe(createHash('sha256').update('abc').digest('hex'));
  });
  it('includes every property in identity including editorial timestamp',async()=>{
    const one={a:1,createdAt:'2026-01-01'};
    expect(await canonicalDigest(one)).not.toBe(await canonicalDigest({...one,createdAt:'2026-01-02'}));
    expect(await canonicalDigest(one)).not.toBe(await canonicalDigest({...one,extra:true}));
  });
  it('rejects cycles, nonfinite numbers, JS-only values, and deep nesting',()=>{
    const cycle: { self?: unknown }={};cycle.self=cycle;
    expect(()=>canonicalJSON(cycle)).toThrow('CANONICAL_CYCLE');
    expect(()=>canonicalJSON({n:Infinity})).toThrow('CANONICAL_NUMBER_INVALID');
    expect(()=>canonicalJSON({bad:undefined})).toThrow('CANONICAL_TYPE_UNSUPPORTED');
    expect(()=>canonicalJSON({bad:()=>0})).toThrow('CANONICAL_TYPE_UNSUPPORTED');
    expect(()=>canonicalJSON(new Date())).toThrow('CANONICAL_OBJECT_INVALID');
    let deep: unknown=0;for(let i=0;i<70;i++)deep={child:deep};
    expect(()=>canonicalJSON(deep)).toThrow('CANONICAL_LIMIT');
  });
  it('produces a content-addressed safe asset name',async()=>{
    const name=await contentAddress(bytes('original'), 'xml');
    expect(name).toMatch(/^assets\/[a-f0-9]{64}\.xml$/);
    await expect(contentAddress(bytes('original'),'../js')).rejects.toThrow('INVALID_EXTENSION');
  });
  it('verifies a complete byte-exact manifest using an independent expected root',async()=>{
    const s=await sample();
    const result=await verifyRelease(s.manifest,s.trustedDigest,s.source,s.assets);
    expect(result).toEqual({valid:true,manifestDigest:s.trustedDigest,diagnostics:[]});
  });
  it('rejects missing, altered, mismatched and undeclared assets',async()=>{
    const s=await sample();
    const absent=await verifyRelease(s.manifest,s.trustedDigest,s.source,new Map());
    expect(absent.diagnostics.map(d=>d.code)).toContain('MISSING_ASSET');
    const changed=await verifyRelease(s.manifest,s.trustedDigest,s.source,new Map([[s.path,bytes('tampered')]]));
    expect(changed.diagnostics.map(d=>d.code)).toContain('ASSET_DIGEST_MISMATCH');
    const extra=new Map(s.assets);extra.set('assets/extra.txt',bytes('extra'));
    const unexpected=await verifyRelease(s.manifest,s.trustedDigest,s.source,extra);
    expect(unexpected.diagnostics.map(d=>d.code)).toContain('UNDECLARED_ASSET');
    const wrongPath: ReleaseManifest={...s.manifest,assets:[{path:'assets/'+'0'.repeat(64)+'.txt',digest:s.manifest.assets[0]!.digest}]};
    const invalid=await verifyRelease(wrongPath,await canonicalDigest(wrongPath),s.source,s.assets);
    expect(invalid.diagnostics.map(d=>d.code)).toContain('INVALID_ASSET_RECORD');
  });
  it('rejects source changes and manifest tampering even with internally valid assets',async()=>{
    const s=await sample();
    const wrongSource=await verifyRelease(s.manifest,s.trustedDigest,bytes('other source'),s.assets);
    expect(wrongSource.diagnostics.map(d=>d.code)).toContain('SOURCE_DIGEST_MISMATCH');
    const modified: ReleaseManifest={...s.manifest,releaseId:'altered'};
    const wrongManifest=await verifyRelease(modified,s.trustedDigest,s.source,s.assets);
    expect(wrongManifest.diagnostics.map(d=>d.code)).toContain('MANIFEST_DIGEST_MISMATCH');
  });
});
