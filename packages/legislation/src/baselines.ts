/** LM-014: explicit temporal applicability; never default a proposal to enacted law. */
export type LegislativeStatus = 'draft' | 'introduced' | 'enacted' | 'repealed';
export type BaselineSource = { readonly sourceId:string; readonly versionId:string; readonly digest:string; readonly jurisdiction:string; readonly agency:string; readonly asOf:string };
export type Baseline = { readonly id:string; readonly jurisdiction:string; readonly agency:string; readonly asOf:string; readonly sources:readonly BaselineSource[]; readonly gaps:readonly string[] };
export type TemporalProvision = { readonly id:string; readonly status:LegislativeStatus; readonly effectiveOn?:string; readonly transitionEndsOn?:string };
export type Applicability = { readonly state:'applicable'|'not-effective'|'not-enacted'|'repealed'|'unknown'; readonly simulated:boolean; readonly reasons:readonly string[] };
const validDate=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function validateBaseline(b:Baseline): readonly string[] {
 const errors:string[]=[];
 const identifier=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x);
 if(!b||typeof b!=='object'||!identifier(b.id)||typeof b.jurisdiction!=='string'||!b.jurisdiction||
 typeof b.agency!=='string'||!b.agency||!validDate(b.asOf)||!Array.isArray(b.sources)||
 b.sources.length>256||!Array.isArray(b.gaps)||b.gaps.length>256)return ['INVALID_BASELINE'];
 const seen=new Set<string>();
 for(const source of b.sources) {
  if(!source||typeof source!=='object'||!identifier(source.sourceId)||!identifier(source.versionId)||
   typeof source.digest!=='string'||!/^[a-f0-9]{64}$/.test(source.digest)||
   source.jurisdiction!==b.jurisdiction||source.agency!==b.agency||
   !validDate(source.asOf)||source.asOf>b.asOf){
   errors.push('INVALID_SOURCE_SCOPE');continue;
  }
  const key=source.sourceId+'|'+source.versionId;
  if(seen.has(key))errors.push('DUPLICATE_BASELINE_SOURCE');
  seen.add(key);
 }
 if(b.sources.length===0&&b.gaps.length===0)errors.push('UNDECLARED_BASELINE_GAP');
 if(b.gaps.some(g=>typeof g!=='string'||!g.trim()||g.length>1000))errors.push('INVALID_GAP');
 return errors;
}

export function assessApplicability(provision:TemporalProvision, date:string, opts:{hypotheticalEnactment?:boolean;baseline?:Baseline}={}):Applicability {
 if(!validDate(date)||!provision||!provision.id||!['draft','introduced','enacted','repealed'].includes(provision.status)||
 (provision.effectiveOn!==undefined&&!validDate(provision.effectiveOn))||
 (provision.transitionEndsOn!==undefined&&!validDate(provision.transitionEndsOn))||
 (provision.transitionEndsOn!==undefined&&provision.effectiveOn!==undefined&&provision.transitionEndsOn<provision.effectiveOn))throw Error('INVALID_TEMPORAL_INPUT');
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
