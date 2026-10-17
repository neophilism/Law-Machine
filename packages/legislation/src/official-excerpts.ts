import { sha256Hex } from '../../contracts/src/integrity.ts';

/**
 * Curated excerpts are not original official document bytes or proof of
 * publisher authentication. They are pinned, inspectable comparison evidence.
 * Full original byte acquisition and release verification are separate steps.
 */
export type OfficialExcerptSnapshot = {
  readonly kind: 'curated-official-excerpt';
  readonly id: string;
  readonly sourceUrl: string;
  readonly citation: string;
  readonly publisher: 'Office of the Federal Register' | 'Office of the Law Revision Counsel';
  readonly editionAsOf: string;
  readonly jurisdiction: string;
  readonly agency: string;
  readonly excerpt: string;
  readonly excerptSha256: string;
  readonly fullOriginalBytesAttached: false;
};
export type ExcerptDiagnostic = { readonly code: string; readonly index: number };
export type ExcerptCheck = {
  readonly excerptIntegrityValid: boolean;
  readonly publisherAuthenticated: false;
  readonly fullOriginalBytesVerified: false;
  readonly diagnostics: readonly ExcerptDiagnostic[];
};
const isDate = (s: unknown): s is string => typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0,10) === s;

export async function verifyOfficialExcerptSnapshots(input: unknown): Promise<ExcerptCheck> {
  const diagnostics: ExcerptDiagnostic[] = [];
  const add = (code: string, index: number) => diagnostics.push({ code, index });
  if (!Array.isArray(input) || input.length < 1 || input.length > 32)
    return {excerptIntegrityValid:false,publisherAuthenticated:false,fullOriginalBytesVerified:false,diagnostics:[{code:'INVALID_EXCERPT_COLLECTION',index:-1}]};
  const seen = new Set<string>();
  for (const [i, record] of input.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {add('INVALID_EXCERPT',i);continue;}
    const s = record as Record<string,unknown>;
    if (s.kind !== 'curated-official-excerpt' || s.fullOriginalBytesAttached !== false ||
      typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,100}$/.test(s.id) ||
      typeof s.citation !== 'string' || !s.citation || s.citation.length > 200 ||
      typeof s.jurisdiction !== 'string' || !s.jurisdiction || s.jurisdiction.length > 100 ||
      typeof s.agency !== 'string' || !s.agency || s.agency.length > 100 ||
      !isDate(s.editionAsOf) ||
      typeof s.excerpt !== 'string' || !s.excerpt.trim() || s.excerpt.length > 2048 ||
      typeof s.excerptSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(s.excerptSha256)) {
      add('INVALID_EXCERPT',i);continue;
    }
    if (seen.has(s.id)) add('DUPLICATE_EXCERPT',i);
    seen.add(s.id);
    try {
      const url = new URL(s.sourceUrl as string);
      const allowed = (url.hostname === 'www.ecfr.gov' && s.publisher === 'Office of the Federal Register') ||
        (url.hostname === 'uscode.house.gov' && s.publisher === 'Office of the Law Revision Counsel');
      if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.port)
        add('UNTRUSTED_SOURCE_LOCATOR',i);
    } catch { add('UNTRUSTED_SOURCE_LOCATOR',i); }
    if (await sha256Hex(new TextEncoder().encode(s.excerpt)) !== s.excerptSha256)
      add('EXCERPT_DIGEST_MISMATCH',i);
  }
  return { excerptIntegrityValid:diagnostics.length===0, publisherAuthenticated:false,
    fullOriginalBytesVerified:false,diagnostics };
}
