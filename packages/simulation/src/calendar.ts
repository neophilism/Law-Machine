import type { SourceRef } from '../../contracts/src/model.ts';

/** LM-022 versioned civil calendar and source-linked hypothetical deadline arithmetic. */
export type LegalCalendar={
 readonly id:string;readonly version:string;readonly timeZone:string;
 /** JS weekday numbers, 0 = Sunday. Never assume jurisdiction defaults. */
 readonly weekendDays:readonly number[];
 /** Explicit observed dates supplied by an approved source or assumption. */
 readonly observedHolidays:readonly string[];
};
export type DeadlineUnit='calendar-day'|'business-day'|'calendar-month'|'elapsed-hour';
export type DeadlinePolicy={
 readonly id:string;readonly calendarId:string;readonly calendarVersion:string;
 readonly amount:number;readonly unit:DeadlineUnit;
 readonly startCounting:'exclude-trigger'|'include-trigger';
 readonly monthEnd:'clamp'|'unresolved';
 readonly nonBusinessDue:'extend'|'keep'|'unresolved';
 readonly cutoffTime:string|null;
 readonly afterCutoff:'next-business-day'|'same-day'|'unresolved';
 /** The legal source or an explicitly classified interpretation must be pinned. */
 readonly sourceRefs:readonly SourceRef[];
 readonly interpretationId?:string;
};
export type DeadlineResult={
 readonly state:'resolved'|'unresolved';
 readonly dueDate:string|null;readonly dueLocalTime:string|null;
 readonly dueInstant:string|null;
 readonly calendarId:string;readonly calendarVersion:string;
 readonly sourceRefs:readonly SourceRef[];
 readonly reasons:readonly string[];
};
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const iso=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const fromDay=(date:string)=>new Date(date+'T00:00:00Z');
const formatDay=(d:Date)=>d.toISOString().slice(0,10);
function addDays(date:string,days:number):string{
 const d=fromDay(date);d.setUTCDate(d.getUTCDate()+days);
 return formatDay(d);
}
const weekday=(date:string)=>fromDay(date).getUTCDay();
const localParts=(instant:Date,zone:string)=>{
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=fmt.formatToParts(instant);
 const pick=(type:string)=>parts.find(p=>p.type===type)?.value??'';
 return {date:pick('year')+'-'+pick('month')+'-'+pick('day'),
  time:pick('hour')+':'+pick('minute')};
};
function validCalendar(v:LegalCalendar):boolean{
 if(!v||!ident(v.id)||!ident(v.version)||typeof v.timeZone!=='string'||v.timeZone.length>100||
  !Array.isArray(v.weekendDays)||!v.weekendDays.length||v.weekendDays.length>6||
  !v.weekendDays.every(n=>Number.isInteger(n)&&n>=0&&n<=6)||
  new Set(v.weekendDays).size!==v.weekendDays.length||
  !Array.isArray(v.observedHolidays)||v.observedHolidays.length>5000||
  !v.observedHolidays.every(iso)||new Set(v.observedHolidays).size!==v.observedHolidays.length)return false;
 try{new Intl.DateTimeFormat('en',{timeZone:v.timeZone}).format(new Date());}
 catch{return false;}
 return true;
}
const sourceValid=(v:unknown):v is SourceRef=>{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const r=v as Record<string,unknown>;
 return ident(r.versionId)&&ident(r.provisionId)&&typeof r.sourceDigest==='string'&&
  /^[a-f0-9]{64}$/.test(r.sourceDigest)&&typeof r.quote==='string'&&
  !!r.quote.trim()&&r.quote.length<=8192;
};
function isBusiness(date:string,calendar:LegalCalendar,holidays:ReadonlySet<string>){
 return !calendar.weekendDays.includes(weekday(date))&&!holidays.has(date);
}
function shiftToBusiness(date:string,calendar:LegalCalendar,holidays:ReadonlySet<string>):string{
 let current=date;
 // Bounded because at least one weekday is open and holiday inventory <=5000.
 for(let i=0;i<6000;i++){
  if(isBusiness(current,calendar,holidays))return current;
  current=addDays(current,1);
 }
 throw Error('CALENDAR_SEARCH_LIMIT');
}
function addMonths(date:string,months:number,policy:DeadlinePolicy):string|null{
 const d=fromDay(date),year=d.getUTCFullYear(),month=d.getUTCMonth(),day=d.getUTCDate();
 const first=new Date(Date.UTC(year,month+months,1));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 if(day>last&&policy.monthEnd==='unresolved')return null;
 return formatDay(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last))));
}

