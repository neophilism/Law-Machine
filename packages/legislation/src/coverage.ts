import type { ModelBundle } from '../../contracts/src/model.ts';
import { validateBundle } from '../../contracts/src/validate.ts';

/** Coverage is an explicit editorial declaration; a successful model is not legal advice. */
export type CoverageMode = 'modeled' | 'explanatory-only' | 'ambiguous' | 'unsupported';
export type CapabilityList = { readonly operations: readonly string[]; readonly calendars: readonly string[]; readonly domains: readonly string[] };
export type CoverageMapping = { readonly provisionId: string; readonly mode: CoverageMode; readonly reason?: string };
export type CoveragePack = {
  readonly versionId: string;
  readonly baselineDate: string;
  readonly hypothetical: true;
  readonly mappings: readonly CoverageMapping[];
  readonly requires: CapabilityList;
};
export type CoverageDiagnostic = { readonly code: string; readonly path: string; readonly message: string };
export type CoverageCounts = Record<CoverageMode | 'unmapped', number>;
export type PublicDisclosures = {
  readonly legalStatus: string;
  readonly baseline: string;
  readonly scenario: string;
  readonly coverage: string;
};
export type CoverageAssessment = {
  readonly completeWithinDeclaredScope: boolean;
  readonly canRunPartialModel: boolean;
  readonly counts: Readonly<CoverageCounts>;
  readonly disclosures: PublicDisclosures;
  readonly missingCapabilities: CapabilityList;
  readonly diagnostics: readonly CoverageDiagnostic[];
};

