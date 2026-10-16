import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { runFictionalToy } from '../../packages/contracts/src/toy-oracle.ts';
const oracle = JSON.parse(readFileSync(new URL('../../packages/contracts/fixtures/toy-law-oracle.json',import.meta.url),'utf8')) as {kind:string; sources: {id:string;text:string}[]; cases:{id:string;facts:{received:boolean;destination:'desk-b'|null};expected:unknown[]}[]};
describe('LM-008 independently specified fictional oracle',()=>{
  it('is explicitly fictional and all anticipated source references resolve',()=>{
    expect(oracle.kind).toBe('fictional-test-oracle');
    const known=new Set(oracle.sources.map(s=>s.id));
    for(const c of oracle.cases) for(const event of c.expected as {source:string}[]) expect(known.has(event.source)).toBe(true);
  });
  for(const name of ['route','unknown','not-received']){
    it('matches separately authored trace for '+name,()=>{
      const c=oracle.cases.find(v=>v.id===name)!;
      expect(runFictionalToy(c.facts)).toEqual(c.expected);
    });
  }
  it('does not turn unknown destination into a successful route',()=>{
    const result=runFictionalToy({received:true,destination:null});
    expect(result.some(e=>e.kind==='forwarded')).toBe(false);
    expect(result.some(e=>e.kind==='unresolved')).toBe(true);
  });
  it('rejects malformed inputs',()=>{
    expect(()=>runFictionalToy({received:true,destination:'external'} as never)).toThrow('INVALID_TOY_FACT');
    expect(()=>runFictionalToy({received:'yes',destination:null} as never)).toThrow('INVALID_TOY_FACT');
  });
});
