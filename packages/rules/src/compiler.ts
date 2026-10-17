import { canonicalJSON } from '../../contracts/src/integrity.ts';
import { parseRuleLanguage, type FactType, type RuleSpec } from './language.ts';

/** LM-020: immutable validated execution data, not a simulation or legal determination. */
export type SourceInventoryItem={readonly id:string;readonly text:string};
export type RulePrecedence={readonly ruleId:string;readonly after:readonly string[]};
export type CompileEnvironment={
 readonly versionId:string;
 readonly sourceDigest:string;
 readonly provisions:readonly SourceInventoryItem[];
 readonly actors:readonly string[];
 /** Externally received event kinds for which triggering can be established. */
 readonly externalEvents:readonly string[];
 readonly precedence:readonly RulePrecedence[];
 readonly factTypes:Readonly<Record<string,FactType>>;
 readonly capabilities:readonly string[];
};
export type CompiledRule={
 readonly id:string;readonly versionId:string;readonly trigger:string;
 readonly actorId:string;readonly modal:RuleSpec['modal'];readonly operation:RuleSpec['effect']['operation'];
 readonly when:RuleSpec['when'];readonly exceptions:RuleSpec['exceptions'];
 readonly sourceRefs:RuleSpec['sourceRefs'];readonly explanationKey:string;
 readonly after:readonly string[];
};
export type RuleDependency={readonly provisionId:string;readonly ruleIds:readonly string[]};
export type CompiledModel={
 readonly languageVersion:1;readonly versionId:string;readonly sourceDigest:string;
 readonly orderedRules:readonly CompiledRule[];
 readonly sourceDependencies:readonly RuleDependency[];
 readonly externallyReachableEvents:readonly string[];
};
export type CompilerDiagnostic={readonly code:string;readonly path:string};
export type Compilation={readonly valid:boolean;readonly compiled:CompiledModel|null;readonly diagnostics:readonly CompilerDiagnostic[]};

const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const distinct=(items:readonly string[])=>new Set(items).size===items.length;
function deepFreeze<T>(input:T):Readonly<T>{
 if(input&&typeof input==='object'){
  for(const key of Object.keys(input))deepFreeze((input as unknown as Record<string,unknown>)[key]);
  Object.freeze(input);
 }
 return input;
}

/**
 * Conservatively reject ambiguous rules sharing one external trigger/actor.
 * Explicit precedence is a mechanical tie-break, not proof of legal priority.
 */
