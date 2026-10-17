import{describe,it,expect}from'vitest';
import{processQueue,type WorkItem}from'../../packages/simulation/src/queues.ts';
const items:WorkItem[]=[{id:'a',arrivedAt:0,units:1,legalDueTick:2,assumptionId:'s1'},{id:'b',arrivedAt:0,units:1,legalDueTick:2,assumptionId:'s1'},{id:'c',arrivedAt:0,units:1,legalDueTick:2,assumptionId:'s1'}];
const config={workers:1,unitsPerTick:1,sourceKind:'assumption' as const,sourceId:'hypothetical-capacity'};
describe('LM-025 operational queues',()=>{
 it('shows congestion changes performance rather than legal deadline',()=>{
  const normal=processQueue(items,config,5);
  const congested=processQueue([...items,...Array.from({length:4},(_,i)=>({id:'0early'+i,arrivedAt:0,units:1,legalDueTick:null,assumptionId:'s1'}))],config,8);
  expect(normal.records.find(x=>x.itemId==='c')?.missedLegalDue).toBe(false);
  expect(congested.records.find(x=>x.itemId==='c')?.missedLegalDue).toBe(true);
  expect(items[0]?.legalDueTick).toBe(2);
 });
 it('conserves capacity with integer service units',()=>{
  const r=processQueue(items,config,1);
  expect(r.consumedUnits).toBe(2);expect(r.capacityUnits).toBe(2);
  expect(r.records.length+r.remaining.length).toBe(items.length);
 });
 it('labels processing rates assumptions not statutory time',()=>{
  expect(processQueue(items,config,4).records.every(x=>x.modelingSource==='assumption:hypothetical-capacity')).toBe(true);
 });
 it('rejects duplicate, invalid workloads and capacities',()=>{
  expect(()=>processQueue([...items,items[0]!],config,4)).toThrow('WORK_ITEM_INVALID');
  expect(()=>processQueue(items,{...config,workers:-1},4)).toThrow('QUEUE_INPUT_INVALID');
 });
});
