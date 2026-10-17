import type { Rule, SourceRef } from '../../contracts/src/model.ts';

/**
 * LM-017 public evidence and interpretation records.
 * These records classify legal language, opinions, observed behavior and invented
 * inputs; they never transform observations into legal obligations by inference.
 */
export type EvidenceKind = 'source-language' | 'interpretation' | 'empirical-evidence' | 'assumption' | 'unknown';
export type MeasurementUnit = 'calendar-day' | 'business-day' | 'hour' | 'month' | 'usd' | 'count' | 'percent';
export type Measurement = { readonly min: number; readonly max: number; readonly unit: MeasurementUnit };
export type ReviewDisposition = {
  readonly status: 'pending' | 'accepted' | 'rejected' | 'needs-revision';
  readonly reviewerId?: string;
  readonly rationale?: string;
};
export type EvidenceRecord = {
  readonly id: string;
  readonly versionId: string;
  readonly kind: EvidenceKind;
  readonly domain: 'legal-deadline' | 'performance-delay' | 'cost' | 'eligibility' | 'other';
  readonly statement: string;
  readonly sourceRefs: readonly SourceRef[];
  readonly measurement?: Measurement;
  readonly limitations: readonly string[];
  readonly review: ReviewDisposition;
};
export type InterpretationConflict = {
  readonly id: string;
  readonly alternatives: readonly string[];
  readonly chosenId?: string;
  readonly disposition?: ReviewDisposition;
};
export type ForecastInput = {
  readonly id: string;
  readonly value: number;
  readonly unit: MeasurementUnit;
  readonly evidenceIds: readonly string[];
};
export type EvidenceDiagnostic = { readonly code: string; readonly path: string };
export type EvidenceAssessment = { readonly valid: boolean; readonly diagnostics: readonly EvidenceDiagnostic[] };

const identifier=(x:unknown):x is string=>typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x);
const measureUnits=new Set<string>(['calendar-day','business-day','hour','month','usd','count','percent']);
const ruleKinds=new Set<string>(['obligation','permission','prohibition','right','power']);
const knownKinds=new Set<string>(['source-language','interpretation','empirical-evidence','assumption','unknown']);
const knownDomains=new Set<string>(['legal-deadline','performance-delay','cost','eligibility','other']);
const statuses=new Set<string>(['pending','accepted','rejected','needs-revision']);
const obj=(x:unknown):x is Record<string,unknown>=>x!==null && typeof x==='object' && !Array.isArray(x);

function referenceValid(ref:unknown, version:string):boolean {
  if(!obj(ref))return false;
  return ref.versionId===version && identifier(ref.provisionId) &&
    typeof ref.sourceDigest==='string' && /^[a-f0-9]{64}$/.test(ref.sourceDigest) &&
    typeof ref.quote==='string' && ref.quote.length>0 && ref.quote.length<=8192;
}
function dispositionValid(value:unknown):value is ReviewDisposition{
  if(!obj(value) || !statuses.has(String(value.status)))return false;
  if(value.reviewerId!==undefined && !identifier(value.reviewerId))return false;
  if(value.rationale!==undefined && (typeof value.rationale!=='string' || !value.rationale.trim() || value.rationale.length>2000))return false;
  if(value.status==='accepted' && (!identifier(value.reviewerId)||typeof value.rationale!=='string'||!value.rationale.trim()))return false;
  return true;
}
function measurementValid(x:unknown):x is Measurement{
  if(!obj(x)||typeof x.min!=='number'||typeof x.max!=='number'||
    !Number.isFinite(x.min)||!Number.isFinite(x.max)||x.min<0||x.max<x.min||
    !measureUnits.has(String(x.unit)))return false;
  if(x.unit==='percent'&&x.max>100)return false;
  if(x.unit==='count'&&(!Number.isSafeInteger(x.min)||!Number.isSafeInteger(x.max)))return false;
  return true;
}

