import{describe,it,expect}from'vitest';
import{assessDuty,evaluateRemedy,summarizeStatus,type Duty,type LegalStatus}from'../../packages/simulation/src/duties.ts';
const duty:Duty={id:'d1',actorId:'desk',action:'route',createdTick:0,dueTick:2,sourceRuleId:'toy-rule',sourceRefs:['toy-v1:section-1']};
const permission:LegalStatus={id:'p1',force:'permission',holderId:'desk',action:'inspect',sourceRuleId:'toy-rule',sourceRefs:['toy-v1:section-2']};
describe('LM-023 enforce normative and behavioral separation',()=>{
 it('late five-day compliance breaches two-day obligation',()=>{
  expect(assessDuty(duty,{dutyId:'d1',performedAt:5,evidenceId:'receipt'},5)).toMatchObject({state:'breached',performedAt:5,reasons:['PERFORMANCE_AFTER_DEADLINE']});
 });
 it('early performance satisfies while nonperformance can breach',()=>{
  expect(assessDuty(duty,{dutyId:'d1',performedAt:1,evidenceId:'record'},3).state).toBe('satisfied');
  expect(assessDuty(duty,null,1).state).toBe('pending');expect(assessDuty(duty,null,5).state).toBe('breached');
 });
 it('permission alone does not produce actor behavior',()=>expect(summarizeStatus(permission)).toEqual({force:'permission',automaticAction:false}));
 it('receipt is not an adjudication of merits',()=>{
  expect(assessDuty(duty,{dutyId:'d1',performedAt:1,evidenceId:'receipt'},1).state).toBe('satisfied');
  expect(summarizeStatus({...permission,force:'right'}).automaticAction).toBe(false);
 });
 it('remedy requires separate rule and established breach',()=>{
  const remedy={id:'remedy',dutyId:'d1',ruleId:'remedy-law',conditionalOnBreach:true,sourceRefs:['toy-v1:section-3']};
  expect(evaluateRemedy(remedy,assessDuty(duty,null,5),[]).state).toBe('unavailable');
  expect(evaluateRemedy(remedy,assessDuty(duty,null,1),['remedy-law']).state).toBe('unavailable');
  expect(evaluateRemedy(remedy,assessDuty(duty,null,5),['remedy-law']).state).toBe('available');
 });
 it('rejects absent provenance and impossible performance timestamps',()=>{
  expect(()=>assessDuty({...duty,sourceRefs:[]},null,1)).toThrow('DUTY_INVALID');
  expect(()=>assessDuty(duty,{dutyId:'d1',performedAt:5,evidenceId:'x'},1)).toThrow('PERFORMANCE_INVALID');
 });
});
