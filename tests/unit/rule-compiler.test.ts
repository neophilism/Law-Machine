import {describe,it,expect} from 'vitest';
import {compileRuleModel,type CompileEnvironment} from '../../packages/rules/src/compiler.ts';
import {evaluateRuleGuard,type RuleSpec} from '../../packages/rules/src/language.ts';
import {canonicalJSON} from '../../packages/contracts/src/integrity.ts';
const digest='a'.repeat(64);
const source={versionId:'toy-v1',provisionId:'toy-s1',sourceDigest:digest,quote:'Toy routing duty'};
const source2={versionId:'toy-v1',provisionId:'toy-s2',sourceDigest:digest,quote:'Toy appeal duty'};
const env=():CompileEnvironment=>({
 versionId:'toy-v1',sourceDigest:digest,
 provisions:[{id:'toy-s1',text:'Toy routing duty must occur'},{id:'toy-s2',text:'Toy appeal duty if eligible'}],
 actors:['desk-a','desk-b'],externalEvents:['received','appeal'],
 precedence:[],factTypes:{covered:'boolean',count:'number'},capabilities:['route','record']
});
const r1={
 id:'rule1',versionId:'toy-v1',modal:'obligation',sourceRefs:[source],
 trigger:{event:'received'},when:{op:'truth',value:{op:'fact-value',key:'covered'}},
 exceptions:[{op:'unknown'}],effect:{operation:'route',actorId:'desk-a'},explanationKey:'toy-rule1'
};
const r2={
 id:'rule2',versionId:'toy-v1',modal:'permission',sourceRefs:[source2],
 trigger:{event:'appeal'},when:{op:'unknown'},exceptions:[],
 effect:{operation:'record',actorId:'desk-b'},explanationKey:'toy-rule2'
};
const raw=(rules:unknown[]=[r1,r2])=>JSON.stringify({schemaVersion:1,rules});
const codes=(text:string=raw(),opts:CompileEnvironment=env())=>compileRuleModel(text,opts).diagnostics.map(x=>x.code);

describe('LM-020 compiler and source-effect graph',()=>{
 it('compiles a deterministic detached immutable model with explicit provenance',()=>{
  const input=raw();
  const r=compileRuleModel(input,env());
  expect(r.valid).toBe(true);
  expect(r.compiled!.orderedRules.map(x=>x.id)).toEqual(['rule1','rule2']);
  expect(r.compiled!.sourceDependencies).toEqual([{provisionId:'toy-s1',ruleIds:['rule1']},{provisionId:'toy-s2',ruleIds:['rule2']}]);
  expect(r.compiled!.orderedRules[0]!.sourceRefs[0]).toMatchObject(source);
  expect(Object.isFrozen(r.compiled)).toBe(true);
  expect(Object.isFrozen(r.compiled!.orderedRules[0]!.sourceRefs)).toBe(true);
  expect(canonicalJSON(compileRuleModel(input,env()).compiled)).toBe(canonicalJSON(r.compiled));
 });
 it('rejects transitions without matching pinned original source text and digest',()=>{
  const wrong=JSON.parse(raw()) as {rules:Array<{sourceRefs:Array<{sourceDigest:string;quote:string}>}>};
  wrong.rules[0]!.sourceRefs[0]!.sourceDigest='f'.repeat(64);
  expect(codes(JSON.stringify(wrong))).toContain('COMPILE_SOURCE_UNRESOLVED');
  wrong.rules[0]!.sourceRefs[0]!.sourceDigest=digest;
  wrong.rules[0]!.sourceRefs[0]!.quote='Not in source';
  expect(codes(JSON.stringify(wrong))).toContain('COMPILE_SOURCE_UNRESOLVED');
 });
 it('does not compile unknown actors, unreachable events or mismatched version',()=>{
  const x=JSON.parse(raw()) as {rules:Array<{effect:{actorId:string};trigger:{event:string};versionId:string}>};
  x.rules[0]!.effect.actorId='unlisted';
  expect(codes(JSON.stringify(x))).toContain('COMPILE_ACTOR_UNDECLARED');
  x.rules[0]!.effect.actorId='desk-a';
  x.rules[0]!.trigger.event='unlisted';
  expect(codes(JSON.stringify(x))).toContain('COMPILE_TRIGGER_UNREACHABLE');
  x.rules[0]!.trigger.event='received';
  x.rules[0]!.versionId='toy-v2';
  expect(codes(JSON.stringify(x))).toContain('COMPILE_VERSION_MISMATCH');
 });
 it('requires explicit precedence for potentially conflicting same-trigger rules',()=>{
  const collision={...r1,id:'rule3',explanationKey:'rule3',effect:{operation:'record',actorId:'desk-a'}};
  const x=raw([r1,collision]);
  expect(codes(x)).toContain('COMPILE_RULE_CONFLICT_UNRESOLVED');
  const ordered=env(); const resolved={...ordered,precedence:[{ruleId:'rule3',after:['rule1']}]};
  const r=compileRuleModel(x,resolved);
  expect(r.valid).toBe(true);
  expect(r.compiled?.orderedRules.map(x=>x.id)).toEqual(['rule1','rule3']);
  expect(r.compiled?.orderedRules[1]?.after).toEqual(['rule1']);
 });
 it('fails closed on unresolved precedence references and cycles',()=>{
  const collision={...r1,id:'rule3',explanationKey:'rule3'};
  expect(codes(raw([r1,collision]),{...env(),precedence:[{ruleId:'rule3',after:['absent']}]})).toContain('COMPILE_PRECEDENCE_INVALID');
  expect(codes(raw([r1,collision]),{...env(),precedence:[
   {ruleId:'rule1',after:['rule3']},{ruleId:'rule3',after:['rule1']}
  ]})).toContain('COMPILE_PRECEDENCE_CYCLE');
 });
 it('emits data that can be consumed by pure independent guard interpreter',()=>{
  const r=compileRuleModel(raw(),env());const compiled=r.compiled!.orderedRules[0]!;
  const reconstruct:RuleSpec={
   id:compiled.id,versionId:compiled.versionId,modal:compiled.modal,
   sourceRefs:compiled.sourceRefs,trigger:{event:compiled.trigger},
   when:compiled.when,exceptions:compiled.exceptions,
   effect:{actorId:compiled.actorId,operation:compiled.operation},
   explanationKey:compiled.explanationKey
  };
  expect(evaluateRuleGuard(reconstruct,{covered:true}).applicable).toBe('unknown');
  expect(evaluateRuleGuard(reconstruct,{covered:false}).applicable).toBe(false);
 });
 it('rejects capability mismatches, invalid inventories and duplicate source nodes',()=>{
  expect(codes(raw(),{...env(),capabilities:['record']})).toContain('RULE_CAPABILITY_UNSUPPORTED');
  expect(codes(raw(),{...env(),provisions:[...env().provisions,env().provisions[0]!]})).toContain('COMPILE_SOURCE_INVALID');
  expect(codes(raw(),{...env(),actors:['desk-a','desk-a']})).toContain('COMPILE_ENVIRONMENT_INVALID');
 });
});
