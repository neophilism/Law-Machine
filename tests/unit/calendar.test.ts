import {describe,it,expect} from 'vitest';
import {calculateHypotheticalDeadline,type LegalCalendar,type DeadlinePolicy} from '../../packages/simulation/src/calendar.ts';
const calendar:LegalCalendar={
 id:'fictional-ny',version:'calendar-2026-a',timeZone:'America/New_York',
 weekendDays:[0,6],observedHolidays:['2026-01-01','2026-05-25','2026-11-26']
};
const ref={versionId:'fictional-v1',provisionId:'toy-rule',sourceDigest:'a'.repeat(64),quote:'Imaginary business day counting convention'};
const policy=(options:Partial<DeadlinePolicy>={}):DeadlinePolicy=>({
 id:'toy-deadline',calendarId:'fictional-ny',calendarVersion:'calendar-2026-a',
 amount:2,unit:'business-day',startCounting:'exclude-trigger',
 monthEnd:'clamp',nonBusinessDue:'extend',cutoffTime:null,
 afterCutoff:'same-day',sourceRefs:[ref],...options
});
const calc=(start:string,options:Partial<DeadlinePolicy>={})=>
 calculateHypotheticalDeadline(calendar,policy(options),start);
describe('LM-022 source-linked hypothetical deadlines',()=>{
 it('counts business days across a weekend and declared holiday',()=>{
  expect(calc('2026-05-21').dueDate).toBe('2026-05-26'); // Thu + 2 business days, Monday holiday -> Tue
  expect(calc('2026-05-22').dueDate).toBe('2026-05-27'); // Fri + Tue/Wed
  expect(calc('2026-05-22',{startCounting:'include-trigger'}).dueDate).toBe('2026-05-26');
 });
 it('does not treat six calendar months as 180 days',()=>{
  expect(calc('2026-01-31',{unit:'calendar-month',amount:6,nonBusinessDue:'keep'}).dueDate).toBe('2026-07-31');
  expect(calc('2026-01-31',{unit:'calendar-day',amount:180,nonBusinessDue:'keep'}).dueDate).not.toBe('2026-07-31');
 });
 it('distinguishes leap February from ordinary year and handles end-of-month interpretation',()=>{
  expect(calc('2024-01-31',{unit:'calendar-month',amount:1,nonBusinessDue:'keep'}).dueDate).toBe('2024-02-29');
  expect(calc('2025-01-31',{unit:'calendar-month',amount:1,nonBusinessDue:'keep'}).dueDate).toBe('2025-02-28');
  expect(calc('2026-01-31',{unit:'calendar-month',amount:1,monthEnd:'unresolved',nonBusinessDue:'keep'}))
   .toMatchObject({state:'unresolved',reasons:['MONTH_END_INTERPRETATION_REQUIRED']});
 });
 it('keeps exact elapsed hours across US spring-forward DST change',()=>{
  const r=calc('2026-03-08T06:30:00Z',{unit:'elapsed-hour',amount:2,nonBusinessDue:'keep'});
  expect(r).toMatchObject({state:'resolved',dueInstant:'2026-03-08T08:30:00.000Z',dueDate:'2026-03-08',dueLocalTime:'04:30'});
 });
 it('handles fall-back DST elapsed hours without pretending that two wall-clock hours passed',()=>{
  const r=calc('2026-11-01T05:30:00Z',{unit:'elapsed-hour',amount:2,nonBusinessDue:'keep'});
  expect(r).toMatchObject({state:'resolved',dueInstant:'2026-11-01T07:30:00.000Z',dueLocalTime:'02:30'});
 });
 it('requires an explicit timezone and business cutoff convention',()=>{
  const r=calc('2026-05-22T22:01:00Z',{cutoffTime:'17:00',afterCutoff:'next-business-day'});
  expect(r.dueDate).toBe('2026-05-28'); // 18:01 EDT Fri; shift to Tue after holiday; count Wed/Thu
  expect(calc('2026-05-22',{cutoffTime:'17:00'})).toMatchObject({state:'unresolved',reasons:['TRIGGER_TIME_UNKNOWN']});
  expect(calc('2026-05-22T22:01:00Z',{cutoffTime:'17:00',afterCutoff:'unresolved'}).state).toBe('unresolved');
 });
 it('does not invent statutory deadline when counting provenance is absent',()=>{
  expect(calc('2026-05-21',{sourceRefs:[]})).toMatchObject({state:'unresolved',dueDate:null,reasons:['COUNTING_PROVENANCE_MISSING']});
 });
 it('preserves disputed weekend extension as an unresolved interpretation',()=>{
  expect(calc('2026-05-22',{unit:'calendar-day',amount:1,nonBusinessDue:'unresolved'})).toMatchObject({
   state:'unresolved',reasons:['NONBUSINESS_EXTENSION_INTERPRETATION_REQUIRED']});
 });
 it('rejects unsafe calendars, invalid dates and unsupported hourly date-only input',()=>{
  expect(()=>calculateHypotheticalDeadline({...calendar,timeZone:'America/Invented'},policy(),'2026-05-22')).toThrow('CALENDAR_INVALID');
  expect(()=>calc('2026-02-30')).toThrow('TRIGGER_DATE_INVALID');
  expect(()=>calc('2026-05-22',{amount:1.5})).toThrow('COUNTING_POLICY_INVALID');
  expect(calc('2026-05-22',{unit:'elapsed-hour'})).toMatchObject({state:'unresolved',reasons:['INSTANT_REQUIRED_FOR_ELAPSED_HOURS']});
  expect(calc('2026-05-23T21:01:00Z',{unit:'elapsed-hour',amount:2,nonBusinessDue:'extend'}))
   .toMatchObject({state:'unresolved',reasons:['HOUR_EXTENSION_INTERPRETATION_REQUIRED']});
 });
});
