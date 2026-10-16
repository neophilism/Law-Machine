/**
 * LM-003 public, provider-free model primitives. Identifiers are scoped to an immutable bill version.
 * No law is inferred from these records and unknown is not treated as false.
 */
export const SCHEMA_VERSION = '1.0.0' as const;
export type UnknownValue = { readonly kind: 'unknown'; readonly reason: string };
export type KnownValue<T> = { readonly kind: 'known'; readonly value: T };
export type Value<T> = KnownValue<T> | UnknownValue;
export type Quantity = { readonly value: number; readonly unit: 'day' | 'businessDay' | 'hour' | 'usd' | 'count' | 'percent' };
export type SourceRef = { readonly versionId: string; readonly provisionId: string; readonly sourceDigest: string; readonly quote: string };
export type BillVersion = { readonly id: string; readonly billId: string; readonly version: string; readonly status: 'draft' | 'introduced' | 'enacted' | 'repealed'; readonly jurisdiction: string; readonly sourceDigest: string };
export type Provision = { readonly id: string; readonly versionId: string; readonly citation: string; readonly text: string; readonly parentId?: string; readonly source: SourceRef };
export type Actor = { readonly id: string; readonly name: string; readonly kind: 'agency' | 'court' | 'person' | 'organization' | 'other' };
export type Assumption = { readonly id: string; readonly description: string; readonly classification: 'interpretation' | 'empirical' | 'hypothetical' | 'unknown'; readonly value: Value<string | boolean | Quantity> };
export type Rule = { readonly id: string; readonly versionId: string; readonly sourceRefs: readonly SourceRef[]; readonly modal: 'obligation' | 'permission' | 'prohibition' | 'right' | 'power'; readonly operation: string };
export type Scenario = { readonly id: string; readonly versionId: string; readonly title: string; readonly hypothetical: true; readonly assumptions: readonly string[] };
export type ModelRelease = { readonly id: string; readonly schemaVersion: typeof SCHEMA_VERSION; readonly billVersionId: string; readonly sourceDigest: string; readonly createdAt: string };
export type TraceEvent = { readonly id: string; readonly scenarioId: string; readonly tick: number; readonly actorId: string; readonly ruleId: string; readonly sourceRefs: readonly SourceRef[] };
export type ModelBundle = { readonly schemaVersion: typeof SCHEMA_VERSION; readonly billVersions: readonly BillVersion[]; readonly provisions: readonly Provision[]; readonly actors: readonly Actor[]; readonly assumptions: readonly Assumption[]; readonly rules: readonly Rule[]; readonly scenarios: readonly Scenario[]; readonly releases: readonly ModelRelease[]; readonly traces: readonly TraceEvent[] };
export type Diagnostic = { readonly code: string; readonly path: string; readonly message: string };
export type ValidationResult = { readonly valid: boolean; readonly diagnostics: readonly Diagnostic[] };
