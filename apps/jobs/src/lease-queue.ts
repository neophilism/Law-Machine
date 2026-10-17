import {canonicalJSON} from '../../../packages/contracts/src/integrity.ts';

/**
 * LM-046 in-memory deterministic lease/fencing reference state machine.
 * NOT a durable/transactional queue. A production PostgreSQL implementation
 * must give each transition equivalent atomic CAS + tenant checks.
 */
type JobKind='source-import'|'model-compile'|'release-validate';
type JobState='queued'|'running'|'completed'|'failed'|'cancelled';
export type EnqueueJob={
 readonly orgId:string;readonly id:string;readonly documentId:string;
 readonly kind:JobKind;readonly idempotencyKey:string;
 readonly maxAttempts:number;readonly nowMs:number;
};
export type LeasedJob={
 readonly orgId:string;readonly id:string;readonly documentId:string;
 readonly kind:JobKind;readonly attempts:number;readonly fence:number;
 readonly leaseUntilMs:number;readonly workerId:string;
 readonly checkpoint:Readonly<Record<string,unknown>>;
};
export type JobSnapshot={
 readonly orgId:string;readonly id:string;readonly kind:JobKind;
 readonly state:JobState;readonly attempts:number;readonly fence:number;
 readonly availableAtMs:number;readonly leaseUntilMs:number|null;
 readonly checkpoint:Readonly<Record<string,unknown>>;
 readonly resultDigest:string|null;readonly lastErrorCode:string|null;
};
type InternalJob=EnqueueJob&{
 state:JobState;attempts:number;fence:number;
 availableAtMs:number;leaseUntilMs:number|null;workerId:string|null;
 checkpoint:Record<string,unknown>;resultDigest:string|null;lastErrorCode:string|null;
};
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SHA=/^[a-f0-9]{64}$/;
const ERROR=/^[A-Z][A-Z0-9_]{0,63}$/;
const clock=(now:number)=>Number.isSafeInteger(now)&&now>=0;
const copy=(x:Record<string,unknown>)=>JSON.parse(canonicalJSON(x)) as Record<string,unknown>;
function jobKey(org:string,id:string){return org+'|'+id;}
function validId(x:unknown):x is string {return typeof x==='string'&&ID.test(x);}
export class FixtureLeaseQueue {
 private readonly jobs=new Map<string,InternalJob>();
 private readonly byIdempotency=new Map<string,string>();
 enqueue(data:EnqueueJob):string{
  if(!data||![data.orgId,data.id,data.documentId,data.idempotencyKey].every(validId)||
     !['source-import','model-compile','release-validate'].includes(data.kind)||
     !Number.isSafeInteger(data.maxAttempts)||data.maxAttempts<1||data.maxAttempts>10||
     !clock(data.nowMs))throw Error('JOB_INPUT_INVALID');
  const key=jobKey(data.orgId,data.id),idempotency=jobKey(data.orgId,data.idempotencyKey);
  const priorId=this.byIdempotency.get(idempotency);
  if(priorId!==undefined){
   const prior=this.jobs.get(jobKey(data.orgId,priorId))!;
   if(prior.documentId!==data.documentId||prior.kind!==data.kind||
      prior.maxAttempts!==data.maxAttempts)throw Error('JOB_IDEMPOTENCY_CONFLICT');
   return prior.id;
  }
  if(this.jobs.has(key))throw Error('JOB_ID_COLLISION');
  this.jobs.set(key,{...data,state:'queued',attempts:0,fence:0,
   availableAtMs:data.nowMs,leaseUntilMs:null,workerId:null,
   checkpoint:{},resultDigest:null,lastErrorCode:null});
  this.byIdempotency.set(idempotency,data.id);
  return data.id;
 }
 claim(org:string,worker:string,nowMs:number,leaseMs:number):LeasedJob|null{
  if(!validId(org)||!validId(worker)||!clock(nowMs)||
     !Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>60000)
    throw Error('JOB_CLAIM_INVALID');
  for(const job of this.jobs.values()){
   if(job.orgId!==org)continue;
   if(job.state==='running'&&job.leaseUntilMs!==null&&job.leaseUntilMs<=nowMs&&
      job.attempts>=job.maxAttempts){
    job.state='failed';job.leaseUntilMs=null;job.workerId=null;
    job.fence++;job.lastErrorCode='LEASE_EXHAUSTED';
   }
  }
  const ready=[...this.jobs.values()].filter(j=>j.orgId===org&&
    ((j.state==='queued'&&j.availableAtMs<=nowMs)||
      (j.state==='running'&&j.leaseUntilMs!==null&&j.leaseUntilMs<=nowMs))&&
    j.attempts<j.maxAttempts).sort((a,b)=>a.availableAtMs-b.availableAtMs||
      a.nowMs-b.nowMs||a.id.localeCompare(b.id));
  const job=ready[0];
  if(!job)return null;
  job.state='running';job.attempts++;job.fence++;
  job.leaseUntilMs=nowMs+leaseMs;job.workerId=worker;
  return {orgId:org,id:job.id,documentId:job.documentId,kind:job.kind,
   attempts:job.attempts,fence:job.fence,leaseUntilMs:job.leaseUntilMs,
   workerId:worker,checkpoint:copy(job.checkpoint)};
 }
 private validLease(org:string,id:string,worker:string,fence:number,nowMs:number):InternalJob|null{
  const job=this.jobs.get(jobKey(org,id));
  if(!job||job.state!=='running'||job.workerId!==worker||
     job.fence!==fence||!clock(nowMs)||
     job.leaseUntilMs===null||job.leaseUntilMs<=nowMs)return null;
  return job;
 }
 heartbeat(org:string,id:string,worker:string,fence:number,nowMs:number,leaseMs:number):boolean{
  if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>60000)return false;
  const job=this.validLease(org,id,worker,fence,nowMs);
  if(!job)return false;
  job.leaseUntilMs=nowMs+leaseMs;
  return true;
 }
 checkpoint(org:string,id:string,worker:string,fence:number,nowMs:number,value:unknown):boolean{
  const job=this.validLease(org,id,worker,fence,nowMs);
  if(!job)return false;
  let canonical:string;
  try{canonical=canonicalJSON(value);}catch{return false;}
  if(!canonical.startsWith('{')||canonical.length>16384)return false;
  job.checkpoint=JSON.parse(canonical) as Record<string,unknown>;
  return true;
 }
 complete(org:string,id:string,worker:string,fence:number,nowMs:number,digest:string):boolean{
  const job=this.validLease(org,id,worker,fence,nowMs);
  if(!job||!SHA.test(digest))return false;
  job.state='completed';job.leaseUntilMs=null;job.workerId=null;
  job.resultDigest=digest;return true;
 }
 fail(org:string,id:string,worker:string,fence:number,nowMs:number,
      errorCode:string,retryable:boolean):boolean{
  const job=this.validLease(org,id,worker,fence,nowMs);
  if(!job||!ERROR.test(errorCode))return false;
  job.lastErrorCode=errorCode;job.leaseUntilMs=null;job.workerId=null;
  if(retryable&&job.attempts<job.maxAttempts){
   job.state='queued';job.availableAtMs=nowMs+Math.min(60000,1000*2**job.attempts);
  }else job.state='failed';
  return true;
 }
 cancel(org:string,id:string):boolean{
  const job=this.jobs.get(jobKey(org,id));
  if(!job||job.state==='completed'||job.state==='cancelled')return false;
  job.state='cancelled';job.leaseUntilMs=null;job.workerId=null;
  job.fence++;return true;
 }
 get(org:string,id:string):JobSnapshot|null{
  const j=this.jobs.get(jobKey(org,id));
  if(!j)return null;
  return {orgId:j.orgId,id:j.id,kind:j.kind,state:j.state,attempts:j.attempts,
   fence:j.fence,availableAtMs:j.availableAtMs,leaseUntilMs:j.leaseUntilMs,
   checkpoint:copy(j.checkpoint),resultDigest:j.resultDigest,lastErrorCode:j.lastErrorCode};
 }
}
