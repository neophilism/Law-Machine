import {describe,it,expect} from 'vitest';
import {assessApplicability,validateBaseline,type Baseline} from '../../packages/legislation/src/baselines.ts';
const d='a'.repeat(64);
const baseline:Baseline={id:'b1',asOf:'2026-10-16',agency:'fictional-desk',jurisdiction:'fictional',sources:[{sourceId:'toy',versionId:'toy-v1',digest:d,agency:'fictional-desk',jurisdiction:'fictional',asOf:'2026-10-01'}],gaps:[]};
describe('LM-014 applicability',()=>{
 it('never silently enacts a draft',()=>expect(assessApplicability({id:'p',status:'introduced',effectiveOn:'2026-01-01'},'2026-10-16').state).toBe('not-enacted'));
 it('requires explicit hypothetical status in speculative comparison',()=>expect(assessApplicability({id:'p',status:'draft',effectiveOn:'2026-01-01'},'2026-10-16',{hypotheticalEnactment:true})).toMatchObject({state:'applicable',simulated:true,reasons:['HYPOTHETICAL_ENACTMENT']}));
 it('handles staged effective periods without inventing the transition outcome',()=>{
 const p={id:'p',status:'enacted' as const,effectiveOn:'2026-07-01',transitionEndsOn:'2026-10-01'};
 expect(assessApplicability(p,'2026-06-30').state).toBe('not-effective');
 expect(assessApplicability(p,'2026-08-15').state).toBe('unknown');
 expect(assessApplicability(p,'2026-10-01').state).toBe('applicable');
 });
 it('does not fill official source gaps',()=>{
 expect(assessApplicability({id:'p',status:'enacted',effectiveOn:'2025-01-01'},'2026-10-16',{baseline:{...baseline,gaps:['missing interpretation']}}).state).toBe('unknown');
 });
 it('rejects invalid dates and foreign agency sources',()=>{
 expect(()=>assessApplicability({id:'p',status:'enacted'},'2026-02-30')).toThrow('INVALID_TEMPORAL_INPUT');
 expect(validateBaseline({...baseline,sources:[{...baseline.sources[0]!,agency:'wrong'}]})).toContain('INVALID_SOURCE_SCOPE');
 });
 it('cannot infer law when effective date is absent',()=>expect(assessApplicability({id:'p',status:'enacted'},'2026-10-16').state).toBe('unknown'));
});
