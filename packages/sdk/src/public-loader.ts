import { SCHEMA_VERSION, type ModelBundle, type ModelRelease, type Provision } from '../../contracts/src/model.ts';
import { validateBundle } from '../../contracts/src/validate.ts';
import { canonicalJSON, verifyRelease, type ReleaseManifest } from '../../contracts/src/integrity.ts';

/** No rules or simulation engine is implemented at this SDK milestone. */
export const SDK_ENGINE_VERSION = '0.0.0' as const;
export type SdkErrorCode =
  | 'INCOMPATIBLE_SCHEMA' | 'INCOMPATIBLE_ENGINE' | 'INVALID_MODEL'
  | 'INVALID_MANIFEST' | 'RELEASE_NOT_FOUND' | 'RELEASE_MISMATCH'
  | 'INTEGRITY_FAILED' | 'NOT_FOUND' | 'AMBIGUOUS_CITATION' | 'UNSUPPORTED_FEATURE';
export type SdkError = { readonly code: SdkErrorCode; readonly message: string };
export type SdkResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: SdkError };
export type LoadPublicReleaseInput = {
  readonly bundle: unknown;
  readonly releaseId: string;
  readonly manifest: ReleaseManifest;
  /** Independently trusted expected digest; NOT computed from the supplied manifest. */
  readonly expectedManifestDigest: string;
  readonly originalSourceBytes: Uint8Array;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly requestedEngineVersion: string;
};
export interface PublicReleaseSession {
  readonly release: ModelRelease;
  readonly manifestDigest: string;
  readonly engineVersion: typeof SDK_ENGINE_VERSION;
  /** Resolve by stable ID only in the session's pinned immutable bill version. */
  getProvision(id: string): SdkResult<Provision>;
  /** Do not guess when a displayed citation is ambiguous. */
  findProvisionByCitation(citation: string): SdkResult<Provision>;
  listProvisions(): readonly Provision[];
  /** Future simulation capability intentionally unavailable. */
  simulate(scenarioId: string): SdkResult<never>;
}

function error<T>(code: SdkErrorCode, message: string): SdkResult<T> { return {ok:false,error:{code,message}}; }
function immutable<T>(value: T): T {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    for (const child of Object.values(item)) if (child && typeof child === 'object') stack.push(child);
    Object.freeze(item);
  }
  return value;
}

/** Public loading never fetches networks, signs documents or accesses private authoring data. */
export async function loadPublicRelease(input: LoadPublicReleaseInput): Promise<SdkResult<PublicReleaseSession>> {
  if (input.requestedEngineVersion !== SDK_ENGINE_VERSION) {
    return error('INCOMPATIBLE_ENGINE', 'This SDK cannot execute engine version ' + input.requestedEngineVersion);
  }
  if (!input.bundle || typeof input.bundle !== 'object' || (input.bundle as {schemaVersion?:unknown}).schemaVersion !== SCHEMA_VERSION) {
    return error('INCOMPATIBLE_SCHEMA', 'Unsupported model schema version');
  }
  const validation = validateBundle(input.bundle);
  if (!validation.valid) return error('INVALID_MODEL', 'Model data did not pass contract validation: ' + validation.diagnostics[0]?.code);
  let bundle: ModelBundle;
  try { bundle = immutable(JSON.parse(canonicalJSON(input.bundle)) as ModelBundle); }
  catch { return error('INVALID_MODEL','Model data is not canonical JSON'); }
  if (!input.manifest || typeof input.manifest.releaseId !== 'string') return error('INVALID_MANIFEST','Manifest is missing');
  const release = bundle.releases.find(value => value.id === input.releaseId);
  if (!release) return error('RELEASE_NOT_FOUND','Requested pinned model release is absent');
  if (input.manifest.releaseId !== release.id || input.manifest.schemaVersion !== release.schemaVersion ||
      input.manifest.sourceDigest !== release.sourceDigest) {
    return error('RELEASE_MISMATCH','Manifest does not refer to the selected model release');
  }
  const integrity = await verifyRelease(input.manifest,input.expectedManifestDigest,input.originalSourceBytes,input.assets);
  if (!integrity.valid || !integrity.manifestDigest) {
    return error('INTEGRITY_FAILED','Manifest or source bytes failed integrity verification: ' + integrity.diagnostics[0]?.code);
  }
  const provisions = immutable(bundle.provisions.filter(p => p.versionId === release.billVersionId));
  const byId = new Map(provisions.map(p=>[p.id,p]));
  const byCitation = new Map<string, Provision[]>();
  for (const p of provisions) {
    const matches=byCitation.get(p.citation) ?? [];
    matches.push(p);byCitation.set(p.citation,matches);
  }
  const session: PublicReleaseSession = Object.freeze({
    release,
    manifestDigest:integrity.manifestDigest,
    engineVersion:SDK_ENGINE_VERSION,
    getProvision(id:string):SdkResult<Provision> {
      const p=byId.get(id);
      return p ? {ok:true,value:p} : error('NOT_FOUND','Provision is absent from this pinned version');
    },
    findProvisionByCitation(citation:string):SdkResult<Provision> {
      const options=byCitation.get(citation) ?? [];
      if (!options.length) return error('NOT_FOUND','Citation not found in this pinned version');
      if (options.length !== 1) return error('AMBIGUOUS_CITATION','Several provisions have this displayed citation');
      return {ok:true,value:options[0]!};
    },
    listProvisions():readonly Provision[] {return provisions;},
    simulate(_scenarioId:string):SdkResult<never> {
      return error('UNSUPPORTED_FEATURE','Simulation is unavailable until the rule interpreter and scheduler milestones');
    }
  });
  return {ok:true,value:session};
}
