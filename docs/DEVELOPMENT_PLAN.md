# Law Machine development plan

> Generated from `registry/prs.json` by `node scripts/render-plan.mjs`. Edit the canonical approved units, then regenerate. PR numbers and live state belong to GitHub.

60 approved work units; roadmap version 1. Stable IDs are not GitHub PR numbers. Original scope, dependencies, and acceptance are retained from the [approved source](reference/APPROVED_PLAN_2026-10-16.md).

The architecture is in [ARCHITECTURE.md](ARCHITECTURE.md). Agent-owned implementation, testing, and remediation follow [AGENTS.md](../AGENTS.md). Deferred independent human review and certification do not gate development or release. Actual failed checks are fixed, and unavailable optional integrations do not stop independent work.

| Milestone | Units | Result |
| --- | --- | --- |
| Foundations | LM-001–008 | Repository, contracts, design primitives, fixtures |
| Legislative sources | LM-009–018 | Versioned explorer and first source pack |
| Executable system | LM-019–030 | Deterministic engine and first complete model |
| First demonstration | LM-031–034 | Guided wrong-agency journey and source inspector |
| Public explorer | LM-035–041 | Comparison, sandbox, accessibility, static distribution |
| Authoring/publication | LM-042–050 | Secure editorial workflow and releases |
| Operations/reuse | LM-051–060 | Recovery, security, second domain, SDK, acceptance |

## LM-001: Architecture decisions and roadmap registration

Dependencies: none.

Deliver the architecture records, package boundaries, scope, public-product boundaries, implementation milestones, and the adopted canonical roadmap. Inspect the current source contract used by Boardroom and Engine Room before producing its machine-readable representation. Preserve plan IDs and original plan text.

Acceptance: schema validation confirms 60 unique work units; both consumer contract fixtures import the same denominator and IDs; empty PR links remain unstarted. The PR title and actual GitHub number are distinct. No portfolio repository is modified as a side effect.

## LM-002: Workspace and continuous integration

Dependencies: LM-001.

Create the pnpm workspace, TypeScript configuration, application scaffold, dependency lockfile, linting, type checks, CI, and source-security checks. Set package import restrictions and a provider-free development command. Document the owner's AI review policy without imposing an external-auditor gate.

Acceptance: a clean checkout builds and runs tests without cloud credentials. A deliberately prohibited browser-to-database import fails CI. Secret scanning and dependency findings produce actionable results; real findings are resolved or the affected feature is disabled.

## LM-003: Domain contracts and identity

Dependencies: LM-002.

Define schemas for bill versions, provisions, actors, source anchors, rules, assumptions, scenarios, releases, and traces. Establish identifier scopes, version references, typed quantities, unknown values, and compatibility policy. Generate shared TypeScript boundary types.

Acceptance: positive and negative fixtures validate deterministically. Cross-version references, invalid quantities, duplicate IDs, and unsupported schema versions fail with precise diagnostics. A schema compatibility test protects retained public examples.

## LM-004: Canonical serialization and integrity

Dependencies: LM-003.

Implement raw source digests, canonical JSON serialization, manifest hashing, content-addressed asset names, and release verification. Exclude volatile metadata from content identity only by an explicit documented rule.

Acceptance: reordered JSON keys produce the same canonical digest; changed source bytes produce a different source digest; tampered, missing, or mismatched assets fail verification. Node and browser implementations agree on fixtures.

## LM-005: Design system and accessible interaction primitives

Dependencies: LM-002.

Create typography, color and shape semantics, buttons, dialogs, tabs, inspectors, focus management, motion preferences, responsive layout primitives, and loading and error states. Establish the public visual direction with institution and document illustrations.

Acceptance: components support keyboard navigation and documented contrast targets. Reduced motion and touch layouts work. Static previews show readable hierarchy on phone and desktop without reliance on color alone.

## LM-006: Headless SDK boundaries

Dependencies: LM-003, LM-004.

Create the public package interfaces, manifest loader, schema negotiation, error vocabulary, and contract tests for a non-React consumer. Stub later simulation methods with explicit unsupported responses until their implementations land.

