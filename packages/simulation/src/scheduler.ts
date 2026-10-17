/** LM-021 deterministic, provider-free scheduler. Time is a simulated integer tick, not wall time. */
export type ScheduledEvent={readonly id:string;readonly tick:number;readonly actorId:string;readonly kind:string;readonly causeId:string|null;readonly sourceRefs:readonly string[]};
export type TraceEvent=ScheduledEvent & {readonly sequence:number};
export type SchedulerStatus='ready'|'paused'|'completed'|'stopped';
export type SchedulerDiagnostic={readonly code:'EVENT_BUDGET'|'ZERO_TIME_LOOP'|'INVALID_EVENT'|'DUPLICATE_EVENT'|'INVALID_SNAPSHOT';readonly eventId:string|null};
export type SchedulerSnapshot={readonly status:SchedulerStatus;readonly trace:readonly TraceEvent[];readonly pending:readonly ScheduledEvent[];readonly diagnostic:SchedulerDiagnostic|null};
const valid=(v:ScheduledEvent):boolean=>!!v&&/^[\w:.-]{1,128}$/.test(v.id)&&Number.isSafeInteger(v.tick)&&v.tick>=0&&
 typeof v.actorId==='string'&&v.actorId.length>0&&v.actorId.length<=128&&typeof v.kind==='string'&&v.kind.length>0&&v.kind.length<=128&&
 (v.causeId===null||typeof v.causeId==='string')&&Array.isArray(v.sourceRefs)&&v.sourceRefs.length>0&&v.sourceRefs.every(s=>typeof s==='string'&&s.length>0&&s.length<=256);
export class DeterministicScheduler {
 private queue:ScheduledEvent[]=[];
 private visited=new Set<string>();
 private trace:TraceEvent[]=[];
 private status:SchedulerStatus='ready';
 private diagnostic:SchedulerDiagnostic|null=null;
 private latestTick=0;
 private sameTickCount=0;
 constructor(readonly maxEvents=10000,readonly maxSameTick=1000){
  if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>100000||!Number.isSafeInteger(maxSameTick)||maxSameTick<1||maxSameTick>maxEvents)throw Error('INVALID_BUDGET');
 }
 schedule(event:ScheduledEvent):boolean{
  if(this.status==='stopped'||this.status==='completed')return false;
  if(!valid(event)||event.tick<this.latestTick){this.stop('INVALID_EVENT',event?.id??null);return false;}
  if(this.visited.has(event.id)){this.stop('DUPLICATE_EVENT',event.id);return false;}
  this.visited.add(event.id);
  this.queue.push({...event,sourceRefs:[...event.sourceRefs]});
  this.queue.sort((a,b)=>a.tick-b.tick||a.id.localeCompare(b.id,'en'));
  return true;
 }
 step():TraceEvent|null{
  if(this.status==='stopped'||this.status==='completed')return null;
  const event=this.queue[0];
  if(!event){this.status='completed';return null;}
  if(this.trace.length>=this.maxEvents){this.stop('EVENT_BUDGET',event.id);return null;}
  const same=event.tick===this.latestTick?this.sameTickCount+1:1;
  if(same>this.maxSameTick){this.stop('ZERO_TIME_LOOP',event.id);return null;}
  this.queue.shift();
  this.latestTick=event.tick;this.sameTickCount=same;
  const entry=Object.freeze({...event,sourceRefs:Object.freeze([...event.sourceRefs]),sequence:this.trace.length});
  this.trace.push(entry);
  this.status='paused';
  return entry;
 }
 run(onEvent?:(event:TraceEvent,scheduler:DeterministicScheduler)=>void):SchedulerSnapshot{
  if(this.status==='completed'||this.status==='stopped')return this.snapshot();
  while(this.queue.length&&this.status!=='stopped'){
   const e=this.step();
   if(!e)break;
   onEvent?.(e,this);
  }
  if(this.status!=='stopped')this.status='completed';
  return this.snapshot();
 }
 pause():SchedulerSnapshot{if(this.status==='ready')this.status='paused';return this.snapshot();}
 resume(onEvent?:(event:TraceEvent,scheduler:DeterministicScheduler)=>void):SchedulerSnapshot{return this.run(onEvent);}
 cancel():SchedulerSnapshot{this.status='stopped';this.queue=[];return this.snapshot();}
 snapshot():SchedulerSnapshot{return Object.freeze({status:this.status,trace:Object.freeze([...this.trace]),pending:Object.freeze(this.queue.map(x=>Object.freeze({...x,sourceRefs:Object.freeze([...x.sourceRefs])}))),diagnostic:this.diagnostic});}
 private stop(code:SchedulerDiagnostic['code'],eventId:string|null){this.status='stopped';this.diagnostic={code,eventId};this.queue=[];}
}
