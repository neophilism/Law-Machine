import {describe,it,expect} from 'vitest';
import {FixtureLeaseQueue} from '../../apps/jobs/src/lease-queue.ts';
const org='fictional-organization',other='other-organization';
const job=(id='job-1',key='key-1',nowMs=1000)=>({
 orgId:org,id,documentId:'fictional-document',kind:'source-import' as const,
 idempotencyKey:key,maxAttempts:2,nowMs
});
describe('LM-046 fixture-only lease/fence oracle (no durable processing)',()=>{
 it('enforces organization-scoped idempotency and immutable job intent',()=>{
  const q=new FixtureLeaseQueue();
  expect(q.enqueue(job())).toBe('job-1');
  expect(q.enqueue({...job(),id:'some-other-id'})).toBe('job-1');
  expect(()=>q.enqueue({...job(),documentId:'different-document'})).toThrow('JOB_IDEMPOTENCY_CONFLICT');
  expect(q.enqueue({...job(),orgId:other})).toBe('job-1');
  expect(q.get(org,'job-1')?.state).toBe('queued');
 });
 it('recovers expired worker with newer fence and rejects late completion',()=>{
  const q=new FixtureLeaseQueue();q.enqueue(job());
  const first=q.claim(org,'worker-1',1000,2000)!;
  expect(q.claim(org,'worker-2',1500,2000)).toBeNull();
  const recovered=q.claim(org,'worker-2',3001,2000)!;
  expect(recovered.fence).toBeGreaterThan(first.fence);
  expect(recovered.attempts).toBe(2);
  expect(q.heartbeat(org,'job-1','worker-1',first.fence,3002,2000)).toBe(false);
  expect(q.complete(org,'job-1','worker-1',first.fence,3002,'a'.repeat(64))).toBe(false);
  expect(q.complete(org,'job-1','worker-2',recovered.fence,3002,'b'.repeat(64))).toBe(true);
  expect(q.get(org,'job-1')?.resultDigest).toBe('b'.repeat(64));
  expect(q.claim(org,'worker-3',4000,2000)).toBeNull();
 });
 it('uses bounded retry backoff and dead-letter terminal state',()=>{
  const q=new FixtureLeaseQueue();q.enqueue(job());
  const a=q.claim(org,'w',1000,1000)!;
  expect(q.fail(org,'job-1','w',a.fence,1100,'SOURCE_TEMPORARY',true)).toBe(true);
  expect(q.get(org,'job-1')?.availableAtMs).toBe(3100);
  expect(q.claim(org,'w',3000,1000)).toBeNull();
  const b=q.claim(org,'w',3100,1000)!;
  expect(q.fail(org,'job-1','w',b.fence,3200,'SOURCE_TEMPORARY',true)).toBe(true);
  expect(q.get(org,'job-1')?.state).toBe('failed');
  expect(q.claim(org,'w',5000,1000)).toBeNull();
 });
 it('does not revive workers after cancellation or exhausted expired lease',()=>{
  const q=new FixtureLeaseQueue();q.enqueue(job());
  const a=q.claim(org,'w',1000,1000)!;
  expect(q.cancel(org,'job-1')).toBe(true);
  expect(q.complete(org,'job-1','w',a.fence,1100,'a'.repeat(64))).toBe(false);
  expect(q.get(org,'job-1')?.state).toBe('cancelled');
  q.enqueue(job('job-2','key-2'));
  const x=q.claim(org,'w',1000,1000)!;
  q.claim(org,'w',2001,1000);
  expect(q.claim(org,'w',3002,1000)).toBeNull();
  expect(q.get(org,'job-2')?.lastErrorCode).toBe('LEASE_EXHAUSTED');
  expect(q.complete(org,'job-2','w',x.fence,3002,'a'.repeat(64))).toBe(false);
 });
 it('checkpoints only a current fence and never shares a mutable state reference',()=>{
  const q=new FixtureLeaseQueue();q.enqueue(job());
  const a=q.claim(org,'w',1000,1000)!;
  const payload={last:{step:1}};
  expect(q.checkpoint(org,'job-1','w',a.fence,1200,payload)).toBe(true);
  payload.last.step=9;
  expect(q.get(org,'job-1')?.checkpoint).toEqual({last:{step:1}});
  expect(q.checkpoint(other,'job-1','w',a.fence,1200,{})).toBe(false);
  expect(q.checkpoint(org,'job-1','w',a.fence,1200,[])).toBe(false);
  expect(q.heartbeat(org,'job-1','w',a.fence,1300,1000)).toBe(true);
  expect(q.checkpoint(org,'job-1','w',a.fence,2301,{})).toBe(false);
 });
 it('rejects malformed jobs, unsafe error codes, bogus completion digests',()=>{
  const q=new FixtureLeaseQueue();
  expect(()=>q.enqueue({...job(),maxAttempts:0})).toThrow('JOB_INPUT_INVALID');
  q.enqueue(job());
  const a=q.claim(org,'w',1000,1000)!;
  expect(q.complete(org,'job-1','w',a.fence,1200,'bad-digest')).toBe(false);
  expect(q.fail(org,'job-1','w',a.fence,1200,'raw:secret',true)).toBe(false);
  expect(q.get(org,'job-1')?.state).toBe('running');
 });
});
