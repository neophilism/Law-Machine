# Implementation handoff — 2026-10-17 checkpoint

The authoritative source of unit scope and dependencies is [registry/prs.json](../registry/prs.json) and [docs/DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). This dated checkpoint is NOT a live GitHub status feed. Inspect actual branch, pull request, current-head checks and merge state before work.

## Completed through this checkpoint

**LM-001 through LM-029 are merged except LM-018**: the actual sequential merged units are LM-001–LM-017 and LM-019–LM-029, plus LM-042. This totals **29 of 60 units**, not 29 consecutive units. The 29th merged milestone was LM-042 PR #35 (PostgreSQL persistence) after three required CI jobs passed.

- LM-001–008: architecture/registry, workspace, schemas, canonical bytes/hash, accessible design, headless SDK, coverage capability declarations, fictional test oracle.
- LM-009–017: document imports, source adapters, citations, baseline/temporal and amendatory projections, invalidation, assumptions/evidence.
- LM-019–029: rule language/compiler, deterministic scheduler, actor state, deadlines, obligations/remedies, queues, replay/run identity, framework comparison, explanations and real browser worker with safe cancellation.
- LM-042: PostgreSQL migrations for scoped editorial records, immutable revision/audit history, source/release/job metadata, forced RLS, optimistic revision conflicts, real ephemeral PostgreSQL tests and fixture-mode adapter. No production DB has been provisioned or migrated.

Verify [LM-026 PR #31](https://github.com/neophilism/Law-Machine/pull/31), [LM-027 PR #32](https://github.com/neophilism/Law-Machine/pull/32), [LM-028 PR #33](https://github.com/neophilism/Law-Machine/pull/33), [LM-029 PR #34](https://github.com/neophilism/Law-Machine/pull/34) and [LM-042 PR #35](https://github.com/neophilism/Law-Machine/pull/35).

## In-progress units not accepted

- **LM-043 author identity**, draft [PR #36](https://github.com/neophilism/Law-Machine/pull/36), contains server-only permission checks, fresh membership/role scope tests, CSRF/reauth tests and a deliberately disabled author preview route. Complete managed identity-provider integration, real revocable sessions, role persistence and authenticated author-route E2E verification before considering acceptance.
- **LM-018 first electronic-filing content pack**, draft [PR #37](https://github.com/neophilism/Law-Machine/pull/37), contains the 14 approved scenarios as a nonpublishable planning inventory and fail-closed source readiness checks. The authentic complete bill text and official dated baseline source bytes are NOT present; do not reconstruct legislation or publish this pack. Its research links are candidates, not independently pinned baseline snapshots.
- LM-030's full first-pack simulation needs LM-018, so cannot be accepted while LM-018 lacks verified sources. LM-043 is a prerequisite for LM-044–046 authoring/upload work.

## Next development actions

Finish source-authenticated LM-018 and retained golden scenarios once the complete bill text and dated official baseline versions are supplied, and finish LM-043 using a maintained managed identity provider (candidate: Neon's managed authentication), with immutable source/version and cross-organization authorization checks. Keep public preview and toy-law worker usable without paid credentials. Other backend work may be prepared separately but cannot be merged as complete until its actual dependency gates pass.

## Verification / merge

Start from a clean checkout on Node 24.19.0, pnpm 11.25.0. Run pnpm install --frozen-lockfile, pnpm check, pnpm audit, pnpm build, then pnpm exec playwright install --with-deps chromium and pnpm test:browser. The current CI includes foundation, workspace and postgres jobs; require all applicable checks at exact PR head. A passing docs-only check cannot certify an unimplemented feature. Use docs/GITHUB_MERGE_PREFLIGHT.md and expected-head SHA merges; fix real failures before merging.

The public service remains a development experience; it does not receive actual legal filings, issue government receipts, calculate authoritative personal deadlines, or assert the proposal is enacted. Ask Bill is a separate character/conversation project consuming the headless SDK in the future; do not conflate repositories or companies.

Security testing and AI review do not constitute independent human certification. No external human audit is required for safe continued software development; unresolved actual vulnerabilities remain blockers to their affected release.
