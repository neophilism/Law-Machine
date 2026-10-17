import {describe,it,expect} from 'vitest';
import {PostgresLeaseWorker} from '../../apps/jobs/src/postgres-lease-worker.ts';
import type {PgConnectionPool} from '../../apps/jobs/src/editorial-store.ts';
const org='11111111-1111-4111-8111-111111111111';
const id='33333333-3333-4333-8333-333333333333';
const doc='44444444-4444-4444-8444-444444444444';
const row={leased_id:id,leased_document_id:doc,leased_kind:'source-import',
 leased_fence:'3',leased_attempts:2,leased_checkpoint:{step:1}};
function setup(options:{hasJob?:boolean;failHandlerSql?:boolean;denyCompletion?:boolean}={}){
 const sql:string[]=[],params:unknown[][]=[];let released=0,claimed=false;
 const pool:PgConnectionPool={async connect(){return {
  async query<Row=Record<string,unknown>>(query:string,args:readonly unknown[]=[]){
   sql.push(query);params.push([...args]);
   if(options.failHandlerSql&&query.includes('lm_claim_job'))throw Error('PRIVATE_DB_DETAILS');
   let rows:unknown[]=[];
   if(query.includes('lm_claim_job')&&!claimed&&(options.hasJob??true)){claimed=true;rows=[row];}
   else if(query.includes('lm_job_heartbeat')||query.includes('lm_job_checkpoint')||
      query.includes('lm_complete_job')||query.includes('lm_fail_job'))
      rows=[{accepted:!(options.denyCompletion&&query.includes('lm_complete_job'))}];
   return {rows:rows as Row[]};
  },release(){released++;}
 };}};
 return {worker:new PostgresLeaseWorker(pool,org,'worker-a',10),sql,params,get released(){return released;}};
}
describe('LM-046 server-side SQL lease worker boundary',()=>{
 it('claims once, passes scoped context, checkpoints and completes on valid hash',async()=>{
  const x=setup();const status=await x.worker.runOnce(async context=>{
   expect(context.lease).toMatchObject({id,documentId:doc,workerId:'worker-a',fence:3,attempts:2});
   expect(context.lease.checkpoint).toEqual({step:1});
   expect(await context.heartbeat()).toBe(true);
   expect(await context.checkpoint({step:2})).toBe(true);
   return 'a'.repeat(64);
  });
  expect(status).toEqual({status:'completed',jobId:id});
  expect(x.sql.filter(x=>x==='BEGIN')).toHaveLength(4);
  expect(x.sql.filter(x=>x==='COMMIT')).toHaveLength(4);
  expect(x.sql.filter(x=>x==='ROLLBACK')).toHaveLength(0);
  expect(x.released).toBe(4);
  expect(x.sql).toContain('SELECT * FROM lm_claim_job($1,$2,$3)');
  expect(x.params.filter((_,i)=>x.sql[i]!.includes('set_config')).length).toBe(8);
 });
 it('does not claim a non-existent job or leave connection checked out',async()=>{
  const x=setup({hasJob:false});
  expect(await x.worker.runOnce(async()=>{throw Error('must not run');})).toEqual({status:'idle'});
  expect(x.released).toBe(1);
 });
 it('sanitizes failed handler and schedules retry through fenced SQL',async()=>{
  const x=setup();const outcome=await x.worker.runOnce(async()=>{throw Error('contains secret source bytes');});
  expect(outcome).toEqual({status:'retry-scheduled',jobId:id});
  expect(x.sql.some(s=>s.includes('lm_fail_job'))).toBe(true);
  const i=x.sql.findIndex(s=>s.includes('lm_fail_job'));
  expect(x.params[i]).toContain('WORKER_HANDLER_FAILED');
  expect(JSON.stringify(x.params)).not.toContain('contains secret');
 });
 it('rejects invalid digest and refuses completion after lost fence',async()=>{
  const x=setup();expect(await x.worker.runOnce(async()=> 'not-a-digest')).toEqual({status:'retry-scheduled',jobId:id});
  const y=setup({denyCompletion:true});
  expect(await y.worker.runOnce(async()=> 'b'.repeat(64))).toEqual({status:'stale-lease',jobId:id});
 });
 it('rolls back and releases pooled client on transient SQL error',async()=>{
  const x=setup({failHandlerSql:true});
  await expect(x.worker.claim()).rejects.toThrow('PRIVATE_DB_DETAILS');
  expect(x.sql).toContain('ROLLBACK');expect(x.sql).not.toContain('COMMIT');expect(x.released).toBe(1);
 });
 it('rejects invalid configs and skips unsafe checkpoints without database roundtrips',async()=>{
  const x=setup();
  expect(()=>new PostgresLeaseWorker({} as never,org,'worker-a')).toThrow('WORKER_CONFIG_INVALID');
  expect(()=>new PostgresLeaseWorker({connect:async()=>{throw Error('should not connect');}} as never,org,'w',80)).toThrow('WORKER_CONFIG_INVALID');
  const l=await x.worker.claim();
  expect(l).not.toBeNull();
  const before=x.sql.length;
  expect(await x.worker.checkpoint(l!,{value:Infinity})).toBe(false);
  expect(x.sql).toHaveLength(before);
  expect(await x.worker.complete(l!,'wrong')).toBe(false);
 });
});
