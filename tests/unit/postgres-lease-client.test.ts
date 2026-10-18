import { describe, expect, it } from 'vitest';
import { PostgresLeaseClient, type DurableLease, type TrustedWorkerTenant }
  from '../../apps/jobs/src/postgres-lease-client.ts';
import type { PgConnectionPool } from '../../apps/jobs/src/editorial-store.ts';

const org = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const documentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const jobId = '55555555-5555-4555-8555-555555555555';
const scope: TrustedWorkerTenant = {orgId: org, serverVerified: true};
type Seen = {sql: string; params: readonly unknown[]};
function fixture(
  reply: (sql: string) => readonly Record<string, unknown>[] = () => []
): {pool: PgConnectionPool; seen: Seen[]; released: () => number} {
  const seen: Seen[] = [];
  let releaseCount = 0;
  const pool: PgConnectionPool = {
    connect: async () => ({
      query: async <Row = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
        seen.push({sql,params});
        return {rows: reply(sql) as readonly Row[]};
      },
      release: () => { releaseCount++; }
    })
  };
  return {pool,seen,released: () => releaseCount};
}
function sampleLease(): DurableLease {
  return {orgId:org,id:jobId,documentId,workerId:'worker.1',kind:'source-import',
    fence:9007199254740993n,attempts:1,leaseUntil:'2026-10-17 21:30:00+00',
    checkpoint:{}};
}
describe('LM-046 PostgreSQL lease boundary (not a deployed worker)', () => {
  it('begins, applies transaction-local tenant scope, claims and releases the session', async () => {
    const f=fixture(sql=>sql.includes('FROM lm_claim_job') ? [{
      leased_id:jobId,leased_document_id:documentId,leased_kind:'source-import',
      leased_fence:'9007199254740993',leased_attempts:1,
      lease_until:'2026-10-17 21:30:00+00',leased_checkpoint:{phase:'quarantined'}
    }] : []);
    const client = new PostgresLeaseClient(f.pool,scope);
    const lease=await client.claim('worker.1',30);
    expect(lease).toMatchObject({id:jobId,orgId:org,documentId,
      workerId:'worker.1',kind:'source-import',attempts:1,
      checkpoint:{phase:'quarantined'}});
    expect(lease?.fence).toBe(9007199254740993n);
    expect(f.seen.map(x=>x.sql)).toEqual([
      'BEGIN',"SELECT set_config('app.organization_id',$1,true)",
      expect.stringContaining('FROM lm_claim_job'),'COMMIT'
    ]);
    expect(f.seen[1]?.params).toEqual([org]);
    expect(f.seen[2]?.params).toEqual([org,'worker.1',30]);
    expect(f.released()).toBe(1);
  });
  it('maps empty claims to idle work, and preserves idempotency arguments', async () => {
    const f=fixture(sql=>sql.includes('lm_enqueue_job') ? [{job_id:jobId}] : []);
    const c=new PostgresLeaseClient(f.pool,scope);
    expect(await c.claim('worker.2',1)).toBeNull();
    expect(await c.enqueue({id:jobId,documentId,kind:'model-compile',
      idempotencyKey:'compile:revision.1',maxAttempts:3})).toBe(jobId);
    const enqueued=f.seen.find(x=>x.sql.includes('lm_enqueue_job'));
    expect(enqueued?.params).toEqual([org,jobId,documentId,
      'model-compile','compile:revision.1',3]);
    expect(f.released()).toBe(2);
  });
  it('uses exact 64-bit fencing and server-side CAS for every transition', async () => {
    const f=fixture(sql=>sql.includes(' AS accepted') ? [{accepted:true}] :
      sql.includes('lm_reap_exhausted_jobs') ? [{reaped:'2'}] : []);
    const c=new PostgresLeaseClient(f.pool,scope);
    const lease=sampleLease();
    expect(await c.heartbeat(lease,10)).toBe(true);
    const checkpoint={step:1,nested:{verified:false}};
    expect(await c.checkpoint(lease,checkpoint)).toBe(true);
    checkpoint.nested.verified=true;
    expect(await c.complete(lease,'a'.repeat(64))).toBe(true);
    expect(await c.fail(lease,'SOURCE_UNAVAILABLE',true)).toBe(true);
    expect(await c.cancel(jobId)).toBe(true);
    expect(await c.reapExhausted()).toBe(2n);
    const calls=f.seen.filter(x=>x.sql.includes('lm_job_') || x.sql.includes('lm_complete_job') || x.sql.includes('lm_fail_job'));
    expect(calls).toHaveLength(4);
    for(const call of calls)expect(call.params[3]).toBe('9007199254740993');
    expect(f.seen.find(x=>x.sql.includes('lm_job_checkpoint'))?.params[4])
      .toBe('{"nested":{"verified":false},"step":1}');
    expect(f.released()).toBe(6);
  });
  it('rejects malformed, foreign or forged leases before accessing database', async () => {
    const f=fixture();
    const c=new PostgresLeaseClient(f.pool,scope);
    await expect(c.claim('no spaces allowed',30)).rejects.toThrow('JOB_CLAIM_INVALID');
    await expect(c.claim('worker',0)).rejects.toThrow('JOB_CLAIM_INVALID');
    await expect(c.complete({...sampleLease(),orgId:otherOrg},'a'.repeat(64)))
      .rejects.toThrow('JOB_LEASE_SCOPE_INVALID');
    await expect(c.complete({...sampleLease(),fence:0n},'a'.repeat(64)))
      .rejects.toThrow('JOB_FENCE_INVALID');
    await expect(c.complete(sampleLease(),'not-a-digest')).rejects.toThrow('JOB_DIGEST_INVALID');
    await expect(c.checkpoint(sampleLease(),['not-an-object']))
      .rejects.toThrow('JOB_CHECKPOINT_INVALID');
    await expect(c.fail(sampleLease(),'raw:PRIVATE_SECRET',true))
      .rejects.toThrow('JOB_ERROR_CODE_INVALID');
    await expect(c.enqueue({id:jobId,documentId,kind:'source-import',
      idempotencyKey:'unsafe key',maxAttempts:3})).rejects.toThrow('JOB_ENQUEUE_INVALID');
    expect(f.seen).toEqual([]);
    expect(()=>new PostgresLeaseClient(f.pool,{orgId:otherOrg,serverVerified:false as never}))
      .toThrow('JOB_WORKER_SCOPE_INVALID');
  });
  it('rolls back on a database scope error and releases its pooled session', async () => {
    const seen: string[]=[];
    let released=0;
    const pool: PgConnectionPool={connect:async()=>({
      query:async <Row = Record<string, unknown>>(sql:string)=>{
        seen.push(sql);
        if(sql.includes('lm_cancel_job'))throw Error('LM_JOB_SCOPE_DENIED');
        return {rows:[] as readonly Row[]};
      },
      release:()=>{released++;}
    })};
    const c=new PostgresLeaseClient(pool,scope);
    await expect(c.cancel(jobId)).rejects.toThrow('LM_JOB_SCOPE_DENIED');
    expect(seen).toEqual(['BEGIN',"SELECT set_config('app.organization_id',$1,true)",
      expect.stringContaining('lm_cancel_job'),'ROLLBACK']);
    expect(released).toBe(1);
  });
  it('fails closed on malformed PostgreSQL claim/checkpoint rows', async () => {
    const f=fixture(sql=>sql.includes('FROM lm_claim_job') ? [{
      leased_id:jobId,leased_document_id:documentId,leased_kind:'source-import',
      leased_fence:'bad',leased_attempts:1,
      lease_until:'2026-10-17 21:30:00+00',leased_checkpoint:{}
    }] : []);
    const c=new PostgresLeaseClient(f.pool,scope);
    await expect(c.claim('worker',10)).rejects.toThrow('JOB_LEASE_ROW_INVALID');
    expect(f.seen.at(-1)?.sql).toBe('ROLLBACK');
    expect(f.released()).toBe(1);
  });
});
