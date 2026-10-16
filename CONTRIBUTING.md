# Contribution workflow

1. Read `AGENTS.md`, the architecture, the relevant ADR, and the planned unit. Confirm prerequisites against live GitHub evidence.
2. Create a scoped branch such as `work/lm-002-workspace`. Implement the entire unit's defined behavior, errors, authorization boundaries, and applicable tests.
3. Run foundation checks and the checks applicable to the change. Review source/security behavior, fix failures, and retain commit-bound results. Later human repetition of critical tests does not replace these tests.
4. Open a PR with the exact leading work-unit ID and the repository template. Only after GitHub returns the actual PR number, add it to that unit's `prs` (or `contributingPrs` for incomplete scope). Store real observation metadata if recording a snapshot.
5. Keep the same approved work-unit count for corrections/follow-ups. A new approved unit requires a stable ID, `roadmapVersion` increment, scope, acceptance, dependency validation, and regeneration of the readable plan.
6. Verify current-head CI with the merge preflight, merge within the owner's authorization, and verify the default branch. Leave live GitHub as the merge authority; an older stored open observation is historical rather than a reason to keep rewriting the source.

Use `node scripts/render-plan.mjs` to update `docs/DEVELOPMENT_PLAN.md`. The Markdown is a readable view of `registry/prs.json`; consumers must not parse it as a second machine plan.

Each PR must say what works now and what remains outside its scope. An application build, browser journey, live provider test, deployment, or full security assessment may only be called passed when actually executed. A local substitute is labeled as such.

No mandatory external audit or human approval stage is introduced by this workflow. Applicable actual failures are repaired by the implementing agent. For unrelated work, proceed around a concrete unavailable integration with that activation path disabled.
