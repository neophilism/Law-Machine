# ADR 0002: use the current shared PR registry contract

Status: accepted, 2026-10-16. Supersedes section 13's registry-path advice in the original architecture document, without changing any of its 60 work units.

`registry/prs.json` is the sole active plan. Use the version 1 envelope, stable IDs, explicit PR mappings, local dependencies, scope, acceptance, and historical observations specified by Boardroom's `registry/PR_FORMAT.md`. Preserve every original LM-001–LM-060 unit. `registry/roadmap.json` contains only a retirement notice and no unit array or count. The readable Markdown plan is generated from the canonical units. The complete original source is retained under `docs/reference/`.

## Inspection and reconciliation

Boardroom's current `AGENTS.md`, `registry/PR_FORMAT.md`, `registry/pr-contract.mjs`, and `src/server/roadmap-import.ts` require `prs.json`. Engine Room's documentation still says `roadmap.json`; inspecting its actual `lib/sync/plan-source-sync.mjs` shows that the source refresher fetches `STRUCTURED_PR_PATH` first. Its `lib/sync/structured-pr-registry.mjs` accepts the new record. Therefore the source has one active plan, with no duplicate legacy milestone array.

The exact Boardroom parser is vendored as `registry/pr-contract.mjs`. Exact Engine Room structured and legacy parser fixtures are retained for compatibility tests. `registry/upstream-sources.json` records their source blob SHAs; tests compute Git blob hashes to detect edits. Both structured parsers must return the same 60 IDs, denominator, and explicit PR references. Unlinked work stays unmapped. The legacy canonical parser must reject the retirement notice: that is expected, not an alternate successful import.

Engine Room's older title matcher and Boardroom's newer matcher have different follow-up/contribution behavior. Law Machine writes explicit mappings after actual PR creation; the newer shared contract governs local validation. Do not claim that every remote consumer has identical runtime behavior or has already synchronized. No Boardroom/Engine Room code or database is changed here.

Read-only inspected source links:

- https://github.com/neophilism/Boardroom/blob/main/registry/PR_FORMAT.md
- https://github.com/neophilism/Boardroom/blob/main/src/server/roadmap-import.ts
- https://github.com/neophilism/Engine-Room/blob/main/lib/sync/plan-source-sync.mjs (blob `1d518b29fb5769b92847baa7f7856783cdaa013a`)
- https://github.com/neophilism/Engine-Room/blob/main/lib/sync/structured-pr-registry.mjs

## Evidence semantics

An empty observed PR list was confirmed before bootstrapping this repository. Fill PR links only after real GitHub creation. `observedAt` dates an actual observation; a stored snapshot never establishes current merge state. Live GitHub owns that state. Correction PRs keep their original work-unit IDs; incomplete contributions are recorded separately and cannot establish completion. Full product acceptance and deployment are independent of merged unit counts.
