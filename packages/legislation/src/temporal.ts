/**
 * LM-014 — dated source snapshots and hypothetical proposal applicability.
 * Authority is asserted only by the pinned source inventory. Never manufacture
 * baseline law or silently turn a proposal into enacted law.
 */
export type BaselineGap={readonly id:string;readonly subject:string;readonly reason:string};
export type OfficialSourceSnapshot={
  readonly id:string;readonly title:string;readonly versionLabel:string;
  readonly jurisdiction:string;readonly asOf:string;
  readonly digest:string;readonly sourceUrl:string;readonly citation:string;
  readonly verified:boolean;
};
export type BaselineSnapshot={
  readonly id:string;readonly jurisdiction:string;readonly agency:string|null;
  readonly asOf:string;readonly sources:readonly OfficialSourceSnapshot[];
  readonly gaps:readonly BaselineGap[];
};
export type TemporalChange={
  readonly id:string;readonly provisionId:string;readonly sourceDigest:string;
  readonly effectiveOn:string;readonly transitionEndsOn:string|null;
  readonly jurisdiction:string;readonly agency:string|null;
  readonly description:string;
};
export type ProposedFramework={
  readonly billVersionId:string;readonly status:'draft'|'introduced'|'enacted'|'repealed';
  readonly enactedOn:string|null;readonly changes:readonly TemporalChange[];
};
export type ApplicabilityResult={
  readonly kind:'baseline-only'|'proposed-not-enacted'|'hypothetical-enactment'|'enacted'|'scope-mismatch';
  readonly asOf:string;readonly baselineId:string;readonly baselineAsOf:string;
  readonly baselineSources:readonly string[];readonly gaps:readonly BaselineGap[];
  readonly effectiveChanges:readonly string[];readonly futureChanges:readonly string[];
  readonly transitionChanges:readonly string[];
  readonly labels:readonly string[];
  readonly resolvable:boolean;
};
const identifier=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digest=/^[a-f0-9]{64}$/;
function date(value:string):string{
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value)||
    Number.isNaN(Date.parse(value+'T00:00:00Z'))||
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('TEMPORAL_INVALID_DATE');
  return value;
}
function validBase(base:BaselineSnapshot):void{
  if(!base||!identifier.test(base.id)||!base.jurisdiction||base.jurisdiction.length>120||
    !(base.agency===null||(typeof base.agency==='string'&&base.agency.length<=120)))throw Error('BASELINE_INVALID');
  date(base.asOf);
  if(!Array.isArray(base.sources)||base.sources.length>300||
    !Array.isArray(base.gaps)||base.gaps.length>300)throw Error('BASELINE_INVALID');
  const sourceIds=new Set<string>(),gapIds=new Set<string>();
  for(const source of base.sources){
    if(!source||!identifier.test(source.id)||sourceIds.has(source.id)||!source.title||
      !source.versionLabel||!source.citation||source.jurisdiction!==base.jurisdiction||
      !digest.test(source.digest)||source.verified!==true||date(source.asOf)>base.asOf)
      throw Error('BASELINE_INVALID_SOURCE');
    let url:URL;
    try{url=new URL(source.sourceUrl);}catch{throw Error('BASELINE_INVALID_SOURCE');}
    if(url.protocol!=='https:'||url.username||url.password||url.port||
       !['www.govinfo.gov','www.congress.gov','congress.gov'].includes(url.hostname)||
       url.searchParams.has('api_key'))throw Error('BASELINE_INVALID_SOURCE');
    sourceIds.add(source.id);
  }
  for(const gap of base.gaps){
    if(!gap||!identifier.test(gap.id)||gapIds.has(gap.id)||typeof gap.subject!=='string'||!gap.subject||
      typeof gap.reason!=='string'||!gap.reason)throw Error('BASELINE_INVALID_GAP');
    gapIds.add(gap.id);
  }
}
/** A proposal must not become enacted solely because its effective date passed. */
export function resolveTemporalApplicability(
  baseline:BaselineSnapshot,framework:ProposedFramework|null,
  options:{asOf:string;jurisdiction:string;agency?:string|null;compareProposal?:boolean;assumeEnactment?:boolean}
):ApplicabilityResult{
  validBase(baseline);
  const asOf=date(options.asOf);
  if(asOf<baseline.asOf)throw Error('BASELINE_FROM_FUTURE');
  const mismatched=options.jurisdiction!==baseline.jurisdiction ||
    (baseline.agency!==null&&options.agency!==baseline.agency);
  const result=(kind:ApplicabilityResult['kind'],effectiveChanges:string[]=[],futureChanges:string[]=[],transitionChanges:string[]=[],extra:string[]=[]):ApplicabilityResult=>({
    kind,asOf,baselineId:baseline.id,baselineAsOf:baseline.asOf,
    baselineSources:baseline.sources.map(s=>s.id),gaps:[...baseline.gaps],
    effectiveChanges,futureChanges,transitionChanges,
    labels:['Dated baseline '+baseline.asOf,kind==='enacted'?'Enacted status (pinned)':'Not authoritative current-law advice',...extra],
    resolvable:baseline.sources.length>0&&baseline.gaps.length===0&&kind!=='scope-mismatch'&&kind!=='proposed-not-enacted'
  });
  if(mismatched)return result('scope-mismatch',[],[],[],['UNRESOLVED_SCOPE_VARIANT']);
  if(!framework||!options.compareProposal)return result('baseline-only');
  if(!identifier.test(framework.billVersionId)||!['draft','introduced','enacted','repealed'].includes(framework.status)||
    !Array.isArray(framework.changes)||framework.changes.length>1000)throw Error('TEMPORAL_INVALID_FRAMEWORK');
  if(framework.status==='enacted'&&framework.enactedOn===null)throw Error('TEMPORAL_ENACTMENT_UNPINNED');
  if(framework.enactedOn!==null)date(framework.enactedOn);
  const activated=framework.status==='enacted'&&framework.enactedOn!==null&&framework.enactedOn<=asOf;
  const assumed=options.assumeEnactment===true;
  if(!activated&&!assumed)return result('proposed-not-enacted',[],[],[],['Proposal is not enacted by default']);
  const effective:string[]=[],future:string[]=[],transition:string[]=[];
  const ids=new Set<string>();
  for(const change of framework.changes){
    if(!change||!identifier.test(change.id)||!identifier.test(change.provisionId)||ids.has(change.id)||
      !digest.test(change.sourceDigest)||change.jurisdiction!==baseline.jurisdiction||
      !(change.agency===null||(typeof change.agency==='string'&&change.agency.length<=120))||
      typeof change.description!=='string'||!change.description)throw Error('TEMPORAL_INVALID_CHANGE');
    ids.add(change.id);
    date(change.effectiveOn);
    if(change.transitionEndsOn!==null&&date(change.transitionEndsOn)<change.effectiveOn)
      throw Error('TEMPORAL_INVALID_TRANSITION');
    if(change.agency!==null&&change.agency!==options.agency){
      continue; // absence is not proof of applicability; no invented variant.
    }
    if(change.effectiveOn>asOf)future.push(change.id);
    else if(change.transitionEndsOn!==null&&change.transitionEndsOn>=asOf)transition.push(change.id);
    else effective.push(change.id);
  }
  const kind=activated?'enacted':'hypothetical-enactment';
  return result(kind,effective,future,transition,kind==='hypothetical-enactment'?
    ['HYPOTHETICAL ENACTMENT — not enacted law']:[]);
}
export function firstComparisonBaselineInventory():BaselineSnapshot{
  // The complete proposed bill and pinned official baseline corpus have not
  // been supplied. Return declared gaps, not invented federal statutes.
  return {id:'electronic-filing-source-gap',jurisdiction:'US-federal',agency:null,
    asOf:'2026-10-16',sources:[],gaps:[
      {id:'official-baseline',subject:'Electronic filing jurisdictional law',
        reason:'A dated, exact official baseline source snapshot has not yet been added.'},
      {id:'source-version',subject:'Underlying proposed bill text',
        reason:'Full legislative draft and version provenance have not yet been attached.'}
    ]};
}
