# Law Machine

Follow a claim, application, decision, document, or dollar through a system governed by law. Inspect the source of each rule, change a circumstance, replay the result, and compare a proposed bill with a dated baseline.

## Development status

**LM-001: repository foundation.** The architecture, 60-unit implementation plan, repository policies, shared PR registry, security tracking, and executable foundation checks are present. The application and simulation runtime begin in subsequent units; there is no deployed product yet.

- [Architecture](docs/ARCHITECTURE.md) — deterministic simulation, citations, immutable releases, accessible visual and sequence views.
- [Development plan](docs/DEVELOPMENT_PLAN.md) — scope, dependencies, and acceptance for LM-001 through LM-060.
- [Canonical PR registry](registry/prs.json) and [format](registry/PR_FORMAT.md) — real PR links, never inferred PR numbers.
- [Agent instructions](AGENTS.md) and [contribution workflow](CONTRIBUTING.md).
- [Security and testing policy](docs/SECURITY_AND_TESTING.md) — AI-owned implementation, testing, and remediation; human review remains separate.
- [Architecture decisions](docs/adr/0001-modular-typescript-architecture.md) and [registry compatibility findings](docs/adr/0002-shared-pr-registry.md).

## Verify the foundation

Use Node.js 24.19.0 (`.node-version`) and Python 3.11 or later. No package installation, cloud account, API key, or paid service is needed for LM-001.

```sh
node scripts/verify-foundation.mjs
```

The command validates the registry and security record, checks generated plan consistency and local document links, checks JavaScript/Python syntax, verifies pinned consumer fixtures, and runs positive and adversarial tests. It exits nonzero on failure. GitHub Actions runs the same command as the `foundation` check.

After editing approved units in `registry/prs.json`, regenerate the readable plan with `node scripts/render-plan.mjs`, then run verification. Keep the original approved source in `docs/reference/` intact.

## Product boundaries

The first pack concerns a proposed electronic-filing bill. It must remain labeled as a proposal and as hypothetical simulation. Law Machine does not accept real legal filings, issue government receipts, or calculate authoritative deadlines for an actual case. Legal duties and observed actor behavior are distinct: a missed statutory deadline creates a modeled breach, not automatic compliance.

The planned stack is a strict TypeScript pnpm monorepo, Next.js/React, React Flow/ELK, a pure simulation engine in a Web Worker, and later PostgreSQL/object storage for authoring. Ask Bill consumes the eventual headless SDK through separate product work.
