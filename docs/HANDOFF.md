# Implementation handoff

The owner selected `neophilism/Law-Machine` and directed development beginning with the foundation on 2026-10-16. All 60 units from the original specification are adopted. The active registry is `registry/prs.json`. Read live GitHub state before continuing; this document is not a live progress counter.

## Foundation delivered

LM-001 preserves the complete source document, defines architecture decisions and package boundaries, imports all 60 units without reducing scope, tests both consumer parsers and registers the owner's execution/security policy. It includes minimal credential-free CI needed to check its own work. No application runtime, database, cloud resource, legislative pack or public deployment is claimed.

## Workspace checkpoint and next unit

LM-001 is merged as PR #1. The implemented workspace is PR #4, `lm-002-workspace`; inspect its current GitHub CI/merge status. PR #3 was observed to contain only an in-progress evidence note for the same unit; preserve that branch and reconcile its actual latest contents before treating it as an implementation follow-up. No unseen work is assumed complete.

PR #4 includes strict TypeScript, seven domain packages, a Next.js shell, import boundary checks, source-pattern scanning, dependency auditing, production build and browser/axe tests. Local checks and browser execution pass; the initial complete GitHub workflow passed. Exact current-head checks govern merging.

The next implementation is LM-003 (domain schemas/identity), with LM-005 (design primitives) also dependency-ready after LM-002. All changes are saved through small PRs because the owner requested frequent repository checkpoints and continuation toward at least 15 of 60 units.

## LM-002 acceptance retained for reference

After LM-001's actual PR is merged, implement the pnpm workspace and TypeScript application scaffold described in the plan. Pin mutually compatible maintained dependencies after checking their current documentation. Commit the lockfile; provide a clean-checkout local development command requiring no credentials.

Create `apps/web`, `apps/jobs` and the seven domain packages in ADR-0002. Add meaningful lint, type, test and build checks. Enforce prohibited imports (including browser-to-database and pure simulation-to-React) with negative fixtures. Add secret/dependency checks and fix actionable findings. Build a minimal explicit development shell; do not invent a functional simulator before LM-019 onward.

Then LM-003 and LM-005 become dependency-ready. Respect the full dependency graph; the plan's range dependencies for LM-041 and LM-060 are expanded explicitly in the registry.

## Session procedure

1. Inspect `AGENTS.md`, the selected unit, dependencies, git status and actual open/merged PRs.
2. Claim work by branch/PR without overwriting another agent's work. Start from the current default branch.
3. Implement all layers in the selected scope, tests, failure handling, documentation and rollback.
4. Run `npm run check` and applicable additional checks. Record exact commands and honest results in `docs/evidence/LM-XXX.md`; repair failures.
5. Open a PR with an exact leading work ID. Record its real number in `prs`; refresh observations from the actual API. Never fabricate a merge.
6. Inspect completed required checks at the current head and run the merge preflight with expected SHA. Merge when authorized and verified. Confirm the resulting GitHub state.
7. Continue ready work. If an optional provider is unavailable, preserve fixture/manual paths and document only the affected feature limitation.

## Source availability and integration limits

The original technical specification is archived under `docs/source/` with its SHA-256. It describes an electronic-filing draft but does not contain the complete bill text. When LM-018 begins, retrieve the actual supplied draft and exact baseline source snapshots. Do not reconstruct missing legislative language from the architecture's examples. Source acquisition does not block the foundation or toy-law fixtures.

The two pinned consumer parsers import this registry with the same IDs and denominator. Their implementations differ; details are in ADR-0001 and `registry/CONTRACT_SOURCES.json`. This does not prove that either portfolio service has discovered, refreshed or deployed Law Machine. Verify live ingestion separately; do not change those repositories just to mirror state.

## Evidence and rollback

`docs/evidence/LM-001.md` records foundation verification. `security/e2eesa-status.json` intentionally keeps whole-product implementation/testing and independent review incomplete. Revert an offending foundation change through a checked PR; preserve the source archive and stable work IDs when correcting the plan. There are no migrations or deployed runtime services to roll back at LM-001.
