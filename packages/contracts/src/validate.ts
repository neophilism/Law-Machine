import { SCHEMA_VERSION, type Diagnostic, type ValidationResult } from './model.ts';

/**
 * Validate parsed JSON at the public boundary. No code evaluation, type coercion,
 * implicit current-law defaults or speculative repair of source references.
 * This checks internal consistency, NOT authenticity of original source bytes:
 * hashing and authenticated publication are responsibilities of later units.
 */
export function validateBundle(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const fail = (code: string, path: string, message: string) => {
    if (diagnostics.length < 100) diagnostics.push({ code, path, message });
    else if (diagnostics.length === 100) diagnostics.push({ code: 'TOO_MANY_ERRORS', path: '$', message: 'Validation diagnostics truncated' });
  };
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 8192;
  const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
  const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const scoped = (version: string, id: string): string => JSON.stringify([version, id]);
  const limit = (value: unknown, path: string, min: number, max: number): value is unknown[] => {
    if (!Array.isArray(value) || value.length < min || value.length > max) {
      fail('INVALID_COLLECTION', path, 'Expected array length ' + min + ' to ' + max);
      return false;
    }
    return true;
  };
  if (!object(input)) return { valid: false, diagnostics: [{ code: 'INVALID_BUNDLE', path: '$', message: 'Expected JSON object' }] };
  if (input.schemaVersion !== SCHEMA_VERSION) fail('UNSUPPORTED_SCHEMA', '$.schemaVersion', 'Expected ' + SCHEMA_VERSION);
  const names = ['billVersions', 'provisions', 'actors', 'assumptions', 'rules', 'scenarios', 'releases', 'traces'] as const;
  type Collection = (typeof names)[number];
  for (const name of names) limit(input[name], '$.' + name, 0, 10000);
  if (diagnostics.length) return { valid: false, diagnostics };
  const data = input as Record<Collection, unknown[]>;
  const seen = new Map<Collection, Set<string>>(names.map(name => [name, new Set()]));
  function each(name: Collection, callback: (value: Record<string, unknown>, path: string) => void) {
    data[name].forEach((value, index) => {
      const path = '$.' + name + '[' + index + ']';
      if (!object(value)) { fail('INVALID_RECORD', path, 'Expected object'); return; }
      if (!identifier(value.id)) fail('INVALID_ID', path + '.id', 'Invalid record identifier');
      else {
        const key = (name === 'provisions' || name === 'rules') && identifier(value.versionId) ? scoped(value.versionId, value.id) : value.id;
        if (seen.get(name)!.has(key)) fail('DUPLICATE_ID', path + '.id', 'Identifier already used in this scope');
        else seen.get(name)!.add(key);
      }
      callback(value, path);
    });
  }
  const versions = new Map<string, Record<string, unknown>>();
  const provisions = new Map<string, Record<string, unknown>>();
  const provisionPaths = new Map<string, string>();
  const rules = new Map<string, Record<string, unknown>>();
  const scenarios = new Map<string, Record<string, unknown>>();
  const pendingRefs: { value: Record<string, unknown>; path: string; expectedVersion?: string; expectedProvision?: string }[] = [];
  const versionTargets: { value: unknown; path: string }[] = [];
  const expectedReferences: { name: Collection; value: unknown; path: string }[] = [];

  function source(value: unknown, path: string, expectedVersion?: string, expectedProvision?: string) {
    if (!object(value) || !identifier(value.versionId) || !identifier(value.provisionId) || !digest(value.sourceDigest) || !text(value.quote)) {
      fail('INVALID_SOURCE', path, 'Expected pinned version, provision, SHA-256 digest and exact quote');
      return;
    }
    pendingRefs.push({ value, path, ...(expectedVersion ? { expectedVersion } : {}), ...(expectedProvision ? { expectedProvision } : {}) });
  }
  each('billVersions', (v, path) => {
    if (!identifier(v.billId) || !text(v.version) || !text(v.jurisdiction) || !digest(v.sourceDigest) || !['draft','introduced','enacted','repealed'].includes(String(v.status))) {
      fail('INVALID_BILL_VERSION', path, 'Version needs bill ID, label, jurisdiction, status and source digest');
    }
    if (identifier(v.id)) versions.set(v.id, v);
  });
  each('provisions', (v, path) => {
    if (!identifier(v.versionId) || !text(v.citation) || !text(v.text)) fail('INVALID_PROVISION', path, 'Missing version, citation or provision text');
    versionTargets.push({ value: v.versionId, path: path + '.versionId' });
    if (identifier(v.id) && identifier(v.versionId)) {
      const key = scoped(v.versionId, v.id);
      if (!provisions.has(key)) { provisions.set(key, v); provisionPaths.set(key, path); }
    }
    source(v.source, path + '.source', identifier(v.versionId) ? v.versionId : undefined, identifier(v.id) ? v.id : undefined);
    if (v.parentId !== undefined && !identifier(v.parentId)) fail('INVALID_PARENT', path + '.parentId', 'Invalid parent identifier');
  });
  each('actors', (v, path) => {
    if (!text(v.name) || !['agency','court','person','organization','other'].includes(String(v.kind))) fail('INVALID_ACTOR', path, 'Invalid actor');
  });
  each('assumptions', (v, path) => {
    if (!text(v.description) || !['interpretation','empirical','hypothetical','unknown'].includes(String(v.classification)) || !object(v.value) || !['known','unknown'].includes(String(v.value.kind))) {
      fail('INVALID_ASSUMPTION', path, 'Invalid evidence classification or tagged value');
      return;
    }
    if (v.value.kind === 'unknown') {
      if (!text(v.value.reason)) fail('INVALID_UNKNOWN', path + '.value.reason', 'Unknown requires an explanation');
    } else {
      const known = v.value.value;
      if (object(known)) {
        const n = known.value;
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 ||
            !['day','businessDay','hour','usd','count','percent'].includes(String(known.unit)) ||
            (known.unit === 'percent' && n > 100) || (known.unit === 'count' && !Number.isSafeInteger(n))) {
          fail('INVALID_QUANTITY', path + '.value.value', 'Quantity requires a finite nonnegative value and valid unit');
        }
      } else if (!(text(known) || typeof known === 'boolean')) fail('INVALID_VALUE', path + '.value.value', 'Unsupported known value');
    }
  });
  each('rules', (v, path) => {
    versionTargets.push({ value: v.versionId, path: path + '.versionId' });
    if (!identifier(v.versionId) || !text(v.operation) || !['obligation','permission','prohibition','right','power'].includes(String(v.modal)) || !limit(v.sourceRefs, path + '.sourceRefs', 1, 100)) {
      fail('INVALID_RULE', path, 'Rule requires version, modal force, operation and provenance');
      return;
    }
    if (identifier(v.id)) rules.set(scoped(v.versionId, v.id), v);
    v.sourceRefs.forEach((r,i) => source(r, path + '.sourceRefs[' + i + ']', v.versionId as string));
  });
  each('scenarios', (v, path) => {
    versionTargets.push({ value: v.versionId, path: path + '.versionId' });
    if (!identifier(v.versionId) || !text(v.title) || v.hypothetical !== true || !limit(v.assumptions, path + '.assumptions', 0, 1000)) {
      fail('INVALID_SCENARIO', path, 'Scenario must have version, title and explicit hypothetical status');
      return;
    }
    if (identifier(v.id)) scenarios.set(v.id, v);
    const seenAssumptions = new Set<string>();
    v.assumptions.forEach((ref,i) => {
      if (!identifier(ref)) fail('INVALID_ID', path + '.assumptions[' + i + ']', 'Invalid assumption reference');
      else if (seenAssumptions.has(ref)) fail('DUPLICATE_REFERENCE', path + '.assumptions[' + i + ']', 'Duplicate assumption');
      else { seenAssumptions.add(ref); expectedReferences.push({ name:'assumptions', value:ref, path:path + '.assumptions[' + i + ']' }); }
    });
  });
  each('releases', (v,path) => {
    versionTargets.push({ value: v.billVersionId, path: path + '.billVersionId' });
    const date = v.createdAt;
    const iso = typeof date === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(date) &&
      Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 19) === date.slice(0, 19);
    if (v.schemaVersion !== SCHEMA_VERSION || !identifier(v.billVersionId) || !digest(v.sourceDigest) || !iso) fail('INVALID_RELEASE', path, 'Release needs compatible schema, pinned digest and valid UTC date');
  });
  each('traces', (v,path) => {
    if (!identifier(v.scenarioId) || !identifier(v.actorId) || !identifier(v.ruleId) || typeof v.tick !== 'number' || !Number.isSafeInteger(v.tick) || v.tick < 0 || !limit(v.sourceRefs, path + '.sourceRefs', 1, 100)) {
      fail('INVALID_TRACE', path, 'Event needs scenario, actor, rule, tick and provenance');
      return;
    }
    expectedReferences.push({ name:'scenarios', value:v.scenarioId, path:path + '.scenarioId' });
    expectedReferences.push({ name:'actors', value:v.actorId, path:path + '.actorId' });
    const scenario = scenarios.get(v.scenarioId);
    if (scenario && identifier(scenario.versionId)) {
      if (!rules.has(scoped(scenario.versionId,v.ruleId))) fail('UNKNOWN_RULE', path + '.ruleId', 'Rule must belong to the scenario version');
      v.sourceRefs.forEach((r,i) => source(r, path + '.sourceRefs[' + i + ']', scenario.versionId as string));
    } else v.sourceRefs.forEach((r,i) => source(r, path + '.sourceRefs[' + i + ']'));
  });

  for (const ref of versionTargets) if (!identifier(ref.value) || !versions.has(ref.value)) fail('UNKNOWN_VERSION', ref.path, 'Referenced bill version is not present');
  for (const ref of expectedReferences) if (!identifier(ref.value) || !seen.get(ref.name)!.has(ref.value)) fail('UNKNOWN_REFERENCE', ref.path, 'Referenced ' + ref.name + ' record is not present');
  for (const ref of pendingRefs) {
    const v = ref.value;
    const version = v.versionId as string;
    const provision = v.provisionId as string;
    if (ref.expectedVersion && version !== ref.expectedVersion) fail('CROSS_VERSION_SOURCE', ref.path + '.versionId', 'Reference crosses version scope');
    if (ref.expectedProvision && provision !== ref.expectedProvision) fail('WRONG_PROVISION', ref.path + '.provisionId', 'Source anchor points to another provision');
    const target = provisions.get(scoped(version,provision));
    if (!target) fail('CROSS_VERSION_SOURCE', ref.path + '.provisionId', 'Referenced provision does not exist in pinned version');
    else if (typeof target.text === 'string' && !target.text.includes(v.quote as string)) fail('QUOTE_MISMATCH', ref.path + '.quote', 'Exact quote does not occur in pinned provision');
    const versionRecord = versions.get(version);
    if (!versionRecord) fail('UNKNOWN_VERSION', ref.path + '.versionId', 'Source version not found');
    else if (v.sourceDigest !== versionRecord.sourceDigest) fail('SOURCE_DIGEST_MISMATCH', ref.path + '.sourceDigest', 'Source digest differs from pinned bill version');
  }
  for (const [key, provision] of provisions) {
    if (provision.parentId === undefined) continue;
    if (!identifier(provision.versionId) || !identifier(provision.parentId) || !provisions.has(scoped(provision.versionId,provision.parentId))) {
      fail('INVALID_PARENT', (provisionPaths.get(key) ?? '$.provisions') + '.parentId', 'Parent must exist in the same version');
    }
  }
  // Iterative parent-chain validation prevents stack exhaustion on maliciously deep input.
  const visited = new Set<string>();
  for (const key of provisions.keys()) {
    if (visited.has(key)) continue;
    const path: string[] = [];
    const inPath = new Set<string>();
    let cursor: string | undefined = key;
    while (cursor && !visited.has(cursor) && provisions.has(cursor)) {
      if (inPath.has(cursor)) {
        fail('PARENT_CYCLE', (provisionPaths.get(cursor) ?? '$.provisions') + '.parentId', 'Provision ancestry cannot contain a cycle');
        break;
      }
      inPath.add(cursor);
      path.push(cursor);
      const v: Record<string, unknown> = provisions.get(cursor)!;
      cursor = identifier(v.parentId) && identifier(v.versionId) ? scoped(v.versionId, v.parentId) : undefined;
    }
    for (const node of path) visited.add(node);
  }
  for (const [index, record] of data.releases.entries()) {
    if (!object(record) || !identifier(record.billVersionId)) continue;
    const version = versions.get(record.billVersionId);
    if (version && record.sourceDigest !== version.sourceDigest) fail('RELEASE_DIGEST_MISMATCH', '$.releases[' + index + '].sourceDigest', 'Release digest is not pinned to its bill version');
  }
  return { valid: diagnostics.length === 0, diagnostics };
}
