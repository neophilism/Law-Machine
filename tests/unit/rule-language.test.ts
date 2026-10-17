import { describe,it,expect } from 'vitest';
import {parseRuleLanguage,evaluateRuleGuard} from '../../packages/rules/src/language.ts';
const factTypes={covered:'boolean',days:'number',exempt:'boolean',phrase:'string'} as const;
const anchor={versionId:'v1',provisionId:'toy-provision',sourceDigest:'a'.repeat(64),quote:'Fictional text'};
const valid=()=>({schemaVersion:1,rules:[{
 id:'route-rule',versionId:'v1',modal:'obligation',sourceRefs:[anchor],trigger:{event:'received'},
 when:{op:'and',terms:[
  {op:'truth',value:{op:'fact-value',key:'covered'}},
  {op:'gte',left:{op:'fact-value',key:'days'},right:{op:'literal',value:2}}
 ]},
 exceptions:[{op:'truth',value:{op:'fact-value',key:'exempt'}}],
 effect:{operation:'route',actorId:'fictional-desk'},explanationKey:'toy-routing'
}]});
const parse=(v:unknown,cap:readonly string[]=['route'])=>parseRuleLanguage(JSON.stringify(v),factTypes,cap);
const codes=(v:unknown,cap:readonly string[]=['route'])=>parse(v,cap).diagnostics.map(d=>d.code);
describe('LM-019 allowlisted rule language',()=>{
 it('parses source-pinned typed rule and exposes no arbitrary code execution',()=>{
  const r=parse(valid());
  expect(r.valid).toBe(true);
  expect(r.rules[0]!.modal).toBe('obligation');
  expect(evaluateRuleGuard(r.rules[0]!,{covered:true,days:3,exempt:false})).toEqual({when:true,exception:false,applicable:true});
 });
 it('unknown facts and exceptions remain unknown instead of false or a routed transition',()=>{
  const rule=parse(valid()).rules[0]!;
  expect(evaluateRuleGuard(rule,{covered:true,exempt:false})).toMatchObject({when:'unknown',applicable:'unknown'});
  expect(evaluateRuleGuard(rule,{covered:true,days:3})).toMatchObject({when:true,exception:'unknown',applicable:'unknown'});
  expect(evaluateRuleGuard(rule,{covered:false,days:3})).toMatchObject({when:false,applicable:false});
  expect(evaluateRuleGuard(rule,{covered:true,days:3,exempt:true}).applicable).toBe(false);
 });
 it('rejects undeclared fact names and ill-typed comparisons',()=>{
  const x=valid();x.rules[0]!.when={op:'truth',value:{op:'fact-value',key:'missing'}} as never;
  expect(codes(x)).toContain('FACT_UNDECLARED');
  const y=valid();y.rules[0]!.when={op:'gte',left:{op:'fact-value',key:'phrase'},right:{op:'literal',value:1}} as never;
  expect(codes(y)).toContain('EXPRESSION_TYPE_MISMATCH');
  const z=valid();z.rules[0]!.when={op:'truth',value:{op:'literal',value:45}} as never;
  expect(codes(z)).toContain('EXPRESSION_TYPE_MISMATCH');
 });
 it('fails closed for unimplemented effects and capabilities',()=>{
  expect(codes(valid(),[])).toContain('RULE_CAPABILITY_UNSUPPORTED');
  const x=valid();x.rules[0]!.effect={operation:'run-js',actorId:'fictional-desk'} as never;
  expect(codes(x)).toContain('RULE_RECORD_INVALID');
 });
 it('rejects unsafe arbitrary code, injected object fields and missing legal provenance',()=>{
  const x=valid();(x.rules[0]! as unknown as Record<string,unknown>).script='process.exit()';
  expect(codes(x)).toContain('RULE_RECORD_INVALID');
  const y=valid();y.rules[0]!.sourceRefs=[];
  expect(codes(y)).toContain('RULE_RECORD_INVALID');
  const z=valid();z.rules[0]!.sourceRefs=[{...anchor,versionId:'other'}];
  expect(codes(z)).toContain('RULE_SOURCE_INVALID');
  const w=valid();(w as unknown as Record<string,unknown>).eval='true';
  expect(codes(w)).toContain('RULE_SCHEMA_UNSUPPORTED');
 });
 it('rejects unsupported schema versions, non-JSON and deep expression bombs',()=>{
  expect(parseRuleLanguage('{malformed',factTypes,['route']).diagnostics[0]?.code).toBe('RULE_JSON_INVALID');
  expect(codes({...valid(),schemaVersion:2})).toContain('RULE_SCHEMA_UNSUPPORTED');
  const x=valid();let child:unknown={op:'unknown'};
  for(let i=0;i<24;i++)child={op:'not',arg:child};
  x.rules[0]!.when=child as never;
  expect(codes(x)).toContain('EXPRESSION_LIMIT');
 });
 it('does not confuse literal string "unknown" with an absent fact',()=>{
  const x=valid();x.rules[0]!.when={op:'eq',left:{op:'literal',value:'unknown'},right:{op:'fact-value',key:'phrase'}} as never;
  const r=parse(x);
  expect(r.valid).toBe(true);
  expect(evaluateRuleGuard(r.rules[0]!,{phrase:'unknown',exempt:false}).when).toBe(true);
  expect(evaluateRuleGuard(r.rules[0]!,{exempt:false}).when).toBe('unknown');
 });
});
