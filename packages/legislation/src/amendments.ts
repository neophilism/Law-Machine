import type { NormalizedDocument, NormalizedProvision } from './provision-tree.ts';
import { canonicalJSON } from '../../contracts/src/integrity.ts';

/** An amendatory instruction is not an enacted law or authoritative consolidated text. */
export type AmendmentOperation='insert'|'replace'|'repeal'|'renumber';
export type AmendmentInstruction={
  readonly id:string;
  readonly operation:AmendmentOperation;
  readonly baselineVersionId:string;
  readonly baselineSourceDigest:string;
  readonly targetProvisionId:string;
  /** For insert: the identifier of the new version-local provision. */
  readonly newProvisionId?:string;
  readonly text?:string;
  readonly newCitation?:string;
  /** Explicit, auditable precedence between instructions; implicit order is illegal. */
  readonly after?:readonly string[];
  readonly amendatorySourceId:string;
};
export type ProjectedProvision={
  readonly id:string;readonly parentId:string|null;
  readonly citation:string|null;readonly text:string;
  readonly span:NormalizedProvision['span']|null;
  readonly origin:'baseline'|'reconstructed';
  readonly changedBy:readonly string[];
  readonly repealed:boolean;
};
export type AmendmentDiagnostic={
  readonly code:string;readonly instructionIds:readonly string[];
  readonly path:string;readonly message:string;
};
export type ProjectionResult={
  readonly status:'projected-consolidation'|'unresolved';
  readonly label:'Generated consolidation — not an official source';
  readonly baselineVersionId:string;
  readonly baselineSourceDigest:string;
  readonly orderedInstructions:readonly AmendmentInstruction[];
  readonly projectedProvisions:readonly ProjectedProvision[];
  readonly diagnostics:readonly AmendmentDiagnostic[];
};
const identifier=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digest=/^[a-f0-9]{64}$/;
/**
 * Project only after all targets, source versions, precedence and conflicts
 * validate. If any ambiguity exists, return an inspectable unresolved result
 * containing the UNCHANGED baseline projection.
 */