Acceptance: a command-line fixture loads a release and resolves a provision without importing the web application. An incompatible engine or schema fails explicitly. Package exports do not expose private provider or authoring code.

## LM-007: Coverage and capability declarations

Dependencies: LM-003.

Represent modeled, explanatory-only, ambiguous, and unsupported provisions. Declare which rule operations, calendars, and domain capabilities a pack requires. Create visible status labels for draft law, baseline date, hypothetical scenario, and partial coverage.

Acceptance: a pack requiring an unsupported operation cannot execute as complete. Coverage counts derive from explicit provision mappings. Public fixtures cannot lose their legislative-status label through a scene change.

## LM-008: Reference fixtures and independent test oracle

Dependencies: LM-003, LM-004, LM-007.

Create a tiny toy law, source anchors, independently specified expected event traces, malformed examples, and a browser/server parity harness. Document the reasoning behind each expected result so tests do not merely reproduce implementation output.

Acceptance: altered routing, unknown handling, and source mappings are caught. The fixtures run without network access. Test data clearly separates invented toy law from real legislative text.

## LM-009: Text Markdown and DOCX ingestion

Dependencies: LM-003, LM-008.

Implement original-byte preservation, basic source metadata, text and Markdown import, and bounded DOCX extraction with hierarchy and tables. Create import diagnostics and explicit source numbering records.

Acceptance: nested provisions and table text survive round trips; unsupported active content is never executed. Oversized or highly expanded archives are rejected. The original file and extracted text remain distinguishable.

## LM-010: Official XML and metadata adapters

Dependencies: LM-009.

Add separate USLM and House Bill DTD parsers with namespace and schema detection. Add optional Congress.gov and GovInfo metadata adapters with fixture caching, timeouts, and source version capture.

Acceptance: one fixture from each supported XML family parses correctly; unsupported schemas fail clearly. External entities cannot read files or initiate network calls. Unpublished local drafts work without an official-source API key.

## LM-011: PDF extraction and correction workflow

Dependencies: LM-009.

Add bounded text-PDF extraction with page anchors, extraction-quality diagnostics, and an optional isolated OCR interface. Provide correction records for low-confidence text and retain the original bytes.

Acceptance: columns, page breaks, scanned pages, and malformed files have explicit outcomes. A low-confidence passage cannot silently support an operative rule. OCR absence leaves the source readable and correctable rather than blocking unrelated imports.

## LM-012: Canonical provision tree and version persistence format

Dependencies: LM-009, LM-010, LM-011.

Normalize supported inputs into the provision tree. Preserve displayed numbering, parent relationships, definitions, cross-references, original spans, and version-local identities. Build exportable source-explorer data.

Acceptance: renumbering does not overwrite prior versions. Duplicate section labels and missing parents yield diagnostics. Each rendered provision can recover its exact source version and text.

## LM-013: Citation resolver and source inspector data

Dependencies: LM-012, LM-004.

Implement composite anchors, exact quote resolution, page links, version-aware cross-references, public source excerpts, and citation metadata for downstream consumers.

Acceptance: moved or edited text is marked stale rather than linked silently. All first-pack rule references resolve against their pinned source. Private source paths are excluded from public metadata.

## LM-014: Baseline snapshots and temporal applicability

Dependencies: LM-012, LM-007.

Define dated baselines, jurisdiction and agency variants, effective-date expressions, enactment assumptions, transition periods, and unresolved interpretations. Add official-source snapshots for the first comparison area.

Acceptance: a proposal cannot load as enacted law by default. Runs before and after a staged effective date select different applicable provisions. A baseline gap is visible and cannot be filled with an invented rule.

## LM-015: Amendatory instructions and consolidated projections

Dependencies: LM-014, LM-013.

Implement typed insert, replace, repeal, and renumber operations against exact baseline versions. Preserve the instruction and its projected result as different artifacts. Allow an unresolved patch to remain inspectable.

Acceptance: ambiguous or absent targets fail safely; old baseline bytes remain unchanged. A generated consolidation is labeled. Tests cover multiple amendments touching the same provision and declared precedence.

