import{describe,it,expect}from'vitest';
import{branchOnExceptions}from'../../packages/simulation/src/branches.ts';
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
