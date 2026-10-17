import { canonicalJSON } from '../../../packages/contracts/src/integrity.ts';
import type { PgConnectionPool, PgTransactionClient } from './editorial-store.ts';

/**
 * LM-046: narrow, server-only PostgreSQL adapter for migration 0004.
 * The caller must supply a separately authenticated/authorized, least-privileged
 * worker connection and a tenant selected by trusted server configuration.
 * A TypeScript literal serverVerified:true is NOT proof of identity.
 * No HTTP author route or production worker is enabled here.
 */
export type TrustedWorkerTenant = { readonly orgId: string; readonly serverVerified: true };
export type DurableJobKind = 'source-import' | 'model-compile' | 'release-validate';
export type EnqueueDurableJob = {
  readonly id: string;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly kind: DurableJobKind;
  readonly maxAttempts: number;
};
export type DurableLease = {
  readonly orgId: string;
  readonly id: string;
  readonly documentId: string;
  readonly workerId: string;
  readonly kind: DurableJobKind;
  readonly fence: bigint;
  readonly attempts: number;
  readonly leaseUntil: string;
  readonly checkpoint: Readonly<Record<string, unknown>>;
};

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const WORKER = /^[A-Za-z0-9._:-]{1,128}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ERROR = /^[A-Z][A-Z0-9_]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_FENCE = 9223372036854775807n;
const KINDS: readonly DurableJobKind[] = ['source-import', 'model-compile', 'release-validate'];
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function worker(value: unknown): value is string {
  return typeof value === 'string' && WORKER.test(value);
}
function leaseSeconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 60;
}
function requireFence(value: unknown): asserts value is bigint {
  if (typeof value !== 'bigint' || value < 1n || value > MAX_FENCE)
    throw Error('JOB_FENCE_INVALID');
}
function parseFence(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value))
    throw Error('JOB_LEASE_ROW_INVALID');
  const fence = BigInt(value);
  if (fence > MAX_FENCE) throw Error('JOB_LEASE_ROW_INVALID');
  return fence;
}
function canonicalCheckpoint(value: unknown): string {
  const canonical = canonicalJSON(value);
  if (!canonical.startsWith('{') ||
      new TextEncoder().encode(canonical).byteLength > 16384)
    throw Error('JOB_CHECKPOINT_INVALID');
  return canonical;
}