export function projectAmendments(baseline:NormalizedDocument,instructions:readonly AmendmentInstruction[]):ProjectionResult{
  if(!baseline||!identifier.test(baseline.versionId)||!digest.test(baseline.sourceDigest)||
    !Array.isArray(baseline.provisions)||baseline.provisions.length>10000||
    !Array.isArray(instructions)||instructions.length>1000)throw Error('AMENDMENT_INPUT_INVALID');
  const unmodified=():ProjectedProvision[]=>baseline.provisions.map(p=>({
    id:p.id,parentId:p.parentId,citation:p.citation,text:p.text,span:p.span,origin:'baseline' as const,
    changedBy:[],repealed:false
  }));
  const diagnostics:AmendmentDiagnostic[]=[];
  const add=(code:string,ids:readonly string[],path:string,message:string)=>{
    if(diagnostics.length<100)diagnostics.push({code,instructionIds:[...ids],path,message});
  };
  const byId=new Map<string,AmendmentInstruction>();
  const baseIds=new Set(baseline.provisions.map(p=>p.id));
  const validId=(value:unknown):value is string=>typeof value==='string'&&identifier.test(value);
  const declaredTargets=new Map<string,AmendmentInstruction[]>();
  for(const [index,item] of instructions.entries()){
    const path='$.instructions['+index+']';
    if(!item||!validId(item.id)||byId.has(item.id)){
      add('AMENDMENT_DUPLICATE_ID',item?.id?[item.id]:[],path,'Amendment ID missing or duplicated');
      continue;
    }
    byId.set(item.id,item);
    if(!['insert','replace','repeal','renumber'].includes(item.operation)||
      item.baselineVersionId!==baseline.versionId||
      item.baselineSourceDigest!==baseline.sourceDigest||
      !validId(item.targetProvisionId)||!validId(item.amendatorySourceId)) {
      add('AMENDMENT_SOURCE_MISMATCH',[item.id],path,'Source and exact target must match pinned baseline');
      continue;
    }
    if(!baseIds.has(item.targetProvisionId))add('AMENDMENT_TARGET_MISSING',[item.id],path,'Target provision not found on pinned baseline');
    if(!Array.isArray(item.after??[])||(item.after??[]).length>100||
      !(item.after??[]).every(validId)||new Set(item.after??[]).size!==(item.after??[]).length)
      add('AMENDMENT_PRECEDENCE_INVALID',[item.id],path,'Precedence links must be unique declared IDs');
    if(item.operation==='insert'){
      if(!validId(item.newProvisionId)||baseIds.has(item.newProvisionId)||
        typeof item.text!=='string'||!item.text.trim()||item.text.length>100000||
        typeof item.newCitation!=='string'||!item.newCitation.trim()||item.newCitation.length>200)
        add('AMENDMENT_INSERT_INVALID',[item.id],path,'A new scoped ID, citation and text are required');
    }else if(item.operation==='replace'){
      if(typeof item.text!=='string'||!item.text.trim()||item.text.length>100000)
        add('AMENDMENT_REPLACEMENT_INVALID',[item.id],path,'Replacement source text is required');
    }else if(item.operation==='renumber'){
      if(typeof item.newCitation!=='string'||!item.newCitation.trim()||item.newCitation.length>200)
        add('AMENDMENT_RENUMBER_INVALID',[item.id],path,'New display citation required');
    }
    const group=declaredTargets.get(item.targetProvisionId)??[];
    group.push(item);declaredTargets.set(item.targetProvisionId,group);
  }
  // Missing precedence links and directed cycles are invalid, never guessed.
  for(const item of instructions)for(const parent of item.after??[]){
    if(!byId.has(parent))add('AMENDMENT_PRECEDENCE_MISSING',[item.id],parent,'Required earlier instruction is absent');
    if(parent===item.id)add('AMENDMENT_PRECEDENCE_CYCLE',[item.id],parent,'Self precedent prohibited');
  }
  const ordered:AmendmentInstruction[]=[];
  const visitState=new Map<string,0|1|2>();
  function visit(id:string){
    const state=visitState.get(id)??0;
    if(state===1){add('AMENDMENT_PRECEDENCE_CYCLE',[id],id,'Cycle in precedence graph');return;}
    if(state===2)return;
    const item=byId.get(id);if(!item)return;
    visitState.set(id,1);
    for(const prev of [...(item.after??[])].sort())if(byId.has(prev))visit(prev);
    visitState.set(id,2);ordered.push(item);
  }
  for(const id of [...byId.keys()].sort())visit(id);
  const predecessors=new Map<string,Set<string>>();
  function transitive(id:string,chain=new Set<string>()):Set<string>{
    if(predecessors.has(id))return predecessors.get(id)!;
    if(chain.has(id))return new Set();
    chain.add(id);const result=new Set<string>();
    for(const p of byId.get(id)?.after??[]){
      result.add(p);
      for(const dep of transitive(p,new Set(chain)))result.add(dep);
    }
    predecessors.set(id,result);return result;
  }
  for(const [target,group] of declaredTargets){
    for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
      const a=group[i]!,b=group[j]!;
      if(!transitive(a.id).has(b.id)&&!transitive(b.id).has(a.id))
        add('AMENDMENT_CONFLICT_UNRESOLVED',[a.id,b.id],target,'Two instructions touch one target without explicit precedence');
    }
  }
  const inserted=new Set<string>();
  for(const i of instructions){
    if(i.operation==='insert'&&i.newProvisionId){
      if(inserted.has(i.newProvisionId))add('AMENDMENT_INSERT_COLLISION',[i.id],i.newProvisionId,'New ID reused');
      inserted.add(i.newProvisionId);
    }
  }
  const base=unmodified();
  const result=(status:ProjectionResult['status'],projected:ProjectedProvision[]):ProjectionResult=>({
    status,label:'Generated consolidation — not an official source',
    baselineVersionId:baseline.versionId,baselineSourceDigest:baseline.sourceDigest,
    orderedInstructions:JSON.parse(canonicalJSON(ordered)) as AmendmentInstruction[],
    projectedProvisions:projected,diagnostics
  });
  if(diagnostics.length)return result('unresolved',base);
  const projected=base.map(p=>({...p}));
  for(const change of ordered){
    const index=projected.findIndex(p=>p.id===change.targetProvisionId);
    if(index<0){add('AMENDMENT_TARGET_MISSING',[change.id],change.targetProvisionId,'Missing projected target');break;}
    const current=projected[index]!;
    if(current.repealed&&change.operation!=='insert'){
      add('AMENDMENT_REPEALED_TARGET',[change.id],current.id,'A repealed target cannot be edited by implication');break;
    }
    if(change.operation==='insert'){
      if(projected.some(p=>p.id===change.newProvisionId)){add('AMENDMENT_INSERT_COLLISION',[change.id],current.id,'New provision ID exists');break;}
      projected.splice(index+1,0,{id:change.newProvisionId!,parentId:current.parentId,citation:change.newCitation!,
        text:change.text!,span:null,origin:'reconstructed',changedBy:[change.id],repealed:false});
    }else if(change.operation==='replace')projected[index]={...current,text:change.text!,origin:'reconstructed',changedBy:[...current.changedBy,change.id]};
    else if(change.operation==='renumber')projected[index]={...current,citation:change.newCitation!,origin:'reconstructed',changedBy:[...current.changedBy,change.id]};
    else if(change.operation==='repeal')projected[index]={...current,repealed:true,origin:'reconstructed',changedBy:[...current.changedBy,change.id]};
  }
  // An unresolved amendment never publishes a partially-applied consolidation.
  return result(diagnostics.length?'unresolved':'projected-consolidation',diagnostics.length?base:projected);
}
