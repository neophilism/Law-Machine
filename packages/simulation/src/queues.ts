/** LM-025: deterministic operational work, distinct from legal obligations. */
export type WorkItem={readonly id:string;readonly arrivedAt:number;readonly units:number;readonly legalDueTick:number|null;readonly assumptionId:string};
export type ServiceConfig={readonly workers:number;readonly unitsPerTick:number;readonly sourceKind:'assumption'|'empirical';readonly sourceId:string};
export type ServiceRecord={readonly itemId:string;readonly startedAt:number;readonly completedAt:number;readonly missedLegalDue:boolean|null;readonly modelingSource:string};
export type QueueResult={readonly records:readonly ServiceRecord[];readonly remaining:readonly WorkItem[];readonly consumedUnits:number;readonly capacityUnits:number;readonly failures:readonly {itemId:string;atTick:number}[]};
export type QueueInterventions={readonly outageTicks?:readonly number[];readonly failOnceItems?:readonly string[];readonly retryDelay?:number};
const tick=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function processQueue(items:readonly WorkItem[],config:ServiceConfig,untilTick:number,interventions:QueueInterventions={}):QueueResult{
 if(!Array.isArray(items)||items.length>10000||!tick(untilTick)||!config||!tick(config.workers)||config.workers>1000||
 !tick(config.unitsPerTick)||config.unitsPerTick>100000||!['assumption','empirical'].includes(config.sourceKind)||
 typeof config.sourceId!=='string'||!config.sourceId||config.sourceId.length>128)throw Error('QUEUE_INPUT_INVALID');
 if(!interventions||typeof interventions!=='object'||!Array.isArray(interventions.outageTicks??[])||!(interventions.outageTicks??[]).every(tick)||(interventions.outageTicks??[]).length>10000||!Array.isArray(interventions.failOnceItems??[])||!(interventions.failOnceItems??[]).every(x=>typeof x==='string')||(interventions.failOnceItems??[]).length>10000||!tick(interventions.retryDelay??1)||((interventions.retryDelay??1)<1))throw Error('INTERVENTION_INVALID');
 const outages=new Set(interventions.outageTicks??[]);
 const failuresOnce=new Set(interventions.failOnceItems??[]);
 const failed=new Set<string>();
 const failures:{itemId:string;atTick:number}[]=[];
 const names=new Set<string>();
 for(const x of items)if(!x||typeof x.id!=='string'||!x.id||names.has(x.id)||!tick(x.arrivedAt)||!tick(x.units)||x.units<1||!x.assumptionId||!(/^[\w:.-]{1,128}$/.test(x.assumptionId))||
 !(x.legalDueTick===null||tick(x.legalDueTick)))throw Error('WORK_ITEM_INVALID');else names.add(x.id);
 const ordered=[...items].sort((a,b)=>a.arrivedAt-b.arrivedAt||a.id.localeCompare(b.id,'en'));
 let remaining=ordered;
 const records:ServiceRecord[]=[];
 const capacity=config.workers*config.unitsPerTick;
 let consumed=0;
 for(let time=0;time<=untilTick;time++){
  // One item is processed atomically; unconsumed capacity never changes legal duties.
  let open=outages.has(time)?0:capacity;
  const next:WorkItem[]=[];
  for(const item of remaining){
   if(item.arrivedAt>time||item.units>open){next.push(item);continue;}
   open-=item.units;consumed+=item.units;
   if(failuresOnce.has(item.id)&&!failed.has(item.id)){
    failed.add(item.id);failures.push({itemId:item.id,atTick:time});
    next.push({...item,arrivedAt:time+(interventions.retryDelay??1)});
    continue;
   }
   records.push({itemId:item.id,startedAt:time,completedAt:time,missedLegalDue:item.legalDueTick===null?null:time>item.legalDueTick,modelingSource:config.sourceKind+':'+config.sourceId});
  }
  remaining=next;
 }
 return {records,remaining,consumedUnits:consumed,capacityUnits:capacity*(untilTick+1-[...outages].filter(t=>t<=untilTick).length),failures};
}
