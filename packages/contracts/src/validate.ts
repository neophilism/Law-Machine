import { SCHEMA_VERSION, type ValidationResult, type Diagnostic } from './model.ts';

/** Validate untrusted JSON without calling user-supplied functions or accepting prototypes. */
export function validateBundle(value: unknown): ValidationResult {
  const errors: Diagnostic[] = [];
  const fail = (code: string, path: string, message: string) => errors.push({ code, path, message });
  const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 8192;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
  const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const qty = (v: unknown, path: string) => {
    if (!record(v) || typeof v.value !== 'number' || !Number.isFinite(v.value) || v.value < 0 || !['day','businessDay','hour','usd','count','percent'].includes(String(v.unit)) || (v.unit === 'percent' && v.value > 100)) fail('INVALID_QUANTITY', path, 'Expected finite nonnegative value and supported unit (percent <= 100)');
  };
  if (!record(value)) return { valid: false, diagnostics: [{ code:'INVALID_BUNDLE', path:'$', message:'Expected object' }] };
  if (value.schemaVersion !== SCHEMA_VERSION) fail('UNSUPPORTED_SCHEMA', '$.schemaVersion', 'Expected ' + SCHEMA_VERSION);
  const names = ['billVersions','provisions','actors','assumptions','rules','scenarios','releases','traces'] as const;
  for (const name of names) if (!Array.isArray(value[name]) || value[name].length > 10000) fail('INVALID_COLLECTION', '$.' + name, 'Expected array of at most 10000 elements');
  if (errors.length) return { valid: false, diagnostics: errors };
  const arrays = Object.fromEntries(names.map(n => [n,value[n] as unknown[]])) as Record<(typeof names)[number], unknown[]>;
  const ids: Record<string, Set<string>> = Object.fromEntries(names.map(n => [n,new Set<string>()])) as Record<string,Set<string>>;
  function each(name: (typeof names)[number], check: (r: Record<string,unknown>, path: string) => void) {
    arrays[name].forEach((v,i) => {
      const path = '$.' + name + '[' + i + ']';
      if (!record(v)) { fail('INVALID_RECORD',path,'Expected object'); return; }
      if (!id(v.id)) fail('INVALID_ID',path+'.id','Expected scoped identifier');
      else if (ids[name]!.has(v.id)) fail('DUPLICATE_ID',path+'.id','Duplicate identifier in '+name);
      else ids[name]!.add(v.id);
      check(v,path);
    });
  }
  const refs: {version:unknown; provision:unknown; path:string}[] = [];
  function source(v: unknown, path: string) {
    if (!record(v)) {fail('INVALID_SOURCE',path,'Source reference required');return;}
    if (!id(v.versionId) || !id(v.provisionId) || !digest(v.sourceDigest) || !str(v.quote)) fail('INVALID_SOURCE',path,'Expected version, provision, SHA-256 digest and exact quote');
    else refs.push({version:v.versionId,provision:v.provisionId,path});
  }
  const crossVersion: {target:unknown; path:string}[] = [];
  each('billVersions',(r,p) => {
    if (!id(r.billId) || !str(r.version) || !str(r.jurisdiction) || !digest(r.sourceDigest) || !['draft','introduced','enacted','repealed'].includes(String(r.status))) fail('INVALID_BILL_VERSION',p,'Missing or invalid version metadata');
  });
  const provisionVersions = new Map<string,string>();
  each('provisions',(r,p) => {
    if (!id(r.versionId) || !str(r.citation) || !str(r.text)) fail('INVALID_PROVISION',p,'Missing provision fields');
    if (id(r.id) && id(r.versionId)) provisionVersions.set(r.id,r.versionId);
    crossVersion.push({target:r.versionId,path:p+'.versionId'});
    source(r.source,p+'.source');
    if (r.parentId !== undefined && !id(r.parentId)) fail('INVALID_PARENT',p+'.parentId','Invalid parent');
  });
  each('actors',(r,p) => { if (!str(r.name) || !['agency','court','person','organization','other'].includes(String(r.kind))) fail('INVALID_ACTOR',p,'Invalid actor'); });
  each('assumptions',(r,p) => {
    if (!str(r.description) || !['interpretation','empirical','hypothetical','unknown'].includes(String(r.classification)) || !record(r.value) || !['known','unknown'].includes(String(r.value?.kind))) { fail('INVALID_ASSUMPTION',p,'Invalid assumption or tagged value');return; }
    if (r.value.kind === 'unknown' && !str(r.value.reason)) fail('INVALID_UNKNOWN',p+'.value','Unknown requires reason');
    if (r.value.kind === 'known') {
      const x = r.value.value;
      if (typeof x === 'object') qty(x,p+'.value.value');
      else if (!(str(x) || typeof x === 'boolean')) fail('INVALID_VALUE',p+'.value','Unsupported known value');
    }
  });
  each('rules',(r,p) => {
    crossVersion.push({target:r.versionId,path:p+'.versionId'});
    if (!id(r.versionId) || !str(r.operation) || !['obligation','permission','prohibition','right','power'].includes(String(r.modal)) || !Array.isArray(r.sourceRefs) || !r.sourceRefs.length) fail('INVALID_RULE',p,'Missing operative rule fields and provenance');
    else r.sourceRefs.forEach((s,i)=>source(s,p+'.sourceRefs['+i+']'));
  });
  each('scenarios',(r,p) => {
    crossVersion.push({target:r.versionId,path:p+'.versionId'});
    if (!id(r.versionId) || !str(r.title) || r.hypothetical !== true || !Array.isArray(r.assumptions) || !r.assumptions.every(id)) fail('INVALID_SCENARIO',p,'Scenario must be explicitly hypothetical');
    else r.assumptions.forEach((a,i)=>{if(!ids.assumptions!.has(a)) fail('UNKNOWN_ASSUMPTION',p+'.assumptions['+i+']','Unresolved assumption');});
  });
  each('releases',(r,p)=>{
    crossVersion.push({target:r.billVersionId,path:p+'.billVersionId'});
    if (r.schemaVersion !== SCHEMA_VERSION || !id(r.billVersionId) || !digest(r.sourceDigest) || typeof r.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(r.createdAt) || Number.isNaN(Date.parse(r.createdAt))) fail('INVALID_RELEASE',p,'Invalid pinned release');
  });
  each('traces',(r,p)=>{
    if (!id(r.scenarioId) || !id(r.actorId) || !id(r.ruleId) || typeof r.tick !== 'number' || !Number.isSafeInteger(r.tick) || r.tick < 0 || !Array.isArray(r.sourceRefs)) fail('INVALID_TRACE',p,'Invalid event');
    else {
      if (!ids.scenarios!.has(r.scenarioId)) fail('UNKNOWN_SCENARIO',p+'.scenarioId','Unresolved scenario');
      if (!ids.actors!.has(r.actorId)) fail('UNKNOWN_ACTOR',p+'.actorId','Unresolved actor');
      if (!ids.rules!.has(r.ruleId)) fail('UNKNOWN_RULE',p+'.ruleId','Unresolved rule');
      r.sourceRefs.forEach((s,i)=>source(s,p+'.sourceRefs['+i+']'));
    }
  });
  for (const {target,path} of crossVersion) if (!ids.billVersions!.has(String(target))) fail('UNKNOWN_VERSION',path,'Referenced bill version does not exist');
  for (const {version,provision,path} of refs) {
    if (!ids.billVersions!.has(String(version))) fail('UNKNOWN_VERSION',path+'.versionId','Referenced version does not exist');
    if (provisionVersions.get(String(provision)) !== version) fail('CROSS_VERSION_SOURCE',path+'.provisionId','Provision missing or belongs to a different version');
  }
  arrays.provisions.forEach((v,i)=>{
    if (record(v) && v.parentId !== undefined && (provisionVersions.get(String(v.parentId)) !== v.versionId || v.parentId === v.id)) fail('INVALID_PARENT','$.provisions['+i+'].parentId','Parent must exist in the same version and cannot be self');
  });
  return { valid: errors.length === 0, diagnostics: errors };
}
