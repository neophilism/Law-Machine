import{describe,it,expect}from'vitest';
import{branchOnExceptions,discretionaryChoices,interpretationAlternatives}from'../../packages/simulation/src/branches.ts';
const ex={id:'exc',modifiesDutyId:'d1',factId:'emergency',whenValue:true,sourceRefs:['toy-v1:s1']};
describe('LM-024 explicit exception branches',()=>{
 it('does not turn an unknown fact into false',()=>{
  const r=branchOnExceptions('d1',{emergency:'unknown'},[ex]);
  expect(r.state).toBe('alternatives');expect(r.branches).toHaveLength(2);
  expect(r.branches.map(b=>b.appliedExceptions)).toEqual([[],['exc']]);
 });
 it('determinate exception modifies a specific duty only',()=>{
  expect(branchOnExceptions('d1',{emergency:true},[ex]).branches[0]?.appliedExceptions).toEqual(['exc']);
  expect(()=>branchOnExceptions('different',{emergency:true},[ex])).toThrow('EXCEPTION_INVALID');
 });
 it('rejects branch explosion without picking an answer',()=>{
  const xs=Array.from({length:5},(_,i)=>({...ex,id:'exc'+i,factId:'f'+i}));
  const r=branchOnExceptions('d1',{},xs,16);
  expect(r).toMatchObject({state:'limited',branches:[],diagnostics:['BRANCH_BUDGET_EXCEEDED']});
 });
 it('rejects duplicate exception and absent provenance',()=>{
  expect(()=>branchOnExceptions('d1',{},[ex,ex])).toThrow('EXCEPTION_INVALID');
  expect(()=>branchOnExceptions('d1',{},[{...ex,sourceRefs:[]}])).toThrow('EXCEPTION_INVALID');
 });
});

describe('LM-024 nested and interpretive branches',()=>{
 it('requires parent exception to apply before nested exception',()=>{
  const nested={id:'nested',modifiesDutyId:'d1',factId:'special',whenValue:true,sourceRefs:['toy-v1:s2'],dependsOnExceptionId:'exc'};
  expect(branchOnExceptions('d1',{emergency:false,special:true},[ex,nested]).branches[0]?.appliedExceptions).toEqual([]);
  expect(branchOnExceptions('d1',{emergency:true,special:true},[nested,ex]).branches[0]?.appliedExceptions).toEqual(['exc','nested']);
  expect(()=>branchOnExceptions('d1',{},[{...nested,dependsOnExceptionId:'missing'}])).toThrow('NESTED_EXCEPTION_INVALID');
 });
 it('does not execute discretionary choice implicitly',()=>{
  const result=discretionaryChoices('desk',[{id:'allow',sourceRefs:['toy:s1']},{id:'deny',sourceRefs:['toy:s1']}]);
  expect(result.state).toBe('alternatives');
  expect(result.diagnostics).toContain('CHOICE_NOT_AUTOMATIC');
 });
 it('retains competing sourced interpretation alternatives and branch cap',()=>{
  const records=[{id:'reading-a',sourceRefs:['toy:s1']},{id:'reading-b',sourceRefs:['toy:s2']}];
  expect(interpretationAlternatives(records).branches).toHaveLength(2);
  expect(interpretationAlternatives(records,1).diagnostics).toContain('BRANCH_BUDGET_EXCEEDED');
 });
});
