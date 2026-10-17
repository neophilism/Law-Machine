import type { SourceRef } from '../../contracts/src/model.ts';

/** LM-019: bounded, data-only rule language. No evaluation of uploaded code. */
export type FactType='boolean'|'number'|'string';
export type Truth=true|false|'unknown';
export type Scalar={readonly op:'literal';readonly value:boolean|number|string}|{readonly op:'fact-value';readonly key:string};
export type Condition=
 | {readonly op:'truth';readonly value:Scalar}
 | {readonly op:'eq'|'gte'|'lte';readonly left:Scalar;readonly right:Scalar}
 | {readonly op:'not';readonly arg:Condition}
 | {readonly op:'and'|'or';readonly terms:readonly Condition[]}
 | {readonly op:'unknown'};
export type RuleSpec={
 readonly id:string;readonly versionId:string;
 readonly modal:'obligation'|'permission'|'prohibition'|'right'|'power';
 readonly sourceRefs:readonly SourceRef[];
 readonly trigger:{readonly event:string};
 readonly when:Condition;
 readonly exceptions:readonly Condition[];
 readonly effect:{readonly operation:'route'|'record'|'create-obligation'|'schedule';readonly actorId:string};
 readonly explanationKey:string;
};
export type RuleLanguageDiagnostic={readonly code:string;readonly path:string};
export type RuleLanguageResult={readonly valid:boolean;readonly rules:readonly RuleSpec[];readonly diagnostics:readonly RuleLanguageDiagnostic[]};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allow:readonly string[])=>Object.keys(v).every(k=>allow.includes(k));
const modal=new Set(['obligation','permission','prohibition','right','power']);
const operations=new Set(['route','record','create-obligation','schedule']);

export function parseRuleLanguage(
 text:string, factTypes:Readonly<Record<string,FactType>>, capabilities:readonly string[]
):RuleLanguageResult{
 const diagnostics:RuleLanguageDiagnostic[]=[];
 const fail=(code:string,path:string)=>{if(diagnostics.length<100)diagnostics.push({code,path});};
 if(typeof text!=='string'||text.length>262144||typeof factTypes!=='object'||!factTypes||
   Object.keys(factTypes).length>1000||Object.entries(factTypes).some(([k,v])=>!id(k)||!['boolean','number','string'].includes(v))||
   !Array.isArray(capabilities)||capabilities.length>100||!capabilities.every(id))
  return {valid:false,rules:[],diagnostics:[{code:'RULE_INPUT_INVALID',path:'$'}]};
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{return {valid:false,rules:[],diagnostics:[{code:'RULE_JSON_INVALID',path:'$'}]};}
 if(!object(raw)||!keys(raw,['schemaVersion','rules'])||raw.schemaVersion!==1||
   !Array.isArray(raw.rules)||raw.rules.length>256)
  return {valid:false,rules:[],diagnostics:[{code:'RULE_SCHEMA_UNSUPPORTED',path:'$'}]};
 const names=new Set<string>();
 let nodes=0;
 function scalar(v:unknown,path:string):FactType|null{
  if(!object(v)||!keys(v,['op','value','key'])){fail('EXPRESSION_INVALID',path);return null;}
  if(v.op==='literal'){
   if(!Object.hasOwn(v,'value')||Object.hasOwn(v,'key')){fail('EXPRESSION_INVALID',path);return null;}
   if(typeof v.value==='boolean')return 'boolean';
   if(typeof v.value==='number'&&Number.isFinite(v.value))return 'number';
   if(typeof v.value==='string'&&v.value.length<=1024)return 'string';
  }else if(v.op==='fact-value'){
   if(!id(v.key)||Object.hasOwn(v,'value')){fail('FACT_INVALID',path);return null;}
   if(Object.hasOwn(factTypes,v.key))return factTypes[v.key as string]??null;
   fail('FACT_UNDECLARED',path);return null;
  }
  fail('EXPRESSION_INVALID',path);return null;
 }
 function expression(v:unknown,path:string,depth:number):void{
  if(++nodes>1024||depth>20){fail('EXPRESSION_LIMIT',path);return;}
  if(!object(v)){fail('EXPRESSION_INVALID',path);return;}
  if(v.op==='unknown'){if(!keys(v,['op']))fail('EXPRESSION_INVALID',path);return;}
  if(v.op==='truth'){
   if(!keys(v,['op','value']))fail('EXPRESSION_INVALID',path);
   const t=scalar(v.value,path+'.value');
   if(t!==null&&t!=='boolean')fail('EXPRESSION_TYPE_MISMATCH',path);
   return;
  }
  if(v.op==='eq'||v.op==='gte'||v.op==='lte'){
   if(!keys(v,['op','left','right']))fail('EXPRESSION_INVALID',path);
   const a=scalar(v.left,path+'.left'),b=scalar(v.right,path+'.right');
   if(a!==null&&b!==null&&(a!==b||(v.op!=='eq'&&a!=='number')))fail('EXPRESSION_TYPE_MISMATCH',path);
   return;
  }
  if(v.op==='not'){if(!keys(v,['op','arg']))fail('EXPRESSION_INVALID',path);expression(v.arg,path+'.arg',depth+1);return;}
  if(v.op==='and'||v.op==='or'){
   if(!keys(v,['op','terms'])||!Array.isArray(v.terms)||v.terms.length<2||v.terms.length>32){
    fail('EXPRESSION_INVALID',path);return;
   }
   v.terms.forEach((c:unknown,i:number)=>expression(c,path+'.terms['+i+']',depth+1));
   return;
  }
  fail('EXPRESSION_OPERATOR_UNSUPPORTED',path);
 }
 for(const [i,record] of raw.rules.entries()){
  const path='$.rules['+i+']';
  if(!object(record)||!keys(record,['id','versionId','modal','sourceRefs','trigger','when','exceptions','effect','explanationKey'])||
    !id(record.id)||names.has(record.id)||!id(record.versionId)||!modal.has(String(record.modal))||
    !Array.isArray(record.sourceRefs)||record.sourceRefs.length<1||record.sourceRefs.length>100||
    !object(record.trigger)||!keys(record.trigger,['event'])||!id(record.trigger.event)||
    !Array.isArray(record.exceptions)||record.exceptions.length>32||
    !object(record.effect)||!keys(record.effect,['operation','actorId'])||
    !id(record.effect.actorId)||!operations.has(String(record.effect.operation))||
    !id(record.explanationKey)){
    fail('RULE_RECORD_INVALID',path);continue;
  }
  names.add(record.id);
  for(const [j,ref] of record.sourceRefs.entries())
   if(!object(ref)||!keys(ref,['versionId','provisionId','sourceDigest','quote'])||
      ref.versionId!==record.versionId||!id(ref.provisionId)||
      typeof ref.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(ref.sourceDigest)||
      typeof ref.quote!=='string'||!ref.quote.trim()||ref.quote.length>8192)
     fail('RULE_SOURCE_INVALID',path+'.sourceRefs['+j+']');
  if(!capabilities.includes(record.effect.operation as string))
   fail('RULE_CAPABILITY_UNSUPPORTED',path+'.effect.operation');
  expression(record.when,path+'.when',0);
  record.exceptions.forEach((v:unknown,j:number)=>expression(v,path+'.exceptions['+j+']',0));
 }
 if(diagnostics.length)return {valid:false,rules:[],diagnostics};
 return {valid:true,rules:raw.rules as RuleSpec[],diagnostics:[]};
}