## LM-016: Version diff and dependency invalidation

Dependencies: LM-015.

Add text and structural diff, provisional provision correspondence, and the dependency index from source spans to rules, scenarios, scenes, and translations. Mark affected derivatives stale when source content changes.

Acceptance: editing an operative exception invalidates its dependent scenarios. Renumbering alone does not falsely assert unchanged meaning without checking text. Prior releases and citations remain reproducible.

## LM-017: Evidence assumptions and interpretation records

Dependencies: LM-013, LM-014.

Implement source-language, interpretation, empirical-evidence, assumption, and unknown classifications. Add units, ranges, evidence limitations, conflict records, and review disposition.

Acceptance: an empirical delay cannot masquerade as statutory time. Every operative rule has provenance; every numerical forecast input has evidence or an assumption label. Alternative interpretations can coexist without one silently replacing another.

## LM-018: Electronic filing source and content pack

Dependencies: LM-013, LM-014, LM-017.

Create the initial bill version, provision mappings, glossary, institutions, baseline source inventory, coverage report, and scenario specifications. Preserve the supplied wording and identify missing front matter for later attachment.

Acceptance: each of the 14 required scenario specifications identifies sources, expected checkpoints, assumptions, and unresolved points. The draft is labeled throughout. Current-law assertions cite dated official material and declared jurisdictional scope.

## LM-019: Rule language parser and validator

Dependencies: LM-003, LM-008, LM-017.

Implement the typed allowlisted expression language, triggers, guards, effects, modal force, exceptions, and diagnostics. Establish static validation and operator capability negotiation.

Acceptance: type errors and arbitrary code payloads are rejected. Unknown predicates retain unknown semantics. Unsupported legal concepts generate diagnostics rather than falling back to a plausible-looking result.

## LM-020: Rule compiler and provenance graph

Dependencies: LM-019, LM-013, LM-007.

Compile validated rules to immutable execution data and build source-to-effect dependencies. Check reachability, missing actors, explicit precedence, unresolved conflicts, and public explanation keys.

Acceptance: a transition without provenance fails validation. Conflicting rules cannot produce a single definitive branch without a recorded resolution. Compiled data is executable by both browser and server interpreters.

## LM-021: Simulation state and deterministic scheduler

Dependencies: LM-020, LM-008.

Implement event queues, causal event IDs, typed state, stable ordering, scheduled actions, stop conditions, cancellation checkpoints, and event budgets. Separate simulated time from wall-clock animation.

Acceptance: the same release and inputs produce the same ordered trace. Zero-time loops and event storms terminate with a diagnostic. Pause and step do not change the final result.

## LM-022: Calendar and deadline engine

Dependencies: LM-019, LM-014.

Implement versioned calendars, timezones, observed holidays, business days, calendar months, counting conventions, cutoff rules, and deadline extensions. Preserve the source of each legal counting choice.

Acceptance: independent fixtures cover leap days, daylight saving changes, month-end arithmetic, weekends, and holidays. Six months is not computed as 180 days. Missing counting rules create a visible interpretation requirement.

## LM-023: Duties rights permissions and breach

Dependencies: LM-021, LM-022.

Implement obligation creation, satisfaction, breach, rights preservation, permissions, prohibitions, and source-supported remedies. Keep actor behavior separate from legal force.

Acceptance: a two-day duty with five-day performance records a breach. A permission does not automatically trigger action. A receipt does not create a merits judgment. Remedy events require their own applicable rule and conditions.

## LM-024: Exceptions discretion and alternative branches

Dependencies: LM-023.

Implement nested exceptions, qualifying conditions, explicit discretionary choices, unknown facts, and supported alternative interpretations. Add branch labels and branch explosion limits.

Acceptance: an exception explains which duty it modifies. Missing facts never silently become false. An unresolved source conflict produces a limited result or explicit alternatives, and the branch limit is disclosed.

## LM-025: Operational queues resources and compliance behavior

Dependencies: LM-021, LM-023.

Add arrivals, queues, service capacity, failure and retry behavior, operational interventions, and compliance models. Separate legally specified timing from modeled processing time.

