/** LM-025: deterministic operational work, distinct from legal obligations. */
export type WorkItem={readonly id:string;readonly arrivedAt:number;readonly units:number;readonly legalDueTick:number|null;readonly assumptionId:string};
export type ServiceConfig={readonly workers:number;readonly unitsPerTick:number;readonly sourceKind:'assumption'|'empirical';readonly sourceId:string};
export type ServiceRecord={readonly itemId:string;readonly startedAt:number;readonly completedAt:number;readonly missedLegalDue:boolean|null;readonly modelingSource:string};
export type QueueResult={readonly records:readonly ServiceRecord[];readonly remaining:readonly WorkItem[];readonly consumedUnits:number;readonly capacityUnits:number};
const tick=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function processQueue(items:readonly WorkItem[],config:ServiceConfig,untilTick:number):QueueResult{
 if(!Array.isArray(items)||items.length>10000||!tick(untilTick)||!config||!tick(config.workers)||config.workers>1000||
 !tick(config.unitsPerTick)||config.unitsPerTick>100000||!['assumption','empirical'].includes(config.sourceKind)||
 typeof config.sourceId!=='string'||!config.sourceId||config.sourceId.length>128)throw Error('QUEUE_INPUT_INVALID');
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
  let open=capacity;
  const next:WorkItem[]=[];
  for(const item of remaining){
   if(item.arrivedAt>time||item.units>open){next.push(item);continue;}
   open-=item.units;consumed+=item.units;
   records.push({itemId:item.id,startedAt:time,completedAt:time,missedLegalDue:item.legalDueTick===null?null:time>item.legalDueTick,modelingSource:config.sourceKind+':'+config.sourceId});
  }
  remaining=next;
 }
 return {records,remaining,consumedUnits:consumed,capacityUnits:capacity*(untilTick+1)};
}
