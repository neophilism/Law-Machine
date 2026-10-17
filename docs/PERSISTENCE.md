# Editorial storage: LM-042

Law Machine provides PostgreSQL 16+ schema migrations, a driver-neutral pooled SQL repository, and a no-credentials in-memory development fixture. This is a foundation for later authenticated authoring, not a public author API or deployed database.

## Schema and identity

Every editorial document, revision, source, release and job has an organization-scoped key. Composite foreign keys prevent a source, release or job from referencing another organization's document. Every tenant table has forced row-level security; access without a trusted transaction-local app.organization_id yields zero rows. The application must set app.organization_id and app.actor_id from a **verified server-side author session**; never accept these values from a request body or query string. LM-043 owns authenticated sessions, actor entitlements, authorization of each author route and role revocation.

Editorial writes invoke SQL SECURITY INVOKER functions inside one transaction. They check current tenant and actor scope, membership and the expected revision; a stale revision raises LM_STALE_REVISION. Revision changes, immutable historical versions and audit entries commit or roll back together. Audit entries contain metadata only, not source content or personal scenario facts. Private original source bytes belong in a later private object storage implementation, not these tables.

The database connection adapter accepts a PgConnectionPool-compatible client (such as a later maintained PostgreSQL pool) without importing database drivers into the public SDK or domain packages. The fixture store is in-memory **only**: it does not persist between processes and is not suitable for private real-world source data.

## Migration and testing

Test-only PostgreSQL:

1. Create an isolated PostgreSQL 16+ database.
2. Run psql -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/0001_up.sql.
3. Run psql -v ON_ERROR_STOP=1 -f tests/postgres/persistence.sql.
4. The test exercises a nonowner role, row security, stale concurrent revisions, atomic audit rollback and reversible schema removal inside an explicit transaction.

CI performs these steps against a disposable service container and subsequently tests the down migration. The down migration **destroys all editorial data** if committed. It is for ephemeral development databases only. Production rollback and recovery must use an authorized backup/PITR procedure; never run the down script against production data.

Run pnpm check for the offline fixture and repository-client contract tests. New PostgreSQL checks named postgres are required for LM-042 and follow-on persistence changes. No Neon project, Render service, database credentials or deployment are created by this PR.