Acceptance: higher workload can cause missed duties without changing their legal existence. Conserved resource examples balance exactly under fixed precision. Every processing-time distribution is labeled and traceable to evidence or an assumption.

## LM-026: Random streams replay and browser parity

Dependencies: LM-021, LM-022, LM-025.

Implement specified pseudorandom streams, canonical inputs, engine retention metadata, deterministic rounding, checkpoints, and replay import and export. Expose the full run identity.

Acceptance: browser and Node replay agree on reference traces. Comparison inputs remain aligned despite different numbers of internal events. Changing engine or calendar version changes run identity and never silently claims exact replay.

## LM-027: Before and after comparison engine

Dependencies: LM-024, LM-026.

Run pinned baseline and bill models under shared circumstances. Align semantic checkpoints and derive changes in legal status, obligations, timing, operational load, and unresolved results.

Acceptance: only declared framework changes occur in default comparison. A disappeared step is explained rather than matched to an unrelated event. Mixed baseline dates and incompatible scenario inputs are rejected or explicitly disclosed.

## LM-028: Explanation trace and causal inspection

Dependencies: LM-020, LM-027.

Generate structured explanations with applied rules, predicates, exceptions, assumptions, source excerpts, causal parents, and unresolved alternatives. Use authored templates for public text.

Acceptance: every substantive outcome can be traced backward to its rules and inputs. An unknown outcome remains unknown in prose. No uncited generative sentence becomes part of the official trace.

## LM-029: Worker execution and responsiveness controls

Dependencies: LM-026, LM-028.

Move simulation and layout work behind a typed Web Worker protocol with progress messages, cancellation, payload limits, and safe worker restart. Retain a constrained fallback path for environments that cannot use the worker.

Acceptance: a long bounded run does not freeze scenario navigation. Cancellation releases resources and cannot append events to a newer run. The fallback reports its limits and produces the same results on supported fixtures.

## LM-030: Complete electronic filing executable pack

Dependencies: LM-018, LM-024, LM-027, LM-028, LM-029.

Implement the 14 scenario specifications, staged implementation, compliance failures, exact source mappings, and unresolved-interpretation branches. Add independently specified golden traces, AI-assisted source review, and pack coverage output.

Acceptance: missing amount, wrong agency, relation back, delivery failure, outages, and protected material all retain their qualifications. No branch invents enactment or a real filing receipt. All modeled deadlines have explicit calendar semantics.

## LM-031: Public shell catalog and first scene

Dependencies: LM-005, LM-006, LM-018.

Build the homepage, pack landing page, legislative status, version selector, short introduction, scenario chooser, empty states, and source-explorer route. Deliver a useful public reading experience before the full animation lands.

Acceptance: a new visitor can choose the wrong-agency example and inspect the bill without an account. Deep links pin a version. Phone and desktop layouts remain readable with JavaScript loading or a model unavailable.

## LM-032: Systems map and semantic scene projection

Dependencies: LM-031, LM-028, LM-030.

Render institutions, routes, decisions, selected objects, grouped subflows, custom illustrations, and stable layouts. Build semantic focus targets and a local-view navigation model.

Acceptance: selected actor, provision, and trace event remain synchronized. Large groups collapse without losing state. Moving a visual node cannot alter a rule, actor identity, or simulation outcome.

## LM-033: Playback timeline and animated journeys

Dependencies: LM-032, LM-029.

Add play, pause, step, speed, scrub, reset, event checkpoints, animated document travel, waiting indicators, and missed-duty states. Bind animation to the completed or streamed trace.

Acceptance: scrubbing reconstructs the correct state at each checkpoint. Reduced motion replaces movement with clear state updates. The first complete claim journey can be experienced from start to outcome.

## LM-034: Inspector and guided explanation journey

Dependencies: LM-033, LM-013.

Build rule, actor, exception, and source inspectors plus a short guided wrong-agency tour. Link each explanation to exact text and allow visitors to expand into detail and return to their position.

