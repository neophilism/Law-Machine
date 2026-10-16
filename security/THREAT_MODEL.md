# Initial threat model

Scope: LM-001 source archive, plan registry, validation tooling and CI; planned runtime boundaries are requirements, not implemented controls. No deployed app or private database exists in this foundation.

| Asset / boundary | Threat | Required behavior and evidence |
| --- | --- | --- |
| Approved work plan → portfolio importer | Duplicate/missing units, wrong repository, cycles, fake completion | Strict parser, preservation tests, live real PR mapping; one canonical file |
| Source archive → active plan | Silent loss or changed acceptance criteria | Original DOCX/text digests, exact original-unit parity |
| Pull request → CI/merge | Untrusted code gets secrets or unchecked merge | Read-only CI permissions, no pull_request_target, no persisted checkout credential, pinned actions; current-head preflight |
| Source file → parser (planned) | XXE, archive bomb, active content, SSRF | Bounded isolated parsing; protocol/address/redirect checks; adversarial fixtures |
| Draft → author API/storage (planned) | Tenant escape, stale edits, preview/cache leak | Auth-derived membership, same-tenant references, revision guards, private no-store previews |
| Legal source → executable outcome (planned) | Invented rules, lost qualifications, unknown-to-false conversion | Versioned citation and classification, bounded typed rules, independent golden traces |
| Model → browser worker (planned) | Infinite events, memory exhaustion, arbitrary code | Allowlisted interpreter, budgets/cancellation, no uploaded executable expressions |
| Publication → public catalog (planned) | Partial/tampered release, unauthorized disclosure | Verified immutable assets, publication authority, atomic pointer, signing/rotation |
| Private draft → AI provider (optional/planned) | Prompt injection, oversharing, uncontrolled cost | Explicit authorized processing, candidate-only constrained output, no tools, budgets, kill switch |
| App/worker → logs, backup, deployment (planned) | Sensitive logging, lost state, unsafe rollback | Redaction, durable leases, verified restore, isolated migrations and rollback tests |

Trust private server processing explicitly. Do not describe public data or server-readable drafts as private E2EE. Add key/recipient/profile evidence before any protected endpoint-encryption claim.

Foundation residual limits: third-party CI/runtime supply chain and live portfolio ingestion are not independently certified. The six full-product secure-development gate reports are not complete. These honest pending states do not create an external-human-review gate.