/** Transaction-local RLS scope never survives commit, rollback or connection reuse. */
export class PostgresLeaseClient {
  constructor(
    private readonly pool: PgConnectionPool,
    private readonly scope: TrustedWorkerTenant
  ) {
    if (!scope || scope.serverVerified !== true || !uuid(scope.orgId))
      throw Error('JOB_WORKER_SCOPE_INVALID');
  }
  private async scoped<T>(perform: (client: PgTransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query('BEGIN');
      began = true;
      await client.query("SELECT set_config('app.organization_id',$1,true)", [this.scope.orgId]);
      const result = await perform(client);
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
  async enqueue(job: EnqueueDurableJob): Promise<string> {
    if (!job || !uuid(job.id) || !uuid(job.documentId) ||
        typeof job.idempotencyKey !== 'string' || !IDEMPOTENCY.test(job.idempotencyKey) ||
        !KINDS.includes(job.kind) || !Number.isSafeInteger(job.maxAttempts) ||
        job.maxAttempts < 1 || job.maxAttempts > 10)
      throw Error('JOB_ENQUEUE_INVALID');
    return this.scoped(async client => {
      const out = await client.query<{job_id: string}>(
        'SELECT lm_enqueue_job($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::integer)::text AS job_id',
        [this.scope.orgId,job.id,job.documentId,job.kind,job.idempotencyKey,job.maxAttempts]
      );
      if (!uuid(out.rows[0]?.job_id)) throw Error('JOB_ENQUEUE_ROW_INVALID');
      return out.rows[0].job_id;
    });
  }
  async claim(workerId: string, seconds: number): Promise<DurableLease | null> {
    if (!worker(workerId) || !leaseSeconds(seconds)) throw Error('JOB_CLAIM_INVALID');
    return this.scoped(async client => {
      const out = await client.query<{
        leased_id: unknown; leased_document_id: unknown; leased_kind: unknown;
        leased_fence: unknown; leased_attempts: unknown; lease_until: unknown;
        leased_checkpoint: unknown;
      }>(
        'SELECT leased_id,leased_document_id,leased_kind,leased_fence::text,leased_attempts,leased_until::text AS lease_until,leased_checkpoint FROM lm_claim_job($1::uuid,$2::text,$3::integer)',
        [this.scope.orgId,workerId,seconds]
      );
      const row = out.rows[0];
      if (!row) return null;
      if (!uuid(row.leased_id) || !uuid(row.leased_document_id) ||
          !KINDS.includes(row.leased_kind as DurableJobKind) ||
          !Number.isSafeInteger(row.leased_attempts) ||
          (row.leased_attempts as number) < 1 ||
          typeof row.lease_until !== 'string' || !row.lease_until)
        throw Error('JOB_LEASE_ROW_INVALID');
      const fence = parseFence(row.leased_fence);
      let checkpoint: Record<string, unknown>;
      try {
        checkpoint = JSON.parse(canonicalCheckpoint(row.leased_checkpoint)) as Record<string, unknown>;
      } catch {
        throw Error('JOB_LEASE_ROW_INVALID');
      }
      return {
        orgId: this.scope.orgId, id: row.leased_id, documentId: row.leased_document_id,
        workerId, kind: row.leased_kind as DurableJobKind, fence,
        attempts: row.leased_attempts as number, leaseUntil: row.lease_until,
        checkpoint
      };
    });
  }
  private async transition(sql: string, params: readonly unknown[]): Promise<boolean> {
    return this.scoped(async client => {
      const out = await client.query<{accepted: boolean}>(sql, params);
      return out.rows[0]?.accepted === true;
    });
  }
  async heartbeat(lease: DurableLease, seconds: number): Promise<boolean> {
    this.validateLease(lease);
    if (!leaseSeconds(seconds)) throw Error('JOB_HEARTBEAT_INVALID');
    return this.transition(
      'SELECT lm_job_heartbeat($1::uuid,$2::uuid,$3::text,$4::bigint,$5::integer) AS accepted',
      [this.scope.orgId,lease.id,lease.workerId,lease.fence.toString(),seconds]
    );
  }
  async checkpoint(lease: DurableLease, value: unknown): Promise<boolean> {
    this.validateLease(lease);
    const canonical = canonicalCheckpoint(value);
    return this.transition(
      'SELECT lm_job_checkpoint($1::uuid,$2::uuid,$3::text,$4::bigint,$5::jsonb) AS accepted',
      [this.scope.orgId,lease.id,lease.workerId,lease.fence.toString(),canonical]
    );
  }
  async complete(lease: DurableLease, resultDigest: string): Promise<boolean> {
    this.validateLease(lease);
    if (typeof resultDigest !== 'string' || !DIGEST.test(resultDigest))
      throw Error('JOB_DIGEST_INVALID');
    return this.transition(
      'SELECT lm_complete_job($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text) AS accepted',
      [this.scope.orgId,lease.id,lease.workerId,lease.fence.toString(),resultDigest]
    );
  }
  async fail(lease: DurableLease, code: string, retryable: boolean): Promise<boolean> {
    this.validateLease(lease);
    if (typeof code !== 'string' || !ERROR.test(code) || typeof retryable !== 'boolean')
      throw Error('JOB_ERROR_CODE_INVALID');
    return this.transition(
      'SELECT lm_fail_job($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::boolean) AS accepted',
      [this.scope.orgId,lease.id,lease.workerId,lease.fence.toString(),code,retryable]
    );
  }
  async cancel(jobId: string): Promise<boolean> {
    if (!uuid(jobId)) throw Error('JOB_ID_INVALID');
    return this.transition(
      'SELECT lm_cancel_job($1::uuid,$2::uuid) AS accepted',
      [this.scope.orgId,jobId]
    );
  }
  async reapExhausted(): Promise<bigint> {
    return this.scoped(async client => {
      const out = await client.query<{reaped: string}>(
        'SELECT lm_reap_exhausted_jobs($1::uuid)::text AS reaped', [this.scope.orgId]
      );
      if (typeof out.rows[0]?.reaped !== 'string' || !/^[0-9]+$/.test(out.rows[0].reaped))
        throw Error('JOB_REAPER_ROW_INVALID');
      return BigInt(out.rows[0].reaped);
    });
  }
  private validateLease(lease: DurableLease): void {
    if (!lease || lease.orgId !== this.scope.orgId ||
        !uuid(lease.id) || !uuid(lease.documentId) ||
        !worker(lease.workerId) || !KINDS.includes(lease.kind) ||
        !Number.isSafeInteger(lease.attempts) || lease.attempts < 1)
      throw Error('JOB_LEASE_SCOPE_INVALID');
    requireFence(lease.fence);
  }
}