Acceptance: the demonstration works through mouse, touch, keyboard, and the initial sequence view. Visitors can answer why a date changed and identify its source. This is the first demonstration milestone, with remaining features clearly absent.

## LM-035: Synchronized comparison experience

Dependencies: LM-034, LM-027.

Build baseline and bill comparison with matched scenario inputs, semantic timeline alignment, changed-step highlighting, and a concise outcome difference view. Provide a single-column mobile comparison.

Acceptance: changing the selected legal framework never silently changes staffing or compliance. Baseline source dates are visible. A difference that depends on an assumption exposes that assumption beside the outcome.

## LM-036: Scenario controls and labeled sandbox forks

Dependencies: LM-035, LM-024.

Add schema-driven parameter controls, scenario validation, reset, local forks, modified-rule labels, and comparison against the published pack. Keep custom legal experiments separate from the official draft model.

Acceptance: invalid inputs explain their limits. A shared sandbox cannot appear as the published model. Reset restores the exact pinned scenario, seed, and assumptions.

## LM-037: Stress testing and sensitivity view

Dependencies: LM-036, LM-025.

Expose bounded workload, capacity, outage, compliance, and service-time controls. Add parameter sweeps, repeated runs, distributions, and methodology summaries for advanced users.

Acceptance: results distinguish statutory duties from predicted performance. Charts identify sample count, units, and assumptions. Excessive runs are bounded and cancelable; unsupported probability claims cannot be published.

## LM-038: Complete accessible sequence and mobile navigation

Dependencies: LM-034, LM-035, LM-036.

Complete parity between graph and sequence views, keyboard map navigation, focus restoration, announcements, zoom and reflow, touch controls, motion preferences, and mobile inspectors.

Acceptance: keyboard and screen-reader users can finish the same journey, change circumstances, compare results, and inspect a citation. Automated checks and documented assistive-technology journeys pass. No essential action requires dragging or hover.

## LM-039: Share links and reproducible exports

Dependencies: LM-036, LM-026.

Add pinned public scenario links, parameter allowlists, local JSON export, printable explanation reports, and version-aware import. Preserve run identity and distinguish local exports from server-verified results.

Acceptance: a shared link recreates the same supported run. Sensitive free text and private previews cannot leak into URLs or public exports. A withdrawn or incompatible release produces an explicit status rather than a substituted current model.

## LM-040: Search glossary and learning depth

Dependencies: LM-031, LM-034.

Add public pack and provision search, glossary links, related rules, basic and detailed explanation depth, and stable multilingual content keys. Provide source and status information in search results.

Acceptance: a visitor can find routing, presentment, and denial without knowing section numbers. Simplified wording keeps the same legal qualifications. Search indexes contain only published content.

## LM-041: Public explorer acceptance and static distribution

Dependencies: LM-035, LM-036, LM-037, LM-038, LM-039, LM-040.

Integrate all public journeys, complete first-pack editorial checks, measure reference performance, create a reproducible static public build, and document how to host it without consuming a new backend service slot.

Acceptance: the 14 scenarios, mobile and accessible journeys, source inspection, comparison, sandbox, stress view, and sharing pass. The public build runs without database or AI credentials. Report actual performance, unresolved coverage, and hosting limitations.

## LM-042: Database persistence and durable editorial records

Dependencies: LM-003, LM-016, LM-017.

Implement SQL migrations, repositories, revision guards, tenant keys, release tables, audit events, and the durable job store. Add isolated local development data and a no-credentials fixture mode.

Acceptance: stale edits return conflicts; transactions prevent partial metadata writes; cross-organization references fail. Migration rollback or a forward recovery procedure is tested against representative data.

## LM-043: Author authentication and authorization

Dependencies: LM-042, LM-005.

Integrate the selected maintained identity provider, memberships, contributor/editor/publisher roles, secure sessions, reauthentication, server authorization, and scoped preview access. Provide a local test identity adapter.

Acceptance: unauthenticated and wrong-organization requests fail across every author route. Revoking membership invalidates effective access. One owner can hold the necessary publishing roles without external-review requirements.

## LM-044: Secure source storage and import endpoints