export function validateEvidenceGraph(
  rawRecords:unknown, rawConflicts:unknown, rawInputs:unknown, rawRules:unknown
):EvidenceAssessment{
  const diagnostics:EvidenceDiagnostic[]=[];
  const add=(code:string,path:string)=>{if(diagnostics.length<100)diagnostics.push({code,path});};
  if(!Array.isArray(rawRecords)||rawRecords.length>2000||
     !Array.isArray(rawConflicts)||rawConflicts.length>1000||
     !Array.isArray(rawInputs)||rawInputs.length>2000||
     !Array.isArray(rawRules)||rawRules.length>10000)
    return {valid:false,diagnostics:[{code:'EVIDENCE_COLLECTION_INVALID',path:'$'}]};
  const records=new Map<string,EvidenceRecord>();
  for(const [i,record] of rawRecords.entries()){
    const path='$.records['+i+']';
    if(!obj(record)||!identifier(record.id)||!identifier(record.versionId)||
      !knownKinds.has(String(record.kind))||!knownDomains.has(String(record.domain))||
      typeof record.statement!=='string'||!record.statement.trim()||record.statement.length>8192||
      !Array.isArray(record.sourceRefs)||record.sourceRefs.length>100||
      !Array.isArray(record.limitations)||record.limitations.length>100||
      !record.limitations.every((s:unknown)=>typeof s==='string'&&s.trim().length>0&&s.length<=2000)||
      !dispositionValid(record.review)){
      add('EVIDENCE_RECORD_INVALID',path);continue;
    }
    if(records.has(record.id)){add('EVIDENCE_DUPLICATE_ID',path);continue;}
    if(!record.sourceRefs.every((ref:unknown)=>referenceValid(ref,record.versionId as string)))
      add('EVIDENCE_SOURCE_INVALID',path+'.sourceRefs');
    if(['source-language','interpretation'].includes(record.kind as string) && record.sourceRefs.length===0)
      add('EVIDENCE_LEGAL_PROVENANCE_MISSING',path+'.sourceRefs');
    if(record.kind==='unknown' && (record.measurement!==undefined||record.review.status==='accepted'))
      add('EVIDENCE_UNKNOWN_NOT_DECIDED',path);
    if(record.measurement!==undefined&&!measurementValid(record.measurement))
      add('EVIDENCE_MEASUREMENT_INVALID',path+'.measurement');
    if(record.kind==='empirical-evidence'&&record.domain==='legal-deadline')
      add('EMPIRICAL_NOT_LEGAL_DEADLINE',path);
    if(record.kind==='assumption'&&record.review.status==='accepted'&&record.domain==='legal-deadline')
      add('ASSUMPTION_NOT_LEGAL_DEADLINE',path);
    records.set(record.id,record as unknown as EvidenceRecord);
  }
  const conflicts=new Set<string>();
  for(const [i,conflict] of rawConflicts.entries()){
    const path='$.conflicts['+i+']';
    if(!obj(conflict)||!identifier(conflict.id)||!Array.isArray(conflict.alternatives)||
      conflict.alternatives.length<2||conflict.alternatives.length>30||
      !conflict.alternatives.every(identifier)||new Set(conflict.alternatives).size!==conflict.alternatives.length){
      add('EVIDENCE_CONFLICT_INVALID',path);continue;
    }
    if(conflicts.has(conflict.id))add('EVIDENCE_CONFLICT_DUPLICATE',path);
    conflicts.add(conflict.id);
    for(const candidate of conflict.alternatives){
      const rec=records.get(candidate as string);
      if(!rec||rec.kind!=='interpretation')add('EVIDENCE_CONFLICT_UNKNOWN_ALTERNATIVE',path);
    }
    if(conflict.chosenId!==undefined){
      if(!identifier(conflict.chosenId)||!conflict.alternatives.includes(conflict.chosenId)||!dispositionValid(conflict.disposition)||
        (conflict.disposition as ReviewDisposition).status!=='accepted')
        add('EVIDENCE_CONFLICT_UNREVIEWED_SELECTION',path);
    }
  }
  const inputs=new Set<string>();
  for(const [i,input] of rawInputs.entries()){
    const path='$.inputs['+i+']';
    if(!obj(input)||!identifier(input.id)||typeof input.value!=='number'||
      !Number.isFinite(input.value)||input.value<0||!measureUnits.has(String(input.unit))||
      (input.unit==='percent'&&input.value>100)||
      (input.unit==='count'&&!Number.isSafeInteger(input.value))||
      !Array.isArray(input.evidenceIds)||!input.evidenceIds.length||input.evidenceIds.length>100||
      !input.evidenceIds.every(identifier)||new Set(input.evidenceIds).size!==input.evidenceIds.length){
      add('FORECAST_INPUT_UNSUPPORTED',path);continue;
    }
    if(inputs.has(input.id))add('FORECAST_DUPLICATE',path);
    inputs.add(input.id);
    for(const id of input.evidenceIds){
      const rec=records.get(id as string);
      if(!rec||!['empirical-evidence','assumption'].includes(rec.kind))
        add('FORECAST_PROVENANCE_INVALID',path+'.evidenceIds');
      else if(rec.measurement&&rec.measurement.unit!==input.unit)
        add('FORECAST_UNIT_MISMATCH',path+'.unit');
    }
  }
  for(const [i,rule] of rawRules.entries()){
    const path='$.rules['+i+']';
    if(!obj(rule)||!identifier(rule.id)||!identifier(rule.versionId)||!ruleKinds.has(String(rule.modal))||
      !Array.isArray(rule.sourceRefs)||!rule.sourceRefs.length||rule.sourceRefs.length>100||
      !rule.sourceRefs.every((ref:unknown)=>referenceValid(ref,rule.versionId as string))){
      add('OPERATIVE_RULE_PROVENANCE_MISSING',path);
    }
  }
  return {valid:diagnostics.length===0,diagnostics};
}

/** A conflict retains every alternative, even after a reviewed choice. */
export function inspectInterpretationConflict(conflict:InterpretationConflict): {
  readonly alternatives:readonly string[];readonly resolved:boolean;readonly chosenId:string|null
}{
  const approved=conflict.chosenId!==undefined && conflict.alternatives.includes(conflict.chosenId) &&
    dispositionValid(conflict.disposition) && conflict.disposition.status==='accepted';
  return {alternatives:[...conflict.alternatives],resolved:approved,chosenId:approved?conflict.chosenId!:null};
}

/** Convenience compile-time check; no effect on runtime validation. */
export type VerifiedRuleProvenance = Pick<Rule,'id'|'versionId'|'sourceRefs'|'modal'>;
