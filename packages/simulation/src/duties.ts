/** LM-023 legal status records. Actor performance is separate from normative force. */
export type NormativeForce='obligation'|'right'|'permission'|'prohibition';
export type Duty={readonly id:string;readonly actorId:string;readonly action:string;readonly createdTick:number;readonly dueTick:number;readonly sourceRuleId:string;readonly sourceRefs:readonly string[]};
export type Performance={readonly dutyId:string;readonly performedAt:number;readonly evidenceId:string};
export type DutyAssessment={readonly id:string;readonly state:'pending'|'satisfied'|'breached'|'unknown';readonly performedAt:number|null;readonly dueTick:number;readonly reasons:readonly string[]};
export type LegalStatus={readonly id:string;readonly force:NormativeForce;readonly holderId:string;readonly action:string;readonly sourceRuleId:string;readonly sourceRefs:readonly string[]};
export type Remedy={readonly id:string;readonly dutyId:string;readonly ruleId:string;readonly conditionalOnBreach:boolean;readonly sourceRefs:readonly string[]};
export type RemedyResult={readonly state:'available'|'unavailable'|'unresolved';readonly reason:string};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][\w:.-]{0,127}$/.test(v);
const tick=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const refs=(r:unknown):r is readonly string[]=>Array.isArray(r)&&r.length>0&&r.length<=100&&r.every(id);
export function assessDuty(duty:Duty,performance:Performance|null,asOf:number):DutyAssessment{
 if(!duty||!id(duty.id)||!id(duty.actorId)||!id(duty.action)||!id(duty.sourceRuleId)||
 !tick(duty.createdTick)||!tick(duty.dueTick)||duty.dueTick<duty.createdTick||!refs(duty.sourceRefs)||!tick(asOf)||asOf<duty.createdTick)throw Error('DUTY_INVALID');
 if(performance!==null){
  if(!id(performance.dutyId)||performance.dutyId!==duty.id||!tick(performance.performedAt)||!id(performance.evidenceId)||performance.performedAt<duty.createdTick||performance.performedAt>asOf)throw Error('PERFORMANCE_INVALID');
  const late=performance.performedAt>duty.dueTick;
  return {id:duty.id,state:late?'breached':'satisfied',performedAt:performance.performedAt,dueTick:duty.dueTick,reasons:late?['PERFORMANCE_AFTER_DEADLINE']:['TIMELY_PERFORMANCE']};
 }
 return {id:duty.id,state:asOf>duty.dueTick?'breached':'pending',performedAt:null,dueTick:duty.dueTick,reasons:asOf>duty.dueTick?['DEADLINE_PASSED_WITHOUT_EVIDENCE']:['AWAITING_PERFORMANCE']};
}
export function validateStatus(status:LegalStatus):boolean{return !!status&&id(status.id)&&['obligation','right','permission','prohibition'].includes(status.force)&&id(status.holderId)&&id(status.action)&&id(status.sourceRuleId)&&refs(status.sourceRefs);}
export function evaluateRemedy(remedy:Remedy,duty:DutyAssessment,applicableRuleIds:readonly string[]):RemedyResult{
 if(!remedy||!id(remedy.id)||!id(remedy.dutyId)||!id(remedy.ruleId)||!refs(remedy.sourceRefs)||typeof remedy.conditionalOnBreach!=='boolean'||!duty||remedy.dutyId!==duty.id||!Array.isArray(applicableRuleIds)||!applicableRuleIds.every(id))throw Error('REMEDY_INVALID');
 if(!applicableRuleIds.includes(remedy.ruleId))return {state:'unavailable',reason:'REMEDY_RULE_NOT_APPLICABLE'};
 if(remedy.conditionalOnBreach&&duty.state!=='breached')return {state:duty.state==='unknown'?'unresolved':'unavailable',reason:'BREACH_NOT_ESTABLISHED'};
 return {state:'available',reason:'SOURCE_SUPPORTED_CONDITION_MET'};
}
export function summarizeStatus(status:LegalStatus):{force:NormativeForce;automaticAction:false}{
 if(!validateStatus(status))throw Error('STATUS_INVALID');
 // Neither a permission nor a legal duty itself produces performance.
 return {force:status.force,automaticAction:false};
}
