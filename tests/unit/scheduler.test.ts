import {describe,it,expect} from 'vitest';
import {DeterministicScheduler,type ScheduledEvent} from '../../packages/simulation/src/scheduler.ts';
const event=(id:string,tick:number,causeId:string|null=null):ScheduledEvent=>({id,tick,actorId:'toy-desk',kind:'received',causeId,sourceRefs:['toy-v1:p1']});
describe('LM-021 deterministic scheduler',()=>{
 it('orders equal-time events by stable identity rather than insertion order',()=>{
  const run=(ids:string[])=>{const s=new DeterministicScheduler();for(const id of ids)s.schedule(event(id,2));return s.run().trace.map(x=>x.id);};
  expect(run(['b','a','c'])).toEqual(['a','b','c']);expect(run(['c','b','a'])).toEqual(['a','b','c']);
 });
 it('step and pause leave final trace unchanged',()=>{
  const load=()=>{const s=new DeterministicScheduler();for(const [id,t] of [['b',3],['a',1],['c',3]] as const)s.schedule(event(id,t));return s;};
  const normal=load().run().trace;const stepped=load();expect(stepped.step()?.id).toBe('a');stepped.pause();
  expect(stepped.resume().trace).toEqual(normal);
 });
 it('supports causally scheduled work without wall clocks',()=>{
  const s=new DeterministicScheduler();s.schedule(event('start',0));
  const trace=s.run((e,scheduler)=>{if(e.id==='start')scheduler.schedule(event('next',1,e.id));}).trace;
  expect(trace.map(x=>[x.id,x.causeId,x.sequence])).toEqual([['start',null,0],['next','start',1]]);
 });
 it('halts zero-time feedback and event storms with diagnostics',()=>{
  const s=new DeterministicScheduler(20,3);s.schedule(event('first',0));
  const r=s.run((e,queue)=>queue.schedule(event('next-'+e.sequence,0,e.id)));
  expect(r.diagnostic?.code).toBe('ZERO_TIME_LOOP');expect(r.trace).toHaveLength(3);
  const b=new DeterministicScheduler(2,2);[0,1,2].forEach(i=>b.schedule(event('e'+i,i)));
  expect(b.run().diagnostic?.code).toBe('EVENT_BUDGET');
 });
 it('rejects duplicate and backdated events and allows cancellation',()=>{
  const s=new DeterministicScheduler();expect(s.schedule(event('a',1))).toBe(true);
  expect(s.schedule(event('a',2))).toBe(false);expect(s.snapshot().diagnostic?.code).toBe('DUPLICATE_EVENT');
  const t=new DeterministicScheduler();t.schedule(event('a',4));t.step();
  expect(t.schedule(event('prior',3))).toBe(false);expect(t.snapshot().diagnostic?.code).toBe('INVALID_EVENT');
  const u=new DeterministicScheduler();u.schedule(event('b',1));expect(u.cancel().pending).toHaveLength(0);
 });
});
