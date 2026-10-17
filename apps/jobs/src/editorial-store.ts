import { canonicalJSON } from '../../../packages/contracts/src/integrity.ts';

/**
 * LM-042 server-side editorial record boundary. AuthenticatedEditorialScope MUST
 * be constructed after server-side author authentication (LM-043), not from
 * client JSON. No public author routes are enabled by this module.
 */
export type AuthenticatedEditorialScope = {
  readonly orgId: string;
  readonly actorId: string;
  readonly serverVerified: true;
};
export type EditorialRecord = {
  readonly orgId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly contentDigest: string;
};
export type EditorialAuditEntry = {
  readonly orgId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly actorId: string;
  readonly action: 'created' | 'revised';
};
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
function freezeJSON<T>(input: T): T {
  if (input && typeof input === 'object') {
    for (const child of Object.values(input)) freezeJSON(child);
    Object.freeze(input);
  }
  return input;
}
export function validateEditorialWrite(
  scope: AuthenticatedEditorialScope, documentId: string,
  payload: unknown, digest: string
): string {
  if (!scope || scope.serverVerified !== true || !UUID.test(scope.orgId) ||
      !UUID.test(scope.actorId) || !UUID.test(documentId) ||
      typeof digest !== 'string' || !SHA.test(digest))
    throw Error('EDITORIAL_SCOPE_OR_DIGEST_INVALID');
  const canonical = canonicalJSON(payload);
  if (!canonical.startsWith('{') || canonical.length > 2000000)
    throw Error('EDITORIAL_PAYLOAD_INVALID');
  return canonical;
}

/** Offline fixture mode; never treat this Map as persistent or production storage. */
export class FixtureEditorialStore {
  private readonly documents = new Map<string, EditorialRecord>();
  private readonly history: EditorialAuditEntry[] = [];
  private key(org: string, doc: string): string { return org + '/' + doc; }
  create(scope: AuthenticatedEditorialScope, documentId: string, payload: unknown, digest: string): EditorialRecord {
    const bytes = validateEditorialWrite(scope, documentId, payload, digest);
    const key = this.key(scope.orgId, documentId);
    if (this.documents.has(key)) throw Error('EDITORIAL_ALREADY_EXISTS');
    const record: EditorialRecord = {
      orgId: scope.orgId, documentId, revision: 1,
      payload: freezeJSON(JSON.parse(bytes) as Record<string, unknown>), contentDigest: digest
    };
    this.documents.set(key, Object.freeze(record));
    this.history.push({orgId:scope.orgId,documentId,revision:1,actorId:scope.actorId,action:'created'});
    return record;
  }
  update(scope: AuthenticatedEditorialScope, documentId: string, expectedRevision: number,
         payload: unknown, digest: string): EditorialRecord {
    const bytes = validateEditorialWrite(scope, documentId, payload, digest);
    const key = this.key(scope.orgId, documentId);
    const previous = this.documents.get(key);
    if (!previous || !Number.isSafeInteger(expectedRevision) ||
        expectedRevision !== previous.revision) throw Error('LM_STALE_REVISION');
    const record: EditorialRecord = {
      orgId:scope.orgId,documentId,revision:previous.revision+1,
      payload:freezeJSON(JSON.parse(bytes) as Record<string,unknown>),contentDigest:digest
    };
    // Metadata write and audit are synchronous and all-or-nothing in fixture mode.
    this.documents.set(key,Object.freeze(record));
    this.history.push({orgId:scope.orgId,documentId,revision:record.revision,
      actorId:scope.actorId,action:'revised'});
    return record;
  }
  read(scope: AuthenticatedEditorialScope, documentId: string): EditorialRecord | null {
    if (!scope || scope.serverVerified !== true || !UUID.test(scope.orgId) ||
        !UUID.test(scope.actorId) || !UUID.test(documentId)) throw Error('EDITORIAL_SCOPE_INVALID');
    const found = this.documents.get(this.key(scope.orgId,documentId));
    if (!found) return null;
    return {...found,payload:JSON.parse(canonicalJSON(found.payload)) as Record<string,unknown>};
  }
  audit(scope: AuthenticatedEditorialScope): readonly EditorialAuditEntry[] {
    if (!scope || scope.serverVerified !== true || !UUID.test(scope.orgId) ||
        !UUID.test(scope.actorId)) throw Error('EDITORIAL_SCOPE_INVALID');
    return this.history.filter(e=>e.orgId===scope.orgId).map(e=>({...e}));
  }
}

export interface PgQueryResult<Row> { readonly rows: readonly Row[] }
export interface PgTransactionClient {
  query<Row = Record<string,unknown>>(sql: string, parameters?: readonly unknown[]): Promise<PgQueryResult<Row>>;
  release(): void;
}
export interface PgConnectionPool { connect(): Promise<PgTransactionClient> }

/**
 * Real PostgreSQL transaction boundary; no external driver is imported here.
 * Callers supply a compatible pooled client and a separately verified actor.
 * SET LOCAL isolates RLS scope to this transaction, including after failures.
 */
export class PostgresEditorialStore {
  constructor(private readonly pool: PgConnectionPool) {}
  private async scoped<T>(scope: AuthenticatedEditorialScope,
    execute: (client: PgTransactionClient) => Promise<T>): Promise<T> {
    if (!scope || scope.serverVerified !== true || !UUID.test(scope.orgId) ||
        !UUID.test(scope.actorId)) throw Error('EDITORIAL_SCOPE_INVALID');
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query('BEGIN'); began = true;
      await client.query("SELECT set_config('app.organization_id',$1,true)", [scope.orgId]);
      await client.query("SELECT set_config('app.actor_id',$1,true)", [scope.actorId]);
      const result = await execute(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (began) {
        try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
      }
      throw error;
    } finally {
      client.release();
    }
  }
  async create(scope: AuthenticatedEditorialScope, documentId: string, payload: unknown, digest: string): Promise<number> {
    const canonical = validateEditorialWrite(scope,documentId,payload,digest);
    return this.scoped(scope,async client=>{
      const out = await client.query<{revision:string|number}>(
        'SELECT lm_create_document($1,$2,$3,$4::jsonb,$5) AS revision',
        [scope.orgId,documentId,scope.actorId,canonical,digest]
      );
      const revision=Number(out.rows[0]?.revision);
      if (revision!==1) throw Error('EDITORIAL_UNEXPECTED_RESULT');
      return revision;
    });
  }
  async update(scope: AuthenticatedEditorialScope, documentId: string, expectedRevision: number,
    payload: unknown, digest: string): Promise<number> {
    validateEditorialWrite(scope,documentId,payload,digest);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw Error('EDITORIAL_REVISION_INVALID');
    return this.scoped(scope,async client=>{
      const out=await client.query<{revision:string|number}>(
        'SELECT lm_update_document($1,$2,$3,$4,$5::jsonb,$6) AS revision',
        [scope.orgId,documentId,scope.actorId,expectedRevision,canonical,digest]
      );
      const revision=Number(out.rows[0]?.revision);
      if (revision!==expectedRevision+1) throw Error('EDITORIAL_UNEXPECTED_RESULT');
      return revision;
    });
  }
}