Dependencies: LM-043, LM-009, LM-010, LM-011.

Add private object storage, bounded upload and fetch endpoints, source deduplication, quarantine state, signed access, and network restrictions for import URLs. Enqueue imports rather than parsing in requests.

Acceptance: private files cannot be fetched through public keys or predictable IDs. Tests block metadata endpoints, private addresses, redirect bypasses, archive bombs, and oversized files. Source bytes survive service restarts.

## LM-045: Authoring workbench and model editor

Dependencies: LM-044, LM-020, LM-028, LM-016.

Build the integrated source, rule, institution, assumption, scenario, and trace editor. Add draft validation, revision conflicts, change impact, preview, and manual correction paths.

Acceptance: an author creates a supported rule and scenario without editing application source. Invalid models cannot be previewed as valid. Saving one panel cannot overwrite a concurrent revision from another editor silently.

## LM-046: Durable import and compilation runner

Dependencies: LM-042, LM-044.

Implement lease-based job claiming, checkpoints, heartbeat, backoff, retries, cancellation, idempotency, dead-letter handling, and an independent worker entry point. Run bounded work within the initial service footprint.

Acceptance: killing the process during import or compilation allows safe resumption. Duplicate jobs do not duplicate versions or releases. Long jobs never keep an HTTP request open, and expired leases recover correctly.

## LM-047: Validation reports editorial review and publication

Dependencies: LM-045, LM-046, LM-004, LM-030.

Implement publication validation, scoped editorial attestation, immutable asset assembly, atomic release pointers, release manifests, and correction or withdrawal status. Connect the public runtime to published releases.

Acceptance: a failed upload cannot activate a partial release; stale validation cannot publish a newer revision. Missing provenance and unresolved critical dependencies fail appropriately. Rolling back a pointer restores the prior complete release.

## LM-048: Optional AI extraction adapter

Dependencies: LM-045, LM-046.

Add provider-neutral candidate extraction with schema validation, exact source spans, generation metadata, job budgets, cancellation, and a kill switch. Keep manual authoring fully supported.

Acceptance: malicious source instructions cannot invoke tools, alter permissions, or publish content. Candidates require editorial disposition. Missing credentials or a provider outage leaves manual authoring and all public simulations operational.

## LM-049: Revision maintenance and official source refresh

Dependencies: LM-047, LM-016, LM-010.

Add explicit refresh jobs, source change detection, impact reports, stale-content warnings, correction notes, and revision comparison. Use cached metadata and bounded fetches; support manually triggered refresh without a recurring service.

Acceptance: a changed official document creates a new candidate version and never overwrites a release. Rate limits and source failures retain the last valid snapshot with its original date. No automatic update publishes unreviewed rules.

## LM-050: Authoring API contracts and integration documentation

Dependencies: LM-047, LM-048, LM-049.

Finish OpenAPI, SDK examples, errors, pagination, idempotency, import/export schemas, author workflows, and operator documentation. Add organization export and safe import for moving supported packs.

Acceptance: a contract test client imports a fixture, checks a job, validates a model, publishes, and reads the release. Export contains no credentials or unintended private material. The full workflow works with AI disabled.

## LM-051: Server verification and optional saved scenarios

Dependencies: LM-039, LM-043, LM-046, LM-047.

Add bounded server replay, verification records, explicit saved-scenario retention, access control, deletion, and unguessable sharing identifiers where server saves are enabled. Default anonymous use remains local.

Acceptance: a forged client outcome fails recomputation. Private records cannot be read or enumerated by other users. Expired or deleted saves cease to resolve while immutable public model sources remain intact.

## LM-052: Telemetry privacy and operating diagnostics

Dependencies: LM-041, LM-050.

Implement structured operational logs, validation metrics, queue lag, execution budget reports, optional aggregate product events, redaction, retention, and diagnostics pages. Separate service health from optional provider health.

Acceptance: logs and analytics contain no scenario facts or source contents by default. Correlation IDs connect a failed job to its diagnostics. Provider failure does not make already published models unreadable.

## LM-053: Backups restore and audit integrity

