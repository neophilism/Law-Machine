import {describe,it,expect} from 'vitest';
import {ReplayStream,namedStream,runIdentity,checkpoint,exportReplay,importReplay,fixedRound,type ReplayDescriptor} from '../../packages/simulation/src/replay.ts';
const descriptor:ReplayDescriptor={engineVersion:'1.0.0',calendarVersion:'cal-1',modelDigest:'a'.repeat(64),scenarioId:'toy',seed:42,facts:{b:2,a:1}};
describe('LM-026 deterministic replay',()=>{
 it('canonical identity ignores object key order but notices engine and calendar changes',async()=>{
  const id=await runIdentity(descriptor);
  expect(await runIdentity({...descriptor,facts:{a:1,b:2}})).toBe(id);
  expect(await runIdentity({...descriptor,engineVersion:'1.0.1'})).not.toBe(id);
  expect(await runIdentity({...descriptor,calendarVersion:'cal-2'})).not.toBe(id);
 });
 it('identical stream seeds replay deterministically',()=>{
  const a=new ReplayStream(1,'x');const b=new ReplayStream(1,'x');
  expect([a.nextUint32(),a.nextUint32(),a.nextUint32()]).toEqual([b.nextUint32(),b.nextUint32(),b.nextUint32()]);
 });
 it('named streams remain isolated when one subsystem consumes more events',async()=>{
  const a=await namedStream(descriptor,'routing'); const b=await namedStream(descriptor,'load');
  const expected=await namedStream(descriptor,'load');
  a.nextUnit();a.nextUnit();a.nextUnit();
  expect(b.nextUint32()).toBe(expected.nextUint32());
 });
 it('retains checkpoint and roundtrip replay identity',async()=>{
  const c=await checkpoint('event-1',[{tick:1}]);const text=exportReplay(descriptor,[c]);
  expect(importReplay(text)).toEqual({descriptor,checkpoints:[c]});
  expect(fixedRound(1.23456789)).toBe(1.234568);
 });
 it('rejects malformed and incompatible inputs',async()=>{
  await expect(runIdentity({...descriptor,seed:-1})).rejects.toThrow('INVALID_REPLAY_DESCRIPTOR');
  expect(()=>importReplay('{"format":"v0"}')).toThrow('INCOMPATIBLE_REPLAY_FORMAT');
  expect(()=>importReplay('not-json')).toThrow('INVALID_REPLAY_JSON');
 });
});
