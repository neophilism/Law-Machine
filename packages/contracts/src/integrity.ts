import { SCHEMA_VERSION } from './model.ts';

/** LM-004. Content identity is SHA-256 over raw bytes or canonical UTF-8 JSON. */
export type ReleaseAsset = { readonly path: string; readonly digest: string };
export type ReleaseManifest = {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly releaseId: string;
  readonly sourceDigest: string;
  readonly assets: readonly ReleaseAsset[];
};
export type IntegrityDiagnostic = { readonly code: string; readonly path: string };
export type Verification = { readonly valid: boolean; readonly manifestDigest: string | null; readonly diagnostics: readonly IntegrityDiagnostic[] };

/**
 * Project canonical JSON v1: pure JSON values, UTF-16 lexicographic object keys,
 * standard JSON number and string serialization, no whitespace or skipped
 * fields. All fields, including timestamps, participate in content identity.
 * Unsupported JS types, cycles, excessive depth and size fail closed.
 */
export function canonicalJSON(input: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number): string => {
    if (++nodes > 100000 || depth > 64) throw new TypeError('CANONICAL_LIMIT');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      if (typeof value === 'string' && value.length > 1048576) throw new TypeError('CANONICAL_STRING_LIMIT');
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('CANONICAL_NUMBER_INVALID');
      return JSON.stringify(value);
    }
    if (typeof value !== 'object') throw new TypeError('CANONICAL_TYPE_UNSUPPORTED');
    if (ancestors.has(value)) throw new TypeError('CANONICAL_CYCLE');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError('CANONICAL_OBJECT_INVALID');
    }
    ancestors.add(value);
    let serialized: string;
    if (Array.isArray(value)) {
      if (value.length > 100000) throw new TypeError('CANONICAL_LIMIT');
      serialized = '[' + Array.from(value, item => visit(item, depth + 1)).join(',') + ']';
    } else {
      const fields = Object.keys(value as Record<string,unknown>).sort();
      if (fields.length > 100000) throw new TypeError('CANONICAL_LIMIT');
      serialized = '{' + fields.map(key => JSON.stringify(key) + ':' + visit((value as Record<string,unknown>)[key], depth + 1)).join(',') + '}';
    }
    ancestors.delete(value);
    return serialized;
  };
  return visit(input, 0);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
export async function canonicalDigest(value: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalJSON(value)));
}

export async function contentAddress(bytes: Uint8Array, extension: string): Promise<string> {
  if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new TypeError('INVALID_EXTENSION');
  return 'assets/' + await sha256Hex(bytes) + '.' + extension;
}

/**
 * Verify the trusted manifest digest and every referenced original byte array.
 * The caller supplies an independently trusted root: recomputing a manifest
 * hash alone is NOT a signature or authentication of a publisher.
 */
export async function verifyRelease(
  manifest: ReleaseManifest,
  expectedManifestDigest: string,
  originalSourceBytes: Uint8Array,
  assets: ReadonlyMap<string, Uint8Array>
): Promise<Verification> {
  const diagnostics: IntegrityDiagnostic[] = [];
  const fail = (code: string, path: string) => diagnostics.push({code,path});
  const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION || typeof manifest.releaseId !== 'string' || !manifest.releaseId ||
      !hex(manifest.sourceDigest) || !Array.isArray(manifest.assets) || manifest.assets.length > 10000 || !hex(expectedManifestDigest)) {
    return { valid:false, manifestDigest:null, diagnostics:[{code:'INVALID_MANIFEST',path:'$'}] };
  }
  let manifestDigest: string | null = null;
  try { manifestDigest = await canonicalDigest(manifest); }
  catch { return { valid:false, manifestDigest:null, diagnostics:[{code:'INVALID_CANONICAL_MANIFEST',path:'$'}] }; }
  if (manifestDigest !== expectedManifestDigest) fail('MANIFEST_DIGEST_MISMATCH','$');
  if (!(originalSourceBytes instanceof Uint8Array)) fail('MISSING_SOURCE_BYTES','$.sourceDigest');
  else if ((await sha256Hex(originalSourceBytes)) !== manifest.sourceDigest) fail('SOURCE_DIGEST_MISMATCH','$.sourceDigest');
  const names = new Set<string>();
  for (const [index, item] of manifest.assets.entries()) {
    const path = '$.assets[' + index + ']';
    if (!item || typeof item.path !== 'string' || !hex(item.digest) ||
        !/^assets\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(item.path) || !item.path.includes(item.digest)) {
      fail('INVALID_ASSET_RECORD',path);continue;
    }
    if (names.has(item.path)) { fail('DUPLICATE_ASSET',path); continue; }
    names.add(item.path);
    const bytes = assets.get(item.path);
    if (!(bytes instanceof Uint8Array)) fail('MISSING_ASSET',path);
    else if (await sha256Hex(bytes) !== item.digest) fail('ASSET_DIGEST_MISMATCH',path);
  }
  for (const path of assets.keys()) if (!names.has(path)) fail('UNDECLARED_ASSET',path);
  return {valid:diagnostics.length === 0,manifestDigest,diagnostics};
}
