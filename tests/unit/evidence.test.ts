import { describe,it,expect } from 'vitest';
import { inspectInterpretationConflict, validateEvidenceGraph } from '../../packages/provenance/src/evidence.ts';
import type {EvidenceRecord,InterpretationConflict,ForecastInput} from '../../packages/provenance/src/evidence.ts';

const anchor={versionId:'v1',provisionId:'toy-p1',sourceDigest:'a'.repeat(64),quote:'Toy provision text'};
const accepted={status:'accepted' as const,reviewerId:'reviewer-1',rationale:'Read pinned toy source'};
const evidence:EvidenceRecord[]=[
 {id:'source',versionId:'v1',kind:'source-language',domain:'legal-deadline',statement:'Fictional legal clock',sourceRefs:[anchor],limitations:[],review:accepted},
 {id:'delay',versionId:'v1',kind:'empirical-evidence',domain:'performance-delay',statement:'Fictional observed transfer latency',sourceRefs:[],measurement:{min:2,max:5,unit:'calendar-day'},limitations:['Illustrative estimate; not legal authority'],review:{status:'pending'}},
 {id:'assumption',versionId:'v1',kind:'assumption',domain:'cost',statement:'Hypothetical cost input',sourceRefs:[],measurement:{min:1,max:20,unit:'usd'},limitations:['Visitor-controlled'],review:{status:'pending'}},
 {id:'reading-a',versionId:'v1',kind:'interpretation',domain:'eligibility',statement:'Reading A',sourceRefs:[anchor],limitations:['Contested'],review:{status:'pending'}},
 {id:'reading-b',versionId:'v1',kind:'interpretation',domain:'eligibility',statement:'Reading B',sourceRefs:[anchor],limitations:['Contested'],review:{status:'pending'}},
 {id:'unresolved',versionId:'v1',kind:'unknown',domain:'other',statement:'A fact is unavailable',sourceRefs:[],limitations:['Unknown'],review:{status:'pending'}}
];
const conflicts:InterpretationConflict[]=[{id:'alternatives',alternatives:['reading-a','reading-b']}];
const inputs:ForecastInput[]=[{id:'forecast-delay',value:3,unit:'calendar-day',evidenceIds:['delay']}];
const rules=[{id:'rule1',versionId:'v1',modal:'obligation',sourceRefs:[anchor]}];
const codes=(es:unknown=evidence,cs:unknown=conflicts,ins:unknown=inputs,rs:unknown=rules)=>
  validateEvidenceGraph(es,cs,ins,rs).diagnostics.map(d=>d.code);

describe('LM-017 classified evidence and provenance',()=>{
 it('validates a fully scoped fictional example with conflicting interpretations kept separate',()=>{
  expect(validateEvidenceGraph(evidence,conflicts,inputs,rules)).toEqual({valid:true,diagnostics:[]});
  expect(inspectInterpretationConflict(conflicts[0]!)).toEqual({alternatives:['reading-a','reading-b'],resolved:false,chosenId:null});
 });
 it('does not allow empirical operational delay to impersonate a statutory deadline',()=>{
  const corrupted=evidence.map(v=>v.id==='delay'?{...v,domain:'legal-deadline'}:v);
  expect(codes(corrupted)).toContain('EMPIRICAL_NOT_LEGAL_DEADLINE');
 });
 it('requires every operative rule to pin valid provenance',()=>{
  expect(codes(evidence,conflicts,inputs,[{...rules[0]!,sourceRefs:[]}])).toContain('OPERATIVE_RULE_PROVENANCE_MISSING');
  expect(codes(evidence,conflicts,inputs,[{...rules[0]!,sourceRefs:[{...anchor,versionId:'v2'}]}])).toContain('OPERATIVE_RULE_PROVENANCE_MISSING');
 });
 it('forces forecasts to cite empirical evidence or labeled assumptions',()=>{
  expect(codes(evidence,conflicts,[{...inputs[0]!,evidenceIds:['source']}])).toContain('FORECAST_PROVENANCE_INVALID');
  expect(codes(evidence,conflicts,[{...inputs[0]!,evidenceIds:['missing']}])).toContain('FORECAST_PROVENANCE_INVALID');
  expect(codes(evidence,conflicts,[{...inputs[0]!,unit:'usd'}])).toContain('FORECAST_UNIT_MISMATCH');
 });
 it('rejects nonfinite, reversed and illegal measurement ranges',()=>{
  for(const bad of [{min:5,max:2,unit:'hour'},{min:1,max:Infinity,unit:'usd'},{min:10,max:120,unit:'percent'},{min:0.5,max:1,unit:'count'}]){
    const changed=evidence.map(v=>v.id==='delay'?{...v,measurement:bad}:v);
    expect(codes(changed)).toContain('EVIDENCE_MEASUREMENT_INVALID');
  }
 });
 it('does not accept unknown as verified data or unreviewed interpretation selection',()=>{
  const changed=evidence.map(v=>v.id==='unresolved'?{...v,review:accepted}:v);
  expect(codes(changed)).toContain('EVIDENCE_UNKNOWN_NOT_DECIDED');
  const unreviewed={...conflicts[0]!,chosenId:'reading-a'};
  expect(codes(evidence,[unreviewed])).toContain('EVIDENCE_CONFLICT_UNREVIEWED_SELECTION');
  expect(inspectInterpretationConflict(unreviewed)).toMatchObject({resolved:false,chosenId:null});
 });
 it('retains alternative interpretations when a documented reviewed decision is recorded',()=>{
  const reviewed={...conflicts[0]!,chosenId:'reading-b',disposition:accepted};
  expect(codes(evidence,[reviewed])).toEqual([]);
  expect(inspectInterpretationConflict(reviewed)).toEqual({alternatives:['reading-a','reading-b'],resolved:true,chosenId:'reading-b'});
 });
 it('rejects malformed collections, duplicate IDs, unsupported or injection-shaped fields',()=>{
  expect(codes('not an array')).toContain('EVIDENCE_COLLECTION_INVALID');
  expect(codes([...evidence,evidence[0]])).toContain('EVIDENCE_DUPLICATE_ID');
  expect(codes([{...evidence[0]!,sourceRefs:[{...anchor,sourceDigest:'wrong'}]},...evidence.slice(1)])).toContain('EVIDENCE_SOURCE_INVALID');
  expect(codes([{...evidence[0]!,kind:'<script>alert(1)</script>'},...evidence.slice(1)])).toContain('EVIDENCE_RECORD_INVALID');
 });
});
