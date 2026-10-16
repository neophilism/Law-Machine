# ADR-0001: Adopt the original plan and current canonical registry

Status: accepted for LM-001, 2026-10-16.

The owner directed implementation of the supplied Law Machine architecture and plan in this repository. Preserve LM-001 through LM-060, all scope, acceptance and dependencies. Archive the complete original DOCX and its text; retain source hashes. The original document is historical source material, not a second live machine-readable plan.

Use `registry/prs.json` under the Boardroom shared version-1 contract. `registry/roadmap.json` contains only a retirement notice. This corrects the original document's older path instruction without changing the work denominator. `planVerified: true` means owner-adopted scope, not finished software.

## Consumer compatibility

Inspection found Boardroom's `registry/pr-contract.mjs` and Engine Room's `lib/sync/structured-pr-registry.mjs` are different implementations. Engine Room still retains an older roadmap parser as well. Do not claim the two repositories use identical code. Pin their actual blob and commit identities in `registry/CONTRACT_SOURCES.json`.

Vendor the Boardroom parser unchanged as the active contract. Retain Engine Room's actual structured parser as a test fixture. Run the same 60-unit document through both, comparing denominator, ordered stable IDs, titles, original/addition scope and explicit PR mappings. Use the stricter Boardroom dependency validation locally. Use exact `LM-001:` title prefixes; explicit real PR mappings avoid consumer title-matching differences.

No second milestone array is published to appease the older parser. Contract tests establish compatibility with the structured importers only; live portfolio registration/refresh is separate and unverified. Neither portfolio repository is modified by LM-001.

## GitHub evidence

PR numbers are recorded only after creation. The initial observed empty PR list is a real API observation. Refresh observations on subsequent actual API reads, not on every build. PR state is always live GitHub authority; planned work, merged work and operational acceptance are separate.

An empty repository needs a small initialization commit before GitHub can open a PR. That bootstrap does not complete LM-001 and has no fabricated PR mapping. The complete foundation is delivered through an LM-001 PR.