Dependencies: LM-047, LM-052.

Configure verified backup procedures for database records, private sources, released assets, publication pointers, and signing material as applicable. Add integrity checkpoints and an isolated restore runbook.

Acceptance: restore a representative pack into an isolated environment and replay its pinned scenario. Measure recovery point and recovery time against the declared targets. A cache or local disk is never counted as the only backup.

## LM-054: Deployment migrations and rollback

Dependencies: LM-041, LM-050, LM-052, LM-053.

Provide Render deployment configuration, environment variable inventory, migration command, health endpoints, static-mode alternative, deployment verification, and rollback procedures. Keep worker separation optional.

Acceptance: stage a deployment using authorized resources, verify the deployed commit and release digest, restart during a job, and roll back safely. The setup documents current account constraints instead of provisioning paid resources or deleting another service automatically.

## LM-055: Performance budgets and large model behavior

Dependencies: LM-037, LM-038, LM-047, LM-052.

Profile the stated browser and model budgets. Add grouping, lazy loading, viewport-aware rendering, precomputed layouts, worker message optimization, cache limits, and bounded large-run handling where measurements justify them.

Acceptance: report the actual reference measurements and their environment. A large model remains navigable or gives a clear supported limit. Optimization preserves trace parity and accessibility; it cannot change legal results.

## LM-056: Adversarial review and security fixes

Dependencies: LM-050, LM-051, LM-054, LM-055.

Perform substantive AI-assisted source review and adversarial integration tests across imports, authorization, previews, caches, publication, job recovery, and executable models. Fix concrete findings and retain evidence tied to the reviewed commit.

Acceptance: parser abuse, tenant escape, SSRF, stored injection, CSRF where applicable, public-cache leakage, and resource exhaustion regressions pass. No actual critical or high-risk unresolved exploit is hidden by a checklist. An external-audit placeholder cannot block release by itself.

## LM-057: Release signing verification and key rotation

Dependencies: LM-004, LM-047, LM-053, LM-056.

Add publisher release signatures, public verification keys, key IDs, rotation, revocation metadata, secure signing credentials, and verification in browser and SDK. Keep content hashes and signature trust as separate concepts.

Acceptance: tampering and untrusted signatures fail; old authorized releases verify under the documented key policy; a compromised key can be revoked without silently trusting replacement content. Restore procedures include signing recovery or deliberate reissuance.

## LM-058: Second domain pack and domain reuse proof

Dependencies: LM-041, LM-047, LM-055.

Build the hypothetical permit and simple resource-allocation examples using published contracts. Demonstrate eligibility, exceptions, capacity, and resource accounting without electronic-filing-specific branches in engine code.

Acceptance: both examples run through the same compiler, simulator, source inspector, graph, and accessible sequence. No scenario claims macroeconomic or ecological forecasting capability. Required domain additions are explicit operators with tests and versioned capability declarations.

## LM-059: Shared SDK release and Ask Bill handoff

Dependencies: LM-050, LM-057, LM-058.

Publish or package the reusable SDK, schema documentation, semantic focus contract, compatibility fixtures, glossary access, and trace explanation examples. Provide a small headless consumer demonstration for a future Ask Bill application.

Acceptance: a separate consumer loads a signed release, resolves a citation, runs a scenario, and requests a semantic focus target without importing the Law Machine UI. No character, chat, voice, or 3D work is required for this unit.

## LM-060: Production acceptance and operational handoff

Dependencies: LM-051, LM-052, LM-053, LM-054, LM-055, LM-056, LM-057, LM-058, LM-059.

Run the complete product acceptance matrix, source and model checks, deployment verification, recovery evidence, accessibility journeys, performance checks, and public content review. Publish the operational manual, coverage statement, known limitations, and actual launch evidence.

Acceptance: both legislative domains, all electronic-filing scenarios, anonymous exploration, secure authoring, correction and withdrawal, deterministic replay, signing, restore, and rollback work on the release commit. Report merge, deployment, content coverage, and operational acceptance separately. Required checks pass and actual vulnerabilities are resolved; outside certification remains a separate optional status.