export function compileRuleModel(text:string,env:CompileEnvironment):Compilation{
 const diagnostics:CompilerDiagnostic[]=[];
 const error=(code:string,path:string)=>{if(diagnostics.length<100)diagnostics.push({code,path});};
 const failure=():Compilation=>({valid:false,compiled:null,diagnostics});
 if(!env||!id(env.versionId)||!hex(env.sourceDigest)||
  !Array.isArray(env.provisions)||env.provisions.length>10000||
  !Array.isArray(env.actors)||env.actors.length>1000||
  !Array.isArray(env.externalEvents)||env.externalEvents.length>1000||
  !Array.isArray(env.precedence)||env.precedence.length>256||
  !Array.isArray(env.capabilities)||env.capabilities.length>100||
  !env.actors.every(id)||!env.externalEvents.every(id)||
  !distinct(env.actors)||!distinct(env.externalEvents)){
   error('COMPILE_ENVIRONMENT_INVALID','$');return failure();
 }
 const provisions=new Map<string,string>();
 for(const [i,entry] of env.provisions.entries()){
  if(!entry||!id(entry.id)||typeof entry.text!=='string'||entry.text.length>100000||provisions.has(entry.id))
   error('COMPILE_SOURCE_INVALID','$.provisions['+i+']');
  else provisions.set(entry.id,entry.text);
 }
 const parsed=parseRuleLanguage(text,env.factTypes,env.capabilities);
 for(const problem of parsed.diagnostics)error(problem.code,problem.path);
 if(diagnostics.length)return failure();
 const ruleById=new Map<string,RuleSpec>();
 const actorSet=new Set(env.actors);
 const events=new Set(env.externalEvents);
 for(const [i,rule] of parsed.rules.entries()){
  const path='$.rules['+i+']';
  if(rule.versionId!==env.versionId)error('COMPILE_VERSION_MISMATCH',path+'.versionId');
  if(!actorSet.has(rule.effect.actorId))error('COMPILE_ACTOR_UNDECLARED',path+'.effect.actorId');
  if(!events.has(rule.trigger.event))error('COMPILE_TRIGGER_UNREACHABLE',path+'.trigger.event');
  const seenRefs=new Set<string>();
  for(const [j,ref] of rule.sourceRefs.entries()){
   const key=ref.versionId+'|'+ref.provisionId+'|'+ref.quote;
   if(seenRefs.has(key))error('COMPILE_DUPLICATE_SOURCE',path+'.sourceRefs['+j+']');
   seenRefs.add(key);
   if(ref.versionId!==env.versionId||ref.sourceDigest!==env.sourceDigest||
      !provisions.get(ref.provisionId)?.includes(ref.quote))
    error('COMPILE_SOURCE_UNRESOLVED',path+'.sourceRefs['+j+']');
  }
  ruleById.set(rule.id,rule);
 }
 const after=new Map<string,string[]>();
 for(const [i,edge] of env.precedence.entries()){
  const path='$.precedence['+i+']';
  if(!edge||!id(edge.ruleId)||!ruleById.has(edge.ruleId)||after.has(edge.ruleId)||
    !Array.isArray(edge.after)||edge.after.length>100||
    !edge.after.every(id)||!distinct(edge.after)||edge.after.some(v=>!ruleById.has(v))){
   error('COMPILE_PRECEDENCE_INVALID',path);continue;
  }
  after.set(edge.ruleId,[...edge.after].sort());
 }
 if(diagnostics.length)return failure();
 const ancestors=new Map<string,Set<string>>();
 const pending=new Set<string>();
 const ordered:string[]=[];
 function visit(ruleId:string):Set<string>{
  const cached=ancestors.get(ruleId);
  if(cached)return cached;
  if(pending.has(ruleId)){error('COMPILE_PRECEDENCE_CYCLE',ruleId);return new Set();}
  pending.add(ruleId);
  const dependencies=new Set<string>();
  for(const previous of after.get(ruleId)??[]){
   dependencies.add(previous);
   for(const inherited of visit(previous))dependencies.add(inherited);
  }
  pending.delete(ruleId);
  ancestors.set(ruleId,dependencies);
  ordered.push(ruleId);
  return dependencies;
 }
 for(const ruleId of [...ruleById.keys()].sort())visit(ruleId);
 const groups=new Map<string,string[]>();
 for(const rule of parsed.rules){
  const key=JSON.stringify([rule.trigger.event,rule.effect.actorId]);
  const group=groups.get(key)??[];
  group.push(rule.id);groups.set(key,group);
 }
 for(const [key,group] of groups){
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const a=group[i]!,b=group[j]!;
   if(!ancestors.get(a)?.has(b)&&!ancestors.get(b)?.has(a))
    error('COMPILE_RULE_CONFLICT_UNRESOLVED',key);
  }
 }
 if(diagnostics.length)return failure();
 const compiledRules:CompiledRule[]=ordered.map(ruleId=>{
  const rule=ruleById.get(ruleId)!;
  return {
   id:rule.id,versionId:rule.versionId,trigger:rule.trigger.event,
   actorId:rule.effect.actorId,modal:rule.modal,operation:rule.effect.operation,
   when:rule.when,exceptions:rule.exceptions,sourceRefs:rule.sourceRefs,
   explanationKey:rule.explanationKey,after:after.get(ruleId)??[]
  };
 });
 const dependencies=new Map<string,Set<string>>();
 for(const rule of compiledRules)for(const ref of rule.sourceRefs){
  const ids=dependencies.get(ref.provisionId)??new Set<string>();
  ids.add(rule.id);dependencies.set(ref.provisionId,ids);
 }
 const model:CompiledModel={
  languageVersion:1,versionId:env.versionId,sourceDigest:env.sourceDigest,
  orderedRules:compiledRules,
  sourceDependencies:[...dependencies.entries()].sort(([a],[b])=>a.localeCompare(b))
   .map(([provisionId,ruleIds])=>({provisionId,ruleIds:[...ruleIds].sort()})),
  externallyReachableEvents:[...events].sort()
 };
 // Detach every nested object from caller input, then freeze the resulting data.
 const detached=JSON.parse(canonicalJSON(model)) as CompiledModel;
 return {valid:true,compiled:deepFreeze(detached),diagnostics:[]};
}
