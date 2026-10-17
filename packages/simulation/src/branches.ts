/** LM-024 explicit hypothetical branches for unknown facts, exceptions and discretion. */
export type ThreeValued=true|false|'unknown';
export type Exception={readonly id:string;readonly modifiesDutyId:string;readonly factId:string;readonly whenValue:boolean;readonly sourceRefs:readonly string[]};
export type BranchChoice={readonly id:string;readonly facts:Readonly<Record<string,ThreeValued>>;readonly appliedExceptions:readonly string[];readonly unresolved:readonly string[];readonly label:string};
export type BranchResult={readonly state:'resolved'|'alternatives'|'limited';readonly branches:readonly BranchChoice[];readonly diagnostics:readonly string[]};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[\w:.-]{1,128}$/.test(v);
export function branchOnExceptions(dutyId:string,facts:Readonly<Record<string,ThreeValued>>,exceptions:readonly Exception[],maxBranches=16):BranchResult{
 if(!id(dutyId)||!facts||typeof facts!=='object'||Array.isArray(facts)||Object.keys(facts).length>100||
 Object.entries(facts).some(([k,v])=>!id(k)||![true,false,'unknown'].includes(v))||
 !Array.isArray(exceptions)||exceptions.length>32||!Number.isSafeInteger(maxBranches)||maxBranches<1||maxBranches>256)throw Error('BRANCH_INPUT_INVALID');
 const seen=new Set<string>();
 for(const e of exceptions)if(!e||!id(e.id)||seen.has(e.id)||e.modifiesDutyId!==dutyId||!id(e.factId)||
 typeof e.whenValue!=='boolean'||!Array.isArray(e.sourceRefs)||!e.sourceRefs.length||!e.sourceRefs.every(id))throw Error('EXCEPTION_INVALID');
 else seen.add(e.id);
 const missing=[...new Set(exceptions.filter(e=>!Object.hasOwn(facts,e.factId)||facts[e.factId]==='unknown').map(e=>e.factId))].sort();
 if(missing.length>20)return {state:'limited',branches:[],diagnostics:['UNKNOWN_FACT_BRANCH_LIMIT']};
 if(2**missing.length>maxBranches)return {state:'limited',branches:[],diagnostics:['BRANCH_BUDGET_EXCEEDED']};
 const count=2**missing.length;
 const branches:BranchChoice[]=[];
 for(let mask=0;mask<count;mask++){
  const assignments:{[key:string]:ThreeValued}={...facts};
  missing.forEach((key,i)=>{assignments[key]=Boolean((mask>>i)&1);});
  const applied=exceptions.filter(e=>assignments[e.factId]===e.whenValue).map(e=>e.id).sort();
  branches.push({id:'branch-'+mask,facts:assignments,appliedExceptions:applied,unresolved:[...missing],label:missing.length?'Hypothetical alternative '+(mask+1):'Determinate facts'});
 }
 return {state:missing.length?'alternatives':'resolved',branches,diagnostics:missing.length?['UNKNOWN_FACT_ALTERNATIVES']:[]};
}
