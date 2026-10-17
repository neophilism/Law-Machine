import {describe, it, expect} from 'vitest';
import {buildExplanationGraph, type ExplanationEvent, type ExplanationRule, type ExplanationSource}
  from '../../packages/simulation/src/explanations.ts';

const sha='a'.repeat(64);
const ref={versionId:'fictional-v1',provisionId:'toy-1',sourceDigest:sha,quote:'A clerk may forward a fictional form.'};
const sources: ExplanationSource[]=[{
  versionId:'fictional-v1',provisionId:'toy-1',sourceDigest:sha,
  citation:'Toy §1 (not real law)',text:'A clerk may forward a fictional form.'
}];
const rules: ExplanationRule[]=[{
  id:'rule-forward',versionId:'fictional-v1',sourceRefs:[ref],
  tokens:[{kind:'literal',value:'Actor '},{kind:'field',value:'actorId'},
    {kind:'literal',value:' had result '},{kind:'field',value:'outcome'}]
}];
const base: ExplanationEvent={
  id:'event-filed',tick:0,parentIds:[],alternativeIds:[],
  actorId:'toy-clerk',ruleId:'rule-forward',versionId:'fictional-v1',
  outcome:'pending',predicates:[{factId:'received',result:true,evidenceId:null}],
  appliedExceptions:[],evidenceIds:[],sourceRefs:[ref]
};
const child: ExplanationEvent={
  ...base,id:'event-forward',tick:1,parentIds:['event-filed'],
  outcome:'satisfied'
};
describe('LM-028 provenance and causal inspection',()=>{
 it('follows the exact causal chain and preserves quoted pinned sources',()=>{
  const graph=buildExplanationGraph([child,base],rules,sources,[]);
  expect(graph.totalEvents).toBe(2);
  expect(graph.views[0]?.causalEventIds).toEqual(['event-forward','event-filed']);
  expect(graph.views[0]?.sourceExcerpts[0]?.exactQuote).toBe(ref.quote);
  expect(graph.views[0]?.publicText).toContain('toy-clerk had result satisfied');
 });
 it('unknown predicates and source conflicts never become certain prose',()=>{
  const uncertain: ExplanationEvent={
   ...child,outcome:'unknown',
   predicates:[{factId:'legal-interpretation',result:'unknown',evidenceId:null}],
   alternativeIds:['event-filed']
  };
  const graph=buildExplanationGraph([base,uncertain],rules,sources,[]);
  expect(graph.unresolvedEvents).toBe(1);
  expect(graph.views[1]?.state).toBe('unresolved');
  expect(graph.views[1]?.publicText).toContain('unresolved');
  expect(graph.views[1]?.warnings).toContain('UNRESOLVED_ALTERNATIVES');
  expect(graph.views[1]?.publicText).not.toContain('satisfied');
 });
 it('rejects source edits, changed digests and uncited operative transitions',()=>{
  expect(()=>buildExplanationGraph([base],rules,[{...sources[0]!,text:'changed'}],[]))
   .toThrow('EXPLANATION_ANCHOR_STALE');
  expect(()=>buildExplanationGraph([{...base,sourceRefs:[]}],rules,sources,[]))
   .toThrow('EXPLANATION_EVENT_INVALID');
  expect(()=>buildExplanationGraph([{...base,sourceRefs:[{...ref,sourceDigest:'b'.repeat(64)}]}],rules,sources,[]))
   .toThrow('EXPLANATION_SOURCE_NOT_RULE_SUPPORTED');
  expect(()=>buildExplanationGraph([{...base,sourceRefs:[null as never]}],rules,sources,[]))
   .toThrow('EXPLANATION_ANCHOR_INVALID');
 });
 it('rejects dangling and circular causal records',()=>{
  expect(()=>buildExplanationGraph([{...base,parentIds:['missing']}],rules,sources,[]))
    .toThrow('EXPLANATION_CAUSAL_PARENT_INVALID');
  const a={...base,parentIds:['event-forward'],tick:1};
  const b={...child,parentIds:['event-filed'],tick:1};
  expect(()=>buildExplanationGraph([a,b],rules,sources,[]))
    .toThrow('EXPLANATION_CAUSAL_CYCLE');
 });
 it('resolves evidence records by declared classification and refuses invented references',()=>{
  const id='assumption-1';
  const evidence=[{id,classification:'assumption' as const,description:'Toy clerk delay',sourceRefs:[ref]}];
  const enriched={...base,evidenceIds:[],predicates:[{factId:'delay',result:true as const,evidenceId:id}]};
  expect(buildExplanationGraph([enriched],rules,sources,evidence).views[0]?.evidence[0]?.classification)
   .toBe('assumption');
  expect(()=>buildExplanationGraph([{...base,evidenceIds:['absent']}],rules,sources,evidence))
   .toThrow('EXPLANATION_EVIDENCE_MISSING');
 });
 it('limits records and rejects arbitrary rendering tokens',()=>{
  const invalid: ExplanationRule={...rules[0]!,tokens:[{kind:'field',value:'eval' as never}]};
  expect(()=>buildExplanationGraph([base],[invalid],sources,[]))
   .toThrow('EXPLANATION_TEMPLATE_INVALID');
  expect(()=>buildExplanationGraph(new Array(2049).fill(base),rules,sources,[]))
   .toThrow('EXPLANATION_BUDGET');
 });
});
