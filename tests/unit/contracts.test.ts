import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateBundle, SCHEMA_VERSION } from '../../packages/contracts/src/index.ts';

const file = new URL('../../packages/contracts/fixtures/v1-hypothetical.json', import.meta.url);
const fixture = (): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
const records = (f: Record<string, unknown>, key: string): Record<string, unknown>[] => f[key] as Record<string, unknown>[];
const diagnosticCodes = (f: unknown): string[] => validateBundle(f).diagnostics.map(d => d.code);

/** This retained on-disk public JSON fixture is part of the v1 compatibility promise. */
describe('LM-003 provider-free public model contract', () => {
  it('accepts retained v1 fixture and exact JSON roundtrip', () => {
    const f = fixture();
    expect(f.schemaVersion).toBe(SCHEMA_VERSION);
    expect(validateBundle(f)).toEqual({ valid:true, diagnostics:[] });
    expect(validateBundle(JSON.parse(JSON.stringify(f)))).toEqual({ valid:true, diagnostics:[] });
  });
  it('supports same provision and rule ID in independent version scopes', () => {
    expect(records(fixture(),'provisions').map(p=>p.id)).toEqual(['p1','p1']);
    expect(validateBundle(fixture()).valid).toBe(true);
  });
  it('rejects incompatible schema, including forward version', () => {
    const f=fixture(); f.schemaVersion='2.0.0';
    expect(diagnosticCodes(f)).toContain('UNSUPPORTED_SCHEMA');
  });
  it('rejects duplicate IDs within a version scope', () => {
    const f=fixture(); const p=records(f,'provisions'); p.push({...p[0]!});
    expect(diagnosticCodes(f)).toContain('DUPLICATE_ID');
  });
  it('rejects a moved, changed, or unverifiable anchored quote', () => {
    const f=fixture();
    const r=records(f,'rules')[0]!.sourceRefs as Record<string, unknown>[];
    r[0]!.quote='a sentence absent from the pinned provision';
    expect(diagnosticCodes(f)).toContain('QUOTE_MISMATCH');
    r[0]!.quote='Toy requirement'; r[0]!.sourceDigest='b'.repeat(64);
    expect(diagnosticCodes(f)).toContain('SOURCE_DIGEST_MISMATCH');
    r[0]!.sourceDigest='a'.repeat(64); r[0]!.versionId='v2';
    expect(diagnosticCodes(f)).toContain('CROSS_VERSION_SOURCE');
  });
  it('fails missing versions, unknown assumptions and cross-version rules in traces', () => {
    const f=fixture(); records(f,'scenarios')[0]!.versionId='v3';
    expect(diagnosticCodes(f)).toContain('UNKNOWN_VERSION');
    const g=fixture(); records(g,'scenarios')[0]!.assumptions=['absent'];
    expect(diagnosticCodes(g)).toContain('UNKNOWN_REFERENCE');
    const h=fixture(); records(h,'rules').splice(0,1);
    expect(diagnosticCodes(h)).toContain('UNKNOWN_RULE');
  });
  it('rejects unpinned release digest and malformed time', () => {
    const f=fixture(); records(f,'releases')[0]!.sourceDigest='b'.repeat(64);
    expect(diagnosticCodes(f)).toContain('RELEASE_DIGEST_MISMATCH');
    const g=fixture(); records(g,'releases')[0]!.createdAt='2026-02-30T00:00:00Z';
    expect(diagnosticCodes(g)).toContain('INVALID_RELEASE');
  });
  it('rejects invalid money, count, or percent quantity', () => {
    for (const [value,unit] of [[Infinity,'usd'],[-1,'day'],[1.5,'count'],[101,'percent'],[1,'made-up']] as const) {
      const f=fixture(); records(f,'assumptions')[0]!.value={kind:'known',value:{value,unit}};
      expect(diagnosticCodes(f)).toContain('INVALID_QUANTITY');
    }
  });
  it('detects missing parents and cycles without recursion', () => {
    const f=fixture(); const p=records(f,'provisions');
    p[0]!.parentId='unlisted';
    expect(diagnosticCodes(f)).toContain('INVALID_PARENT');
    p[0]!.parentId='p2';
    p.push({ ...p[0]!, id:'p2', parentId:'p1', source:{ versionId:'v1',provisionId:'p2',sourceDigest:'a'.repeat(64),quote:'Toy requirement'} });
    expect(diagnosticCodes(f)).toContain('PARENT_CYCLE');
  });
  it('rejects unsafe or oversized record fields and collections', () => {
    expect(diagnosticCodes(null)).toContain('INVALID_BUNDLE');
    const f=fixture(); f.traces=new Array(10001).fill(null);
    expect(diagnosticCodes(f)).toContain('INVALID_COLLECTION');
    const g=fixture(); records(g,'rules')[0]!.sourceRefs=[];
    expect(diagnosticCodes(g)).toContain('INVALID_COLLECTION');
    const h=fixture(); records(h,'assumptions')[0]!.value={kind:'known',value:null};
    expect(diagnosticCodes(h)).toContain('INVALID_VALUE');
  });
  it('does not invent knowledge: tagged unknown stays unknown', () => {
    const f=fixture();
    expect((records(f,'assumptions')[0]!.value as Record<string, unknown>).kind).toBe('unknown');
    expect(validateBundle(f).valid).toBe(true);
  });
  it('reports stable, bounded diagnostics and compatible explanatory fields', () => {
    const f=fixture(); records(f,'provisions')[0]!.parentId='missing';
    expect(validateBundle(f)).toEqual(validateBundle(f));
    const g=fixture(); g.editorialNote='Clearly explanatory, not executable';
    expect(validateBundle(g).valid).toBe(true);
  });
  it('property: hypothetical unknown reasons remain valid plain JSON', () => {
    fc.assert(fc.property(fc.string({minLength:1,maxLength:120}), reason => {
      const f=fixture(); records(f,'assumptions')[0]!.value={kind:'unknown',reason};
      return validateBundle(f).valid;
    }), { numRuns:100 });
  });
});