/** Executable capability negotiation is independent of a visual scene or view. */
export function assessCoverage(bundle: ModelBundle, pack: CoveragePack, support: CapabilityList): CoverageAssessment {
  const diagnostics: CoverageDiagnostic[] = [];
  const fail = (code: string, path: string, message: string) => diagnostics.push({ code, path, message });
  const obj = (v: unknown): v is Record<string,unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
  const names = ['operations','calendars','domains'] as const;
  const empty = (): CapabilityList => ({operations:[],calendars:[],domains:[]});
  const counts: CoverageCounts = {modeled:0,'explanatory-only':0,ambiguous:0,unsupported:0,unmapped:0};
  const initial: PublicDisclosures = {legalStatus:'Legal status unverified',baseline:'Baseline unknown',scenario:'Hypothetical model only',coverage:'Coverage not evaluated'};
  const invalid = (): CoverageAssessment => ({
    completeWithinDeclaredScope:false,canRunPartialModel:false,counts,disclosures:initial,
    missingCapabilities:empty(),diagnostics
  });
  if (!obj(pack) || !obj(support) || !obj(pack.requires)) {
    fail('INVALID_PACK','$','Coverage pack and capabilities must be JSON objects');
    return invalid();
  }
  if (pack.hypothetical !== true || !id(pack.versionId)) {
    fail('INVALID_PACK','$','A public coverage pack requires a pinned version and hypothetical=true');
    return invalid();
  }
  const date = pack.baselineDate;
  if (typeof date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(date) ||
      !Number.isFinite(Date.parse(date+'T00:00:00Z')) ||
      new Date(date+'T00:00:00Z').toISOString().slice(0,10) !== date) {
    fail('INVALID_BASELINE_DATE','$.baselineDate','Expected a real ISO baseline date');
  }
  if (!Array.isArray(pack.mappings) || pack.mappings.length > 10000) {
    fail('INVALID_MAPPINGS','$.mappings','Expected at most 10,000 declared mappings');
    return invalid();
  }
  for (const kind of names) {
    const requested = pack.requires[kind], implemented = support[kind];
    if (!Array.isArray(requested) || requested.length > 1000 || !requested.every(id) ||
        !Array.isArray(implemented) || implemented.length > 1000 || !implemented.every(id)) {
      fail('INVALID_CAPABILITIES','$.'+kind,'Capability IDs must be bounded identifier arrays');
      return invalid();
    }
  }
  const modelValidation = validateBundle(bundle);
  if (!modelValidation.valid) {
    fail('INVALID_MODEL','$','The pinned model has invalid references or schema');
    return invalid();
  }
  const version = bundle.billVersions.find(v=>v.id===pack.versionId);
  if (!version) {fail('UNKNOWN_VERSION','$.versionId','No matching version exists');return invalid();}
  const provisions = bundle.provisions.filter(p=>p.versionId===pack.versionId);
  const provisionIds = new Set(provisions.map(p=>p.id));
  const mapped = new Set<string>();
  for (const [i, entry] of pack.mappings.entries()) {
    const path='$.mappings['+i+']';
    if (!obj(entry) || !id(entry.provisionId) || !['modeled','explanatory-only','ambiguous','unsupported'].includes(String(entry.mode))) {
      fail('INVALID_MAPPING',path,'Mapping requires scoped provision ID and supported coverage mode'); continue;
    }
    if (!provisionIds.has(entry.provisionId)) {fail('UNKNOWN_PROVISION',path+'.provisionId','Not in the pinned version');continue;}
    if (mapped.has(entry.provisionId)) {fail('DUPLICATE_MAPPING',path+'.provisionId','A provision cannot have two coverage statuses');continue;}
    mapped.add(entry.provisionId);
    counts[entry.mode as CoverageMode]++;
    if ((entry.mode==='ambiguous' || entry.mode==='unsupported') && (typeof entry.reason!=='string' || !entry.reason.trim())) {
      fail('MISSING_REASON',path+'.reason','Unresolved or unsupported provisions require an explanation');
    }
  }
  counts.unmapped = provisions.length-mapped.size;
  if (counts.unmapped) fail('UNMAPPED_PROVISIONS','$.mappings','Every relevant provision needs an explicit coverage declaration');
  const missing: {operations:string[];calendars:string[];domains:string[]} = {operations:[],calendars:[],domains:[]};
  for (const kind of names) {
    const offered = new Set(support[kind]);
    const declared = new Set(pack.requires[kind]);
    for (const required of declared) if (!offered.has(required)) missing[kind].push(required);
    if (declared.size !== pack.requires[kind].length) fail('DUPLICATE_CAPABILITY','$.requires.'+kind,'Duplicate required capability');
  }
  for (const rule of bundle.rules.filter(r=>r.versionId===pack.versionId)) {
    if (!pack.requires.operations.includes(rule.operation)) fail('UNDECLARED_RULE_OPERATION','$.requires.operations','Rule operation '+rule.operation+' is not declared');
  }
  const missingAny = names.some(kind=>missing[kind].length>0);
  if (missingAny) fail('UNSUPPORTED_CAPABILITY','$.requires','Required capability is unavailable: '+names.filter(k=>missing[k].length).join(', '));
  const status: Record<string,string> = {
    draft:'Draft proposal — not enacted',
    introduced:'Introduced proposal — not enacted',
    enacted:'Recorded as enacted — verify official version',
    repealed:'Recorded as repealed — not currently operative'
  };
  const partial = counts.unmapped>0 || counts.ambiguous>0 || counts.unsupported>0 || counts['explanatory-only']>0;
  const disclosures: PublicDisclosures = {
    legalStatus:status[version.status] ?? 'Legal status unverified',
    baseline:'Baseline model dated '+pack.baselineDate,
    scenario:'Hypothetical scenario — not a real filing',
    coverage:partial?'Partial coverage — '+counts.modeled+' modeled; '+(counts['explanatory-only']+counts.ambiguous+counts.unsupported+counts.unmapped)+' not fully modeled':'All '+counts.modeled+' explicitly mapped provisions modeled in declared scope'
  };
  return {
    completeWithinDeclaredScope:diagnostics.length===0&&!missingAny&&!partial&&counts.modeled>0,
    canRunPartialModel:diagnostics.length===0&&!missingAny&&counts.modeled>0,
    counts,disclosures,missingCapabilities:missing,diagnostics
  };
}
