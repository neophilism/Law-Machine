import type {PgConnectionPool,PgTransactionClient} from './editorial-store.ts';
import {canonicalJSON} from '../../../packages/contracts/src/integrity.ts';

/** LM-046 server-only PostgreSQL adapter. No provider credentials or HTTP handlers. */
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const WORKER=/^[A-Za-z0-9._:-]{1,128}$/;
const DIGEST=/^[a-f0-9]{64}$/;
export type JobLease={
 readonly id:string;readonly documentId:string;readonly kind:string;
 readonly fence:number;readonly attempts:number;readonly workerId:string;
 readonly checkpoint:Readonly<Record<string,unknown>>;
};
export type JobRunResult=
 | {readonly status:'idle'}
 | {readonly status:'completed';readonly jobId:string}
 | {readonly status:'retry-scheduled';readonly jobId:string}
 | {readonly status:'stale-lease';readonly jobId:string};
export interface LeaseContext {
 readonly lease:JobLease;
 /** Both operations fail closed if this lease expired, was cancelled, or got superseded. */
 heartbeat():Promise<boolean>;
 checkpoint(data:Readonly<Record<string,unknown>>):Promise<boolean>;
}
/**
 * Caller injects a server-only least-privileged PostgreSQL worker connection.
 * lm_jobs functions must be deployed via the reviewed 0004 migration.
 * This entry point must not be called from a Next.js browser route.
 */
export class PostgresLeaseWorker {
 constructor(
  private readonly pool:PgConnectionPool,
  private readonly organizationId:string,
  private readonly workerId:string,
  private readonly leaseSeconds=30
 ){
  if(!pool||typeof pool.connect!=='function'||!UUID.test(organizationId)||
     !WORKER.test(workerId)||!Number.isSafeInteger(leaseSeconds)||
     leaseSeconds<1||leaseSeconds>60)throw Error('WORKER_CONFIG_INVALID');
 }
 private async tx<T>(callback:(client:PgTransactionClient)=>Promise<T>):Promise<T>{
  const conn=await this.pool.connect();
  let began=false;
  try{
   await conn.query('BEGIN');began=true;
   await conn.query("SELECT set_config('app.organization_id',$1,true)",[this.organizationId]);
   await conn.query("SELECT set_config('app.worker_id',$1,true)",[this.workerId]);
   const result=await callback(conn);
   await conn.query('COMMIT');return result;
  }catch(err){
   if(began)try{await conn.query('ROLLBACK');}catch{/* avoid masking original error */}
   throw err;
  }finally{conn.release();}
 }
 private async booleanCall(sql:string,args:readonly unknown[]):Promise<boolean>{
  return this.tx(async conn=>{
   const response=await conn.query<{accepted:boolean}>(sql,args);
   if(response.rows.length!==1||typeof response.rows[0]?.accepted!=='boolean')
    throw Error('WORKER_SQL_PROTOCOL_INVALID');
   return response.rows[0].accepted;
  });
 }
 async claim():Promise<JobLease|null>{
  return this.tx(async conn=>{
   const result=await conn.query<{
    leased_id:string;leased_document_id:string;leased_kind:string;
    leased_fence:string|number;leased_attempts:number;
    leased_checkpoint:Record<string,unknown>;
   }>('SELECT * FROM lm_claim_job($1,$2,$3)',
     [this.organizationId,this.workerId,this.leaseSeconds]);
   if(result.rows.length===0)return null;
   if(result.rows.length!==1)throw Error('WORKER_SQL_PROTOCOL_INVALID');
   const row=result.rows[0]!,fence=Number(row.leased_fence);
   if(!UUID.test(row.leased_id)||!UUID.test(row.leased_document_id)||
      !['source-import','model-compile','release-validate'].includes(row.leased_kind)||
      !Number.isSafeInteger(fence)||fence<1||
      !Number.isSafeInteger(row.leased_attempts)||row.leased_attempts<1||
      !row.leased_checkpoint || Array.isArray(row.leased_checkpoint) ||
      typeof row.leased_checkpoint!=='object')
    throw Error('WORKER_SQL_PROTOCOL_INVALID');
   // Detached checkpoint cannot be mutated to change the committed SQL state.
   const checkpoint=JSON.parse(canonicalJSON(row.leased_checkpoint)) as Record<string,unknown>;
   return Object.freeze({
    id:row.leased_id,documentId:row.leased_document_id,kind:row.leased_kind,
    fence,attempts:row.leased_attempts,workerId:this.workerId,checkpoint
   });
  });
 }
 async heartbeat(lease:JobLease):Promise<boolean>{
  return this.booleanCall(
   'SELECT lm_job_heartbeat($1,$2,$3,$4,$5) AS accepted',
   [this.organizationId,lease.id,this.workerId,lease.fence,this.leaseSeconds]);
 }
 async checkpoint(lease:JobLease,value:Record<string,unknown>):Promise<boolean>{
  let encoded:string;
  try{encoded=canonicalJSON(value);}catch{return false;}
  if(!encoded.startsWith('{')||encoded.length>16384)return false;
  return this.booleanCall(
   'SELECT lm_job_checkpoint($1,$2,$3,$4,$5::jsonb) AS accepted',
   [this.organizationId,lease.id,this.workerId,lease.fence,encoded]);
 }
 async complete(lease:JobLease,digest:string):Promise<boolean>{
  if(!DIGEST.test(digest))return false;
  return this.booleanCall(
   'SELECT lm_complete_job($1,$2,$3,$4,$5) AS accepted',
   [this.organizationId,lease.id,this.workerId,lease.fence,digest]);
 }
 async fail(lease:JobLease,code='WORKER_HANDLER_FAILED',retryable=true):Promise<boolean>{
  if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(code))return false;
  return this.booleanCall(
   'SELECT lm_fail_job($1,$2,$3,$4,$5,$6) AS accepted',
   [this.organizationId,lease.id,this.workerId,lease.fence,code,retryable]);
 }
 /** One deterministic unit of work, not an unattended scheduler or HTTP endpoint. */
 async runOnce(handler:(context:LeaseContext)=>Promise<string>):Promise<JobRunResult>{
  const lease=await this.claim();
  if(!lease)return {status:'idle'};
  let digest:string;
  try{
   digest=await handler({
    lease,
    heartbeat:()=>this.heartbeat(lease),
    checkpoint:(data)=>this.checkpoint(lease,data)
   });
   if(typeof digest!=='string'||!DIGEST.test(digest))
    throw Error('WORKER_DIGEST_INVALID');
  }catch{
   // Never serialize provider exceptions or private source bytes into job state.
   const accepted=await this.fail(lease,'WORKER_HANDLER_FAILED',true);
   return {status:accepted?'retry-scheduled':'stale-lease',jobId:lease.id};
  }
  const accepted=await this.complete(lease,digest);
  return {status:accepted?'completed':'stale-lease',jobId:lease.id};
 }
}
