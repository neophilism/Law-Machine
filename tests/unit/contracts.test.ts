import { describe,it,expect } from 'vitest';
import { validateBundle, SCHEMA_VERSION } from '../../packages/contracts/src/index.ts';
const sha = 'a'.repeat(64);
const source = {versionId:'v1',provisionId:'p1',sourceDigest:sha,quote:'Toy requirement'};
const fixture = () => ({schemaVersion:SCHEMA_VERSION,billVersions:[{id:'v1',billId:'toy',version:'1',status:'draft',jurisdiction:'fictional',sourceDigest:sha}],provisions:[{id:'p1',versionId:'v1',citation:'1(a)',text:'Toy requirement',source}],actors:[{id:'a1',name:'Fictional clerk',kind:'agency'}],assumptions:[{id:'x1',description:'Toy assumption',classification:'hypothetical',value:{kind:'unknown',reason:'not specified'}}],rules:[{id:'r1',versionId:'v1',sourceRefs:[source],modal:'obligation',operation:'toy'}],scenarios:[{id:'s1',versionId:'v1',title:'Toy',hypothetical:true,assumptions:['x1']}],releases:[{id:'rel1',schemaVersion:SCHEMA_VERSION,billVersionId:'v1',sourceDigest:sha,createdAt:'2026-01-01T00:00:00Z'}],traces:[{id:'e1',scenarioId:'s1',tick:0,actorId:'a1',ruleId:'r1',sourceRefs:[source]}]});
describe('LM-003 portable contracts',()=>{
 it('accepts a pinned hypothetical toy-law fixture',()=>expect(validateBundle(fixture())).toEqual({valid:true,diagnostics:[]}));
 it('rejects incompatible versions',()=>{const f=fixture();(f as {schemaVersion:string}).schemaVersion='2.0.0';expect(validateBundle(f).diagnostics.some(e=>e.code==='UNSUPPORTED_SCHEMA')).toBe(true);});
 it('rejects cross-version anchors',()=>{const f=fixture();f.rules[0]!.sourceRefs=[{...source,versionId:'v2'}];expect(validateBundle(f).diagnostics.some(e=>e.code==='CROSS_VERSION_SOURCE')).toBe(true);});
 it('rejects duplicates, invalid units and missing parents',()=>{const f=fixture();f.provisions.push({...f.provisions[0]!,id:'p1',parentId:'missing'} as (typeof f.provisions)[number]);expect(validateBundle(f).diagnostics.map(e=>e.code)).toEqual(expect.arrayContaining(['DUPLICATE_ID','INVALID_PARENT']));const g=fixture();g.assumptions[0]!.value={kind:'known',value:{value:Infinity,unit:'day'}} as never;expect(validateBundle(g).diagnostics.some(e=>e.code==='INVALID_QUANTITY')).toBe(true);});
 it('preserves explicit unknown instead of treating it as false',()=>{const f=fixture();expect(f.assumptions[0]!.value.kind).toBe('unknown');expect(validateBundle(f).valid).toBe(true);});
});
