/** LM-014: explicit temporal applicability; never default a proposal to enacted law. */
export type LegislativeStatus = 'draft' | 'introduced' | 'enacted' | 'repealed';
export type BaselineSource = { readonly sourceId:string; readonly versionId:string; readonly digest:string; readonly jurisdiction:string; readonly agency:string; readonly asOf:string };
export type Baseline = { readonly id:string; readonly jurisdiction:string; readonly agency:string; readonly asOf:string; readonly sources:readonly BaselineSource[]; readonly gaps:readonly string[] };
export type TemporalProvision = { readonly id:string; readonly status:LegislativeStatus; readonly effectiveOn?:string; readonly transitionEndsOn?:string };
export type Applicability = { readonly state:'applicable'|'not-effective'|'not-enacted'|'repealed'|'unknown'; readonly simulated:boolean; readonly reasons:readonly string[] };
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function validateBaseline(b:Baseline): readonly string[] {
 const errors:string[]=[];
 if(!b||!b.id||!b.jurisdiction||!b.agency||!validDate(b.asOf)||!Array.isArray(b.sources)||!Array.isArray(b.gaps))return ['INVALID_BASELINE'];
 for(const s of b.sources){
  if(!s.sourceId||!s.versionId||!/^[a-f0-9]{64}$/.test(s.digest)||s.jurisdiction!==b.jurisdiction||s.agency!==b.agency||!validDate(s.asOf)||s.asOf>b.asOf)errors.push('INVALID_SOURCE_SCOPE');
 }
 if(b.sources.length===0 && b.gaps.length===0)errors.push('UNDECLARED_BASELINE_GAP');
 if(b.gaps.some(g=>typeof g!=='string'||!g.trim()))errors.push('INVALID_GAP');
 return errors;
}
export function assessApplicability(provision:TemporalProvision, date:string, opts:{hypotheticalEnactment?:boolean;baseline?:Baseline}={}):Applicability {
 if(!validDate(date)||!provision||!provision.id||!['draft','introduced','enacted','repealed'].includes(provision.status)||
 (provision.effectiveOn!==undefined&&!validDate(provision.effectiveOn))||
 (provision.transitionEndsOn!==undefined&&!validDate(provision.transitionEndsOn)))throw Error('INVALID_TEMPORAL_INPUT');
 if(opts.baseline && (validateBaseline(opts.baseline).length||opts.baseline.asOf>date))return {state:'unknown',simulated:false,reasons:['BASELINE_UNRESOLVED']};
 if(opts.baseline && opts.baseline.gaps.length)return {state:'unknown',simulated:false,reasons:['BASELINE_SOURCE_GAP']};
 if(provision.status==='repealed')return {state:'repealed',simulated:false,reasons:['REPEALED']};
 const simulated=provision.status!=='enacted' && opts.hypotheticalEnactment===true;
 if(provision.status!=='enacted'&&!simulated)return {state:'not-enacted',simulated:false,reasons:['PROPOSAL_IS_NOT_LAW']};
 if(!provision.effectiveOn)return {state:'unknown',simulated,reasons:['EFFECTIVE_DATE_UNRESOLVED',...(simulated?['HYPOTHETICAL_ENACTMENT']:[])]};
 if(date<provision.effectiveOn)return {state:'not-effective',simulated,reasons:['FUTURE_EFFECTIVE_DATE',...(simulated?['HYPOTHETICAL_ENACTMENT']:[])]};
 if(provision.transitionEndsOn&&date<provision.transitionEndsOn)return {state:'unknown',simulated,reasons:['TRANSITION_UNRESOLVED',...(simulated?['HYPOTHETICAL_ENACTMENT']:[])]};
 return {state:'applicable',simulated,reasons:simulated?['HYPOTHETICAL_ENACTMENT']:[]};
}