/**
 * Guard execution only, not effects or time. A missing fact is unknown, never
 * false. Comparisons reject mixed types (validated before this is called).
 */
export function evaluateRuleGuard(rule:RuleSpec,facts:Readonly<Record<string,unknown>>):
 {readonly when:Truth;readonly exception:Truth;readonly applicable:Truth}{
 if(!facts||typeof facts!=='object')throw Error('FACTS_INVALID');
 let nodes=0;
 const missing=Symbol('missing-fact');
 const val=(s:Scalar):unknown=>{
  if(s.op==='literal')return s.value;
  return Object.hasOwn(facts,s.key)?facts[s.key]:missing;
 };
 const evaluate=(c:Condition,depth:number):Truth=>{
  if(++nodes>1024||depth>20)throw Error('RULE_EVALUATION_LIMIT');
  if(c.op==='unknown')return 'unknown';
  if(c.op==='truth'){const v=val(c.value);return typeof v==='boolean'?v:'unknown';}
  if(c.op==='eq'||c.op==='gte'||c.op==='lte'){
   const a=val(c.left),b=val(c.right);
   if(a===missing||b===missing||a===undefined||b===undefined||typeof a!==typeof b)return 'unknown';
   if(c.op==='eq')return a===b;
   if(typeof a!=='number'||typeof b!=='number'||!Number.isFinite(a)||!Number.isFinite(b))return 'unknown';
   return c.op==='gte'?a>=b:a<=b;
  }
  if(c.op==='not'){const v=evaluate(c.arg,depth+1);return v==='unknown'?'unknown':!v;}
  const outcomes=c.terms.map(t=>evaluate(t,depth+1));
  if(c.op==='and')return outcomes.includes(false)?false:outcomes.includes('unknown')?'unknown':true;
  return outcomes.includes(true)?true:outcomes.includes('unknown')?'unknown':false;
 };
 const when=evaluate(rule.when,0);
 const exceptions=rule.exceptions.map(c=>evaluate(c,0));
 const except:Truth=exceptions.includes(true)?true:exceptions.includes('unknown')?'unknown':false;
 const applicable:Truth=when===false||except===true?false:when==='unknown'||except==='unknown'?'unknown':true;
 return {when,exception:except,applicable};
}
