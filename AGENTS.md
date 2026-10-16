# Law Machine repository instructions

## Owner policy: implementation and testing

The owner authorizes end-to-end implementation, testing, fixes, dependency-ready PRs, merging, and deployment within the requested scope. The agent performs the work and all applicable tests. A human will later repeat critical tests. Do not wait for independent human security review, an external auditor, paid penetration testing, or E2EESA certification. Do not ask the owner again to waive that prerequisite.

- Perform substantive AI-assisted source/security review, threat analysis, and applicable automated, adversarial, integration, browser, recovery, and performance tests. Fix findings and rerun the affected checks yourself.
- Do not hand routine testing back to the owner or treat an unchecked human-review box, missing reviewer identity, or unavailable audit budget as a development/release gate.
- Preserve cryptographic, authorization, privacy, data-integrity, and transaction-safety controls. Do not bypass failed required tests or hide actual vulnerabilities; resolve them, or close the affected activation path while continuing independent work.
- Keep implementation, testing, independent review, certification, merge state, deployment, and operational acceptance separate. AI review is not independent human review or certification.
- Missing credentials or unavailable providers affect only the concrete integration needing them. Use local/provider-free fixtures for other development, record live verification honestly, and never fabricate a successful integration.
- This policy supersedes older planning text that makes independent external review a prerequisite. It follows the owner's 2026-10-13 shared policy and 2026-10-16 instructions for this repository.

## Scope and architecture

Read `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_PLAN.md`, `registry/PR_FORMAT.md`, and the relevant ADR before changes. Work in `neophilism/Law-Machine`; inspect other repositories read-only unless separately authorized to change them. This request starts with LM-001; do not silently mark later units complete.

Keep legal sources, interpretations, empirical assumptions, and unknowns distinct. Model duties separately from behavior. Preserve source versions and exact provenance. The core cannot import React, Next.js, database clients, or provider SDKs. Rendering cannot create legal outcomes. Unknown is not false. Proposal status, partial coverage, and baseline dates must survive every public view.

## PR storage and evidence

`registry/prs.json` is the sole active machine-readable plan. `registry/roadmap.json` is a retirement notice only. Preserve the 60 original IDs, scopes, dependencies, and acceptance criteria. Add approved work explicitly with a version/count update; never invent a second denominator.

Start PR titles with their exact stable ID, for example `LM-001: establish the repository foundation`. GitHub PR numbers are separate from plan ordinals. Map only actual same-repository PRs after creation. Partial or historical evidence belongs in `contributingPrs` or `priorEvidencePrs`; it does not complete a unit. Update `observedAt` only when actual PR observations change. Live GitHub owns current open/closed/merged status.

Every functional PR includes relevant checks, source/security review, limitations, and rollback/disable instructions. Update the canonical unit and specification together. Run `node scripts/verify-foundation.mjs`; subsequent units add their applicable checks. Never suppress failing checks or declare success from skipped/unstarted jobs.

Before an authorized merge, follow `docs/GITHUB_MERGE_PREFLIGHT.md`: inspect the exact current head, require all configured checks (`foundation` initially), repeat the preflight, and merge with the expected head SHA. The connector can supply equivalent fresh API evidence to the checked-in assessor; missing or incomplete evidence fails closed. Independent-human-review status is not a merge condition.

## Security and collaboration

This repository is public. Never commit credentials, private source uploads, real claims, personal data, or raw operational secrets. Read `SECURITY.md` and `docs/SECURITY_AND_TESTING.md`. Keep E2EESA progress in `security/e2eesa-status.json`; claims require source-bound evidence. Do not claim private E2EE for server-readable data or public publications.

Preserve other contributors' changes. Use a scoped branch; do not force-push or rewrite unrelated history. Continue the user's authorized work without routine approval pauses, and report concrete limitations precisely.
