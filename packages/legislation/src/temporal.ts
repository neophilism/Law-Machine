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
  /** Exact bytes hashed are either a curated excerpt or an original official file, never both. */
  readonly digestScope:'curated-excerpt'|'raw-official-file';
  readonly excerptText:string|null;
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
      !digest.test(source.digest)||source.verified!==true||date(source.asOf)>base.asOf||
      !['curated-excerpt','raw-official-file'].includes(source.digestScope)||
      (source.digestScope==='curated-excerpt'&&(typeof source.excerptText!=='string'||!source.excerptText||source.excerptText.length>5000))||
      (source.digestScope==='raw-official-file'&&source.excerptText!==null))
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
  // Only two short excerpts from separately identified 2024 GPO publications
  // are pinned here, NOT the whole original files, nor a complete 2026 baseline.
  // The digests identify EXACT CURATED EXCERPT bytes stored in content/baselines.
  const sources:OfficialSourceSnapshot[]=[
    {id:'gpo-uscode-2024-44usc3506',title:'U.S. Code 2024 Edition, Title 44, §3506',
      versionLabel:'2024 Edition — curated excerpt',jurisdiction:'US-federal',asOf:'2024-12-31',
      digest:'972ee3237056092053b3e8f1d668db19e8ae0277b2bee909f109e1d5a0cc012b',
      sourceUrl:'https://www.govinfo.gov/content/pkg/USCODE-2024-title44/html/USCODE-2024-title44-chap35-subchapI-sec3506.htm',
      citation:'44 U.S.C. §3506(a)(1), 2024 Edition',verified:true,digestScope:'curated-excerpt',
      excerptText:'The head of each agency shall be responsible for'},
    {id:'gpo-uscode-2024-5usc552',title:'U.S. Code 2024 Edition, Title 5, §552',
      versionLabel:'2024 Edition — curated excerpt',jurisdiction:'US-federal',asOf:'2024-12-31',
      digest:'dbba02fd51861948b44d248c33f041bdcdffe1fec1df08102559b91c613b3243',
      sourceUrl:'https://www.govinfo.gov/content/pkg/USCODE-2024-title5/pdf/USCODE-2024-title5-partI-chap5-subchapII-sec552.pdf',
      citation:'5 U.S.C. §552(a)(3)(A), 2024 Edition',verified:true,digestScope:'curated-excerpt',
      excerptText:'shall make the records promptly available to any person'}
  ];
  return {id:'electronic-filing-source-gap',jurisdiction:'US-federal',agency:null,
    asOf:'2026-10-16',sources,gaps:[
      {id:'official-baseline',subject:'Electronic filing jurisdictional law',
        reason:'2024 official excerpts are partial, not a complete or verified as-of-2026 agency-specific procedural baseline.'},
      {id:'source-version',subject:'Underlying proposed bill text',
        reason:'Full legislative draft and version provenance have not yet been attached.'}
    ]};
}