export function calculateHypotheticalDeadline(
 calendar:LegalCalendar,policy:DeadlinePolicy,trigger:string
):DeadlineResult{
 const reasons:string[]=[];
 const result=(state:DeadlineResult['state'],dueDate:string|null=null,
  dueLocalTime:string|null=null,dueInstant:string|null=null):DeadlineResult=>({
   state,dueDate,dueLocalTime,dueInstant,calendarId:calendar?.id??'unknown',
   calendarVersion:calendar?.version??'unknown',sourceRefs:policy?.sourceRefs??[],reasons
  });
 if(!validCalendar(calendar))throw Error('CALENDAR_INVALID');
 if(!policy||!ident(policy.id)||policy.calendarId!==calendar.id||policy.calendarVersion!==calendar.version||
  !Number.isSafeInteger(policy.amount)||policy.amount<0||policy.amount>5000||
  !['calendar-day','business-day','calendar-month','elapsed-hour'].includes(policy.unit)||
  !['exclude-trigger','include-trigger'].includes(policy.startCounting)||
  !['clamp','unresolved'].includes(policy.monthEnd)||
  !['extend','keep','unresolved'].includes(policy.nonBusinessDue)||
  !['next-business-day','same-day','unresolved'].includes(policy.afterCutoff)||
  !(policy.cutoffTime===null||typeof policy.cutoffTime==='string'&&
   /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(policy.cutoffTime))||
  !Array.isArray(policy.sourceRefs)||policy.sourceRefs.length>100)
  throw Error('COUNTING_POLICY_INVALID');
 if(!policy.sourceRefs.length||!policy.sourceRefs.every(sourceValid)){
  reasons.push('COUNTING_PROVENANCE_MISSING');return result('unresolved');
 }
 if(policy.interpretationId!==undefined&&!ident(policy.interpretationId))
  throw Error('INTERPRETATION_INVALID');
 if(policy.amount===0){reasons.push('ZERO_DURATION_INTERPRETATION_REQUIRED');return result('unresolved');}
 const isInstant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(trigger);
 if(!isInstant&&!iso(trigger))throw Error('TRIGGER_DATE_INVALID');
 const instant=isInstant?new Date(trigger):null;
 if(instant&&(!Number.isFinite(instant.getTime())||instant.toISOString().slice(0,10)!==trigger.slice(0,10)))
  throw Error('TRIGGER_DATE_INVALID');
 const local=instant?localParts(instant,calendar.timeZone):{date:trigger,time:''};
 const holidays=new Set(calendar.observedHolidays);
 let start=local.date;
 if(policy.cutoffTime!==null){
  if(!instant){reasons.push('TRIGGER_TIME_UNKNOWN');return result('unresolved');}
  if(local.time>policy.cutoffTime){
   if(policy.afterCutoff==='unresolved'){reasons.push('CUTOFF_INTERPRETATION_REQUIRED');return result('unresolved');}
   if(policy.afterCutoff==='next-business-day')start=shiftToBusiness(addDays(start,1),calendar,holidays);
  }
 }
 if(policy.unit==='elapsed-hour'){
  if(!instant){reasons.push('INSTANT_REQUIRED_FOR_ELAPSED_HOURS');return result('unresolved');}
  if(policy.startCounting==='include-trigger'){reasons.push('HOUR_COUNTING_INTERPRETATION_REQUIRED');return result('unresolved');}
  if(start!==local.date){reasons.push('HOUR_CUTOFF_INTERPRETATION_REQUIRED');return result('unresolved');}
  const dueInstant=new Date(instant.getTime()+policy.amount*3600000);
  const due=localParts(dueInstant,calendar.timeZone);
  if(policy.nonBusinessDue==='unresolved'&&!isBusiness(due.date,calendar,holidays)){
   reasons.push('NONBUSINESS_EXTENSION_INTERPRETATION_REQUIRED');return result('unresolved');
  }
  if(policy.nonBusinessDue==='extend'&&!isBusiness(due.date,calendar,holidays)){
   reasons.push('HOUR_EXTENSION_INTERPRETATION_REQUIRED');return result('unresolved');
  }
  return result('resolved',due.date,due.time,dueInstant.toISOString());
 }
 let due:string;
 if(policy.unit==='business-day'){
  let remaining=policy.amount-(policy.startCounting==='include-trigger'&&isBusiness(start,calendar,holidays)?1:0);
  due=start;
  for(let steps=0;remaining>0&&steps<6000;steps++){
   due=addDays(due,1);
   if(isBusiness(due,calendar,holidays))remaining--;
  }
  if(remaining>0){reasons.push('BUSINESS_DAY_SEARCH_LIMIT');return result('unresolved');}
 }else if(policy.unit==='calendar-day')
  due=addDays(start,policy.amount-(policy.startCounting==='include-trigger'?1:0));
 else{
  if(policy.startCounting==='include-trigger'){reasons.push('MONTH_COUNTING_INTERPRETATION_REQUIRED');return result('unresolved');}
  const shifted=addMonths(start,policy.amount,policy);
  if(!shifted){reasons.push('MONTH_END_INTERPRETATION_REQUIRED');return result('unresolved');}
  due=shifted;
 }
 if(!isBusiness(due,calendar,holidays)){
  if(policy.nonBusinessDue==='unresolved'){reasons.push('NONBUSINESS_EXTENSION_INTERPRETATION_REQUIRED');return result('unresolved');}
  if(policy.nonBusinessDue==='extend')due=shiftToBusiness(due,calendar,holidays);
 }
 return result('resolved',due);
}
