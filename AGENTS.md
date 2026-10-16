# Law Machine agent instructions

Read this file, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_PLAN.md`, and the relevant ADRs before implementing. Inspect live branches, PRs and checks before choosing work. Preserve unrelated work.

## Owner security-review and execution policy

The owner directs AI agents to perform implementation, source/security review, threat analysis and relevant unit, integration, browser, adversarial and recovery testing. Implement end-to-end behavior through all affected layers. Diagnose failures, fix concrete findings, retest, and retain evidence tied to the tested source. Do not hand testing to the owner as unfinished work.

Continue implementation, testing, merging and deployment without waiting for an independent human security review, external auditor, paid penetration test or E2EESA certification. Human rechecking of critical tests is later follow-up. Pending independent review, a missing reviewer identity, audit budget or pre-certification status is not an operational prerequisite. Do not ask the owner again to waive it.

Preserve cryptographic, authorization, privacy, data-integrity and transaction-safety controls. Failed required checks and actual vulnerabilities must be repaired; never relabel them passed because someone will retest later. Missing credentials or authorized resources affect only the functionality that needs them. Continue other dependency-ready work using provider-free fixtures and disabled optional integrations.

Keep implementation, automated testing, external review, certification, merge, deployment and product acceptance distinct. Never call AI review an independent human audit. Follow `security/E2EESA_ADOPTION.md`; do not invent E2EE or conformance claims.

## Work units and PR storage

- `registry/prs.json` is the sole active machine-readable plan. Preserve LM-001 through LM-060, scope, acceptance, dependencies and provenance. Add approved scope with new immutable IDs, never by renumbering.
- Follow `registry/PR_FORMAT.md`; `registry/roadmap.json` is a retirement notice only.
- Use a branch such as `lm-002-workspace` and an exact leading PR title such as `LM-002: Workspace and continuous integration`. A plan ID is not a PR number.
- Add real PR numbers only after GitHub creates them. Use `prs` for accepted implementation mappings, `contributingPrs` for partial work and `priorEvidencePrs` for historical evidence. Do not infer mappings from ordinal positions.
- GitHub's live API owns PR status. Dated registry observations are historical evidence. Update `observedAt` only when refreshing actual observations; open follow-ups prevent declaring the unit complete.
- Store implementation/test/review/rollback evidence in `docs/evidence/LM-XXX.md`. Keep task-specific code and its relevant tests together.
- Run `npm run check` plus all relevant application checks. Add new checks when new surfaces land; foundation-only checks cannot certify later application behavior.
- Before a direct GitHub PR merge, use `docs/GITHUB_MERGE_PREFLIGHT.md` and `scripts/verify-pr-merge.mjs` with required check `foundation` and the exact current PR head SHA. Add applicable named checks as the workspace grows. Missing, failed, pending, skipped, unstarted or incomplete checks are not passed. Fix/retry; keep the affected PR open and progress safe independent work if CI capacity is unavailable.
- Continue dependency-ready work without repeated permission questions. Do not mutate Boardroom or Engine Room merely to copy this repository's plan. Do not spawn additional agents without user or applicable instruction authorization.

## Product and engineering invariants

- Public scenarios contain hypothetical facts; no real legal filings, government receipts, personal legal advice or invented current-law assertions.
- Preserve source bytes and exact versioned citations. Separate legal duties from actual actor behavior, assumptions from evidence, and proposal status from enactment.
- Unknown facts remain unknown. Unresolved legal conflicts are visible. The renderer cannot create legal transitions.
- Core contracts, legislation, rules and simulation must not import React, Next.js, database clients or provider SDKs. Provider-free operation is required.
- Server processing of private drafts is explicitly authorized processing, not private end-to-end encryption. Keep drafts out of public caches, release packages, logs, analytics and public GitHub.
- Never commit secrets, private documents, raw provider credentials or personal scenario facts. Use bounded parsing and execution, least privilege, tenant checks and explicit publication authority.
- Avoid paid provisioning or changing another service without authorization. Public static mode and manual authoring remain useful when optional services are unavailable.

## Scope of the initial foundation

LM-001 implements planning/contract/policy infrastructure. LM-002 owns the application scaffold, pnpm lockfile, TypeScript, lint/type/build checks and package-import enforcement. Do not count LM-002 or later units complete based on the foundation.
