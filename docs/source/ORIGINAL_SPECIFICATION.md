# Law Machine Technical Architecture and Comprehensive PR Plan

Architecture and implementation specification

Prepared for Phillip Galinsky

16 October 2026

## 1 Purpose and recommended design

The Law Machine will let a visitor follow a claim, application, decision, document, dollar, or other object through a system governed by law. Visitors will see who acts, what authority applies, what must happen next, where discretion exists, what deadlines govern, and what changes under a bill. They will be able to change a circumstance, replay the result, and inspect the source of every legal rule and modeling assumption.

Build one TypeScript monorepo with a browser application and independent packages for legislation, citations, executable rules, simulation, and presentation contracts. Publish immutable model packages. Execute ordinary simulations locally in a Web Worker. Use a small server for private authoring, imports, publishing, and optional shared scenarios. PostgreSQL stores editorial records; object storage holds source files and released packages. The first implementation is a modular application, with service boundaries that can be separated when measured demand justifies it.

The first bill pack will cover the electronic filing legislation supplied in the conversation. It will explain that draft as a legislative proposal and compare it with a dated, sourced baseline. It will never imply that the legislation is enacted. The public website will not receive actual legal filings, issue government receipts, or calculate authoritative deadlines for a visitor's real case.

Ask Bill can later use the same bill versions, citations, glossary, scenarios, and explanation traces through the headless SDK. Its character, conversational interface, voice, and 3D production are separate product work. Law Machine development does not depend on them.

## 2 The public experience

### 2 1 An understandable entrance

Open with a short question and an immediately runnable example. For the first pack, use an experience such as What happens when a claim goes to the wrong agency. Offer three entry points: follow one claim, explore the system, and change a circumstance. The first scene should be understandable before the visitor sees the full graph.

A visitor can complete a short guided journey, expand any step into its institutional detail, or explore freely. Never require an account to read, simulate, inspect sources, or download a public model. Start with a manageable group of institutions and reveal their internal offices only when relevant.

### 2 2 Screen structure

| Area | Information and controls |
| --- | --- |
| Header | Bill name, version, legislative status, jurisdiction, baseline date, comparison mode |
| Main scene | Institutions, decisions, routes, queues, documents, and animated movement of the selected object |
| Scenario controls | Curated situation, factual parameters, assumptions, compliance setting, play, pause, step, reset |
| Inspector | Selected actor or rule, powers, duties, exceptions, evidence, exact quoted provision, source link |
| Timeline | Simulated events, deadlines, waiting periods, missed obligations, implementation phases |
| Outcome view | What changed, what did not resolve, affected actors, assumptions, alternative interpretations |

On phones, replace a wide graph with a sequence of expandable steps and a compact local map. Provide the graph as an optional view. The accessible sequence and graph must be projections of the same simulation trace.

### 2 3 Interaction modes

Follow one object shows a concrete journey. Explore the system exposes actors, powers, responsibilities, routes, and dependencies. Compare frameworks runs the same circumstances under a baseline and the bill. Change the model creates a visibly labeled sandbox fork. Stress the system adds workload, limited capacity, outages, or noncompliance and makes the empirical assumptions visible.

The default comparison changes only the legal framework and its explicit implementation conditions. Changing staff, funding, compliance, demand, or behavior is a separate visitor choice. A bill that requires an agency to act does not automatically cause that agency to comply in every simulation.

### 2 4 Visual treatment

Use a deliberate civic systems aesthetic with strong typography, custom institutional illustrations, legible labels, and restrained animation. Show documents and decisions moving along routes; animate exceptions and overdue obligations when those events occur. Use shape, labels, icons, and patterns as well as color. Avoid treating the system as a set of anonymous software boxes.

Use React Flow for interactive DOM nodes and SVG edges, with ELK for grouped layout and routing. This supports readable labels, selectable institutions, and detailed inspectors without a game engine. Precompute stable layouts for curated scenes. Author scene-specific positions when they explain a process better than automatic layout. Animation follows the event trace and never changes simulation behavior. React Flow and layout references are listed in Sources 1 and 2.

## 3 Architecture and implementation choices

| Layer | Choice | Reason |
| --- | --- | --- |
| Workspace | TypeScript strict mode, pnpm workspace, pinned supported Node runtime | One language for browser and server, explicit package boundaries |
| Web application | Next.js and React | Public document pages, interactive client routes, server routes for authoring |
| Graph presentation | React Flow and ELK, custom SVG assets | Interactive grouped systems maps and stable routing |
| Simulation | Pure TypeScript discrete event interpreter | Reproducible execution independent of the UI |
| Browser compute | Dedicated Web Worker | Keep graph navigation responsive during execution and layout |
| Validation | JSON Schema at package boundaries and runtime request validation | Portable contracts and rejection of malformed input |
| Persistence | PostgreSQL on Neon with SQL migrations | Transactional publishing, durable jobs, relational provenance |
| File storage | S3 compatible storage adapter | Preserve source bytes and immutable public releases |
| Backend | Next.js routes and bounded Node job runner | Small initial footprint and reusable job handlers |
| Search | Build-time public index and PostgreSQL full text for authors | Useful discovery without a separate search service |
| Testing | Vitest, property tests, Playwright, accessibility checks, adversarial import tests | Verify model behavior, UI parity, and trust boundaries |
| Hosting | Render compatible Node deployment with a static public bundle option | Fit the existing deployment environment and limited service capacity |

These are design choices, not claims that resources have been provisioned. Pin compatible stable dependency versions during implementation and maintain the lockfile. Avoid making the plan depend on a particular currently advertised free tier. Next.js supports self-hosting; its cache and deployment behavior must be configured deliberately for ephemeral or multiple instances. See Source 7.

### 3 1 Repository layout

The intended repository name is Law-Machine, subject to checking availability when the repository is created. Keep these boundaries:

| Path | Responsibility |
| --- | --- |
| apps/web | Public experience, authoring pages, API routes |
| apps/jobs | Durable job handlers and independently runnable worker entry point |
| packages/contracts | Versioned data schemas, API types, SDK compatibility |
| packages/legislation | Document tree, versions, source anchors, amendments |
| packages/provenance | Citations, evidence classifications, dependency tracking |
| packages/rules | Typed rule language, compiler, validation |
| packages/simulation | Calendar engine, scheduler, state transitions, traces |
| packages/presentation | Scene schema, view projections, explanation contract |
| packages/sdk | Headless public loading, source lookup, simulation, trace inspection |
| content/packs | Curated bill packs, scenarios, sources, release manifests |
| db and scripts | Migrations, imports, validation, release commands |
| docs and registry | Architecture, operational procedures, canonical roadmap |

The simulation and legislation packages cannot import React, Next.js, database clients, or provider SDKs. The renderer cannot invent legal transitions. Provider adapters cannot change domain models. Package import rules are enforced in CI.

### 3 2 End to end flow

First, preserve original source bytes and metadata. Second, parse the document into a versioned tree and source anchors. Third, create or revise the legal rules, evidence, and scenarios with explicit review records. Fourth, compile those inputs into a validated executable model. Fifth, run acceptance fixtures and assemble an immutable release. Sixth, publish a release pointer and public files. Finally, the browser loads a chosen release, runs a scenario locally, and projects its trace into the graph, timeline, and source inspector.

An optional AI extraction step sits between parsing and editorial review. It creates candidates only. AI does not execute legal rules, silently resolve ambiguous language, or publish its own output.

## 4 Legal document and provenance model

### 4 1 Preserve several representations

The source artifact contains original bytes, MIME type, size, origin URL or upload record, retrieved time, content digest, rights metadata, and claimed document status. The parsed document is a tree of provisions with stable internal identities, displayed numbering, normalized text, and links to the original representation. The legal model adds rules and relations. The executable model adds deliberately authored simulation behavior. The experience pack adds scenes, scenarios, glossary, and narrative explanations.

These representations are versioned separately. Fixing a scene layout need not rewrite the bill text. Correcting an OCR passage invalidates dependent citations and rules. A new bill version never silently replaces the source of an old shared scenario.

### 4 2 Core entities

| Entity | Required meaning |
| --- | --- |
| Bill and bill version | Publisher identity, jurisdiction, status, version label, source digest, dates |
| Provision | Stable ID within a version, parent, displayed citation, exact text, source span |
| Source and anchor | Origin, retrieval metadata, immutable bytes, text quote, structural selector, page or offsets |
| Baseline snapshot | Date and jurisdiction, statutes, regulations, relevant interpretations, coverage and gaps |
| Actor and authority | Institution or role, permitted powers, constraints, delegation, source |
| Rule | Preconditions, modal force, effects, exceptions, temporal scope, provenance |
| Obligation and deadline | Who owes what to whom, trigger, calendar rule, satisfaction and breach conditions |
| Assumption and evidence | Claim type, units, value or range, supporting material, limitations |
| Scenario | Initial facts, permitted inputs, scripted interventions, expected checkpoints |
| Model release | Content hashes, compiler and engine versions, compatibility, tests, editorial record |
| Run and trace | Pinned inputs, seed, events, applied rules, results, warnings, engine version |
| Scene and explanation | Visual mapping, public text, source links, related trace events |

Represent authority relationships separately from movement routes. A court's power to order an agency to act is not a route along which a document necessarily travels. Represent rights, duties, permissions, prohibitions, eligibility, and remedies as different concepts.

### 4 3 Anchors and citations

Use a composite source anchor: document version and digest, provision identity, exact text quote and surrounding text, plus offsets or page coordinates. Resolve against the pinned version first. If text changed, show that the old anchor refers to an older version. Do not repair it by silently linking to approximately similar current wording.

Every operative rule must cite one or more provisions or declared interpretation records. Every empirical number must identify its evidence or show that it is a visitor assumption. Explanatory text must state whether it describes source language, an interpretation, a simulation assumption, a measured observation, or an unknown.

### 4 4 Source adapters

Support pasted text and Markdown first, followed by DOCX, structured legislative XML, and PDF. Separate the US House Bill DTD and USLM adapters; detect supported formats rather than assuming all congressional XML has one schema. GovInfo documents USLM availability for a subset of publications, so PDF and other text formats remain necessary. Congress.gov is an optional official metadata and version source, not a prerequisite for unpublished drafts. See Sources 4 and 5.

For DOCX, preserve numbering and hierarchy, including tables that contain legal language. For PDFs, preserve page references and extraction confidence. Route scanned or uncertain passages to correction before they support executable rules. XML parsing disables external entities and network resolution. Apply file, archive expansion, page, depth, and processing limits. Store untrusted sources privately until release.

### 4 5 Amendments and baseline law

Model the bill's amendatory instructions separately from a consolidated text projection. A patch identifies the exact baseline version, target provision, operation, replacement text, and source. The compiler rejects absent, ambiguous, or mismatched targets. A generated consolidation remains labeled as a platform reconstruction unless it is an official source.

A baseline is an explicit, dated model of selected law and procedure. Federal procedure can vary by agency, court, jurisdiction, or controlling interpretation. Permit several baseline variants and an unresolved state; do not flatten all existing practice into one universal workflow. Mark unsupported branches and coverage gaps visibly. A model can explain a limited area accurately without claiming to implement the entire legal system.

## 5 Executable rules and simulation

### 5 1 A bounded rule language

Use a typed JSON rule language with allowlisted operations. Expressions can read declared facts, compare typed values, combine conditions, and apply supported calendar functions. Effects can create or route objects, update state, create or satisfy obligations, record breaches, schedule events, and record an explanation. Never evaluate uploaded JavaScript, SQL, Python, or arbitrary template expressions.

A rule carries an ID, model version, source references, classification, scope, effective conditions, trigger, guard, modal force, exceptions, effect, and explanation template. Explicit dependency and precedence links replace unexplained numerical priority. Unsupported language and unresolved conflicts yield diagnostics or alternative branches instead of invented certainty.

Illustrative rule record:

{

  "id": "EF-ROUTING-DUTY",

  "kind": "obligation",

  "sourceRefs": ["draft:44-4204-a"],

  "trigger": "coveredFilingReceived",

  "when": {"fact": "chapterApplies", "equals": true},

  "effect": {

    "operation": "createObligation",

    "actor": "receivingEntity",

    "action": "routeToResponsibleOffice",

    "deadline": {"value": 2, "unit": "businessDay", "calendar": "federal"}

  },

  "onBreach": "recordRoutingDelay",

  "explanationKey": "routingDuty"

}

This is a conceptual contract, not an implemented schema. Final schemas must also encode the trigger time, counting convention, applicability dates, exceptions, and supporting interpretation. The obligation does not itself manufacture a routing event. A compliance behavior or explicit intervention determines whether the agency performs it.

### 5 2 State and events

The state contains actors, objects, legal statuses, obligations, resources, simulation time, and scheduled events. An event contains simulated time, a stable event ID, type, actor, object, inputs, and causal parent. A rule evaluation produces zero or more state transitions and explanation records.

The scheduler orders events by simulated time and stable semantic tie breakers. Rules must declare how a receipt and an outage at the same instant interact. Where source language leaves event order unresolved, publish a declared interpretation or run both alternatives. Do not use incidental array order as law.

Use explicit unknown values and three-valued predicates. Unknown facts do not become false by default. A missing required fact can pause a branch, request a scenario choice, or produce several labeled outcomes. Permissions enable an option; they do not imply that an actor chooses it.

### 5 3 Determinism and replay

A reproducible run identifies the full model release digest, scenario version, normalized inputs, behavior assumptions, seed, simulation engine version, calendar version, and numeric rounding policy. Time comes from the scenario, never the device clock. Random draws use a specified pseudorandom generator and stable named streams so comparison runs use equivalent demand and service inputs.

Use integer quantities and fixed precision arithmetic for money and conserved resources. Define rounding and statistical sampling explicitly. Serialize canonically and verify browser and server parity. A seed alone does not guarantee replay if the engine or model changes, so retain compatible engine bundles for published releases or clearly report unsupported replay.

### 5 4 Temporal law and calendars

Track passage, enactment, staged implementation, applicability, transition rules, sunsets, and retroactivity separately. A visitor chooses an enactment assumption for an unenacted bill. No run silently treats a proposal as operative current law.

The calendar module distinguishes UTC instants, local civil dates, calendar days, business days, and calendar months. Each deadline declares timezone, trigger, inclusive or exclusive counting, observed holidays, cutoff time, extension rules, and end-of-month handling. Do not approximate six months as 180 days. Store the source and interpretation for each counting convention. Test leap years, daylight saving changes, holidays, weekends, and month-end boundaries.

### 5 5 Exceptions and legal conflicts

Exceptions are first-class rules linked to the duty or permission they qualify. Preserve nested exceptions, conditions, discretionary decisions, and an unresolved interpretation record. Show why an exception applied. When rules conflict without a justified precedence relationship, the compiler refuses to present a single definitive answer. The pack can still publish unaffected scenes and show an explicit alternative-interpretation comparison for the disputed branch.

### 5 6 Capacity and operational effects

Implement queues, service capacity, arrival patterns, retry behavior, and resource consumption as operational models alongside legal rules. A law may impose a two-day duty while the queue takes five days; the result should show a breach and any supported remedy, rather than pretending that the duty guarantees compliance.

Distinguish deterministic process consequences from forecasts about costs, staff behavior, fraud, or throughput. Queue assumptions need units and ranges. Funding authorization does not imply appropriation, availability, or successful procurement. When evidence is absent, use illustrative ranges and show sensitivity. Do not display a probability of success without a justified probability model.

### 5 7 Comparison and sensitivity

Run the same scenario under the selected baseline and bill model. Preserve shared exogenous inputs with named random streams. Align traces by semantic checkpoints such as received, routed, corrected, and denied, not by raw event index. Highlight changes in rights, process, timing, resource demand, and unresolved outcomes.

The advanced view permits parameter sweeps and seeded repeated runs. Show sample counts, input ranges, supported uncertainty, and methodology. Distinguish variation within an assumed model from uncertainty about whether the model is correct. The default result remains a concrete, understandable journey.

### 5 8 Execution limits

Cap source size, model nodes, active objects, event count, recursion, simulation horizon, repeated runs, worker CPU time, and output size. Cancel and restart workers safely. Detect loops and event storms; present partial results with a clear termination reason. Initial budgets are product targets, tuned through profiling, and must never silently truncate a supposedly complete legal outcome.

## 6 Release packages and public runtime

### 6 1 Immutable release contract

A release contains a manifest, supported schema range, model and engine identities, provision tree, citation index, compiled rules, calendars, scenarios, scenes, public evidence, translations, and a coverage report. Optional large attachments are referenced by digest. Separate the original source digest from canonical JSON digests. Document hash algorithms and canonicalization rules.

Publishing builds a staged package, verifies all references and tests, uploads immutable assets, and only then atomically updates the public release pointer. A failed upload cannot expose half a release. Record publisher identity, time, evidence, and content digest. HTTPS and content digests are required initially; release signing and key rotation are included in production hardening. A valid signature establishes package provenance, not legal correctness.

### 6 2 Availability and caching

Public immutable packages receive long-lived cache headers. Catalog and latest-version pointers use short bounded caching and can be refreshed independently. Draft content uses private, no-store responses and is excluded from public search and CDN paths. Never use an authenticated preview response to populate a public cache.

Previously loaded public packages remain usable if the authoring database, AI provider, or import source is unavailable. A static export mode publishes the public application and approved packs through an existing permitted static hosting route when no Render service slot is available. Authoring and live imports remain disabled in that mode. No new service or paid tier is provisioned by this plan.

### 6 3 Saved and shared scenarios

Anonymous runs remain in browser memory or optional local storage. Share links include only allowlisted hypothetical parameters and pinned public release IDs. A private author preview is never made public by a share button. Large saved scenarios use an explicit server save with an unguessable identifier, retention, and deletion rules. The server recomputes results for exports labeled verified; it never trusts a client-submitted outcome as evidence of its own execution.

## 7 Backend and data architecture

### 7 1 Initial deployment footprint

Use one Render-compatible web service when a slot is available, one isolated Neon database or database role within an authorized allocation, and one logical object-storage area. Keep public reads cached and simulations local. Run a bounded job runner in the service initially, with durable work and checkpoints in PostgreSQL. Restart or free-tier suspension delays work but does not lose it. The same worker entry point can move to a separate worker later without changing handlers.

Do not run import or compilation work inside an HTTP request. An authoring request creates a job and returns its identifier. The runner claims work with a lease, checkpoint, retry budget, backoff, heartbeat, and dead-letter status. Use transactional claim and idempotent output keys. A deployment or duplicate delivery must not publish a release twice.

PostgreSQL transactions protect release metadata and pointers. Large source bytes and compiled files remain in object storage. Do not depend on Render's local disk for durability. Use pooled database connections for application traffic and the supported direct connection for migrations or operations requiring session behavior. If row policies use tenant context, derive it from authenticated membership and set it transaction-locally; never let session state leak between pooled requests. See Source 9.

### 7 2 Tables and important constraints

| Table group | Records and constraints |
| --- | --- |
| Organization and access | organizations, memberships, roles, sessions; organization scoped authorization |
| Sources and documents | source_artifacts, documents, document_versions, provisions, anchors; immutable version identity |
| Legal model | baselines, actors, rules, exceptions, authorities, interpretations; version scoped references |
| Evidence and experience | evidence_items, assumptions, glossary_entries, scenarios, scenes; explicit provenance |
| Editorial lifecycle | revisions, review_records, validation_reports; optimistic revision check |
| Release | model_releases, release_assets, publication_pointers; unique release digest and atomic pointer |
| Operations | jobs, job_attempts, audit_events; lease and idempotency constraints |
| Optional saved material | saved_scenarios, retention_records; access and deletion lifecycle |

Use relational columns for identity, tenancy, status, indexing, and lifecycle. Use validated JSONB for versioned domain payloads. Enforce foreign keys and same-organization references. Unique constraints prevent duplicate publication. Authoring updates carry an expected revision and return a conflict when stale.

### 7 3 API surface

| Interface | Purpose |
| --- | --- |
| GET /api/v1/catalog | Public released packs, status, jurisdiction, versions |
| GET /api/v1/packs/{id}/releases/{digest} | Immutable public manifest and asset references |
| GET /api/v1/provisions/{version}/{id} | Exact public provision and citation metadata |
| POST /api/v1/author/imports | Authenticated bounded source import job |
| GET /api/v1/author/jobs/{id} | Scoped import or compilation state and diagnostics |
| PUT /api/v1/author/models/{id} | Revision guarded authoring update |
| POST /api/v1/author/models/{id}/validate | Durable validation job |
| POST /api/v1/author/models/{id}/publish | Authorized idempotent publication of a validated revision |
| POST /api/v1/scenarios | Optional explicit scenario save with retention policy |
| POST /api/v1/runs/verify | Bounded server replay for a signed or verified export |

Specify request and response schemas, authentication, pagination, error codes, idempotency behavior, and resource limits in OpenAPI. The ordinary browser run uses the local SDK and never needs the verify endpoint.

### 7 4 Provider boundaries

Define SourceProvider, ArtifactStore, IdentityProvider, AIExtractionProvider, JobStore, and TelemetrySink adapters. A local fixture implementation supports development without provider credentials. Store provider secrets only on the server. Source-fetch adapters enforce allowed protocols, public-address checks, redirect limits, DNS rebinding protection, timeouts, and maximum bytes. A parser cannot fetch arbitrary network resources.

## 8 Authoring and publication

### 8 1 Editorial workflow

Create a bill record, attach a version, inspect the parsed hierarchy, choose a baseline, author legal rules and institutional relationships, attach evidence, create scenarios, run simulations, inspect explanations, and publish a selected revision. The editor should show the provision, structured rule, graph, and trace together so mistakes can be corrected at their source.

Use contributor, editor, and publisher permissions plus organization administration. Permit one authorized owner to hold the necessary roles; there is no mandatory outside legal reviewer or human security auditor. Publishing requires completed validations and a recorded editorial attestation about modeled scope. AI-assisted source review and tests provide the default security evidence under the owner's policy. Actual vulnerabilities and failed required checks remain blockers for affected functionality.

### 8 2 Validation before publication

Validate schema compatibility, source integrity, references, citations, applicability, calendars, exception links, unresolved rule conflicts, deterministic execution, source-to-rule coverage, and scenario fixtures. Report modeled, explanatory-only, ambiguous, and unsupported provisions separately. Every operative rule and substantive outcome explanation must have provenance. No pack can claim full coverage merely because every section has a summary.

Permit partial packs with an accurate coverage statement. A critical unresolved rule blocks an authoritative-looking single-outcome scenario that depends on it; it does not block unrelated modeled scenarios. A publisher can release alternative interpretations with explicit explanations.

### 8 3 Optional AI assistance

An AI adapter may suggest actors, rules, glossary terms, scenarios, or summaries. Require schema-constrained candidates with exact source spans. Store provider and model identity, input and output hashes, processing time, estimated or measured cost, and disposition. Treat document instructions as untrusted content. Disable tools and external browsing for extraction by default.

Use job quotas, token limits, cancellation, per-organization budgets, and a provider kill switch. Manual authoring remains complete when no AI key is configured. No public chat product or runtime dependence on AI is included in Law Machine launch scope.

### 8 4 Changes and corrections

Changing source language produces an impact report listing affected anchors, rules, scenes, assumptions, scenarios, and translations. Mark those derivatives stale until checked. Publish a new immutable release and a clear correction note. Preserve prior releases for reproducibility unless a privacy or security incident requires withdrawal. Withdrawn releases show their status and avoid new sharing; retention and takedown rules govern what can remain available.

## 9 First bill pack for electronic filing

### 9 1 Scope and source handling

Create a versioned draft from the complete supplied legislative text when implementation begins, including its title and opening sections. The conversation excerpt supplies substantial operative language but begins partway through the findings and purposes. Preserve the original draft rather than reconstructing missing language without disclosure. Missing front matter does not prevent development of the covered scenarios.

The baseline research pack must preserve official source snapshots, retrieval dates, and relevant agency or court variations. Current 28 CFR 14.2 distinguishes receipt by the appropriate agency and includes transfer provisions. The simulator must model that sourced baseline separately from the draft's proposed preservation of earlier receipt. Do not apply the proposed rule to a visitor's existing claim. See Source 6.

### 9 2 Actors and objects

Actors include a claimant, an initial receiving entity, the responsible agency or office, portal operator, agency employee, court clerk, reviewing court, and oversight bodies where the relevant scenario uses them. Objects include the submission, attachments, receipt, routing record, deficiency notice, correction, protected-material notice, denial, and court filing.

Show three different concepts explicitly: the time the system receives material, whether that material meets legal requirements for presentment, and when a disposition or judicial-review clock begins. A receipt does not adjudicate a claim or prove its merits.

### 9 3 Required scenario suite

| Scenario | What the visitor must discover |
| --- | --- |
| Complete claim to responsible agency | Receipt, presentment elements, agency waiting period, later decisions |
| Complete claim to wrong agency | Transfer responsibility, retained dates under the draft, comparison with baseline |
| Agency misses routing duty | Breach remains visible; claimant protection and possible enforcement are separate |
| Monetary amount missing | Cure process and the draft's separate disposition-clock rule |
| Agency misses deficiency notice period | The special 15 business day language and its interpretation boundary |
| Correctable documentary defect | Cure period, relation back, remaining substantive requirements |
| Postal demand during existing correspondence | Existing-channel validity, replacement channel, 30 day transition |
| Primary system outage | Alternative channel and conditions for the draft's restoration extension |
| Pro se initial court filing | Electronic access, simultaneous fee-waiver application, preserved submission date |
| Final denial fails electronic delivery | Election, proof of delivery, and whether a review clock starts |
| Protected supporting information | Unclassified notice followed by authorized secure handling |
| Urgent matter | Flagging and triage duty, with no promise of emergency rescue or merits relief |
| FOIA component routing | Responsible-agency receipt and internal reassignment under the draft |
| Phased implementation | Immediate protections, 30 day interim intake, 180 day portal, 270 day court systems |

### 9 4 Deliberate edge cases

The draft uses ordinarily for the 60 second receipt target and initial urgent triage. Preserve that qualification instead of encoding an unconditional guarantee. The two business day routing requirement is a duty, and a stress scenario can show its breach. A security provision does not authorize transmitting classified information to an ordinary website; model the unclassified notice and authorized-channel instruction.

The interaction between the draft's omitted-amount rule, its 15 business day agency-notice provision, and preservation of a wrong-agency date needs an explicit interpretation record and fixtures. Model supported alternative readings if necessary. Do not silently choose the result that makes the draft look most favorable.

The software does not amend the legislation to eliminate an ambiguity. It identifies the affected text, shows the resulting branches, and lets the author revise the draft separately. Updated wording then receives a new source version and model release.

### 9 5 Worked comparison

Use a hypothetical complete claim sent to Agency A when Agency B is responsible. A scripted transfer delay is an operational assumption applied to both frameworks. The baseline branch applies the selected official sources and declared jurisdictional assumptions. The bill branch preserves receipt as its operative draft provisions direct and records Agency A's duty to route within two business days.

If Agency A takes five business days, the bill branch shows a missed routing obligation. It does not move the claim at two days simply because the law says it should. The visitor can inspect why dates differ, what remains uncertain, and which remedy has a source. No result says that the claimant wins the underlying damages claim.

## 10 Accessibility privacy and security

### 10 1 Accessibility requirements

Target WCAG 2.2 AA throughout the public and authoring interfaces. Provide keyboard operation, visible focus, zoom and reflow, text alternatives, touch controls, and motion controls. Every graph interaction has an equivalent list or sequence interaction. Explain state changes through appropriate live-region announcements without narrating every animation frame. React Flow's accessibility features help, but do not establish the accessibility of the completed application. See Sources 1 and 3.

Respect reduced motion, provide a persistent pause, and avoid time-limited choices. Screen readers must be able to run a scenario, follow events, inspect a provision, change a parameter, and compare outcomes. Public reading needs no identity verification or location disclosure. Keep language simple by default, with technical detail on demand.

### 10 2 Privacy and access

Public scenarios use hypothetical structured facts. Do not invite visitors to upload personal claims or describe sensitive circumstances in a free-text field. Keep anonymous settings local by default and provide clear deletion controls. Collect aggregate performance and completion events only when enabled; do not send scenario facts, free text, political profiles, or personal legal concerns to analytics.

Protect authoring with a maintained identity provider, secure sessions, CSRF defenses where applicable, server-side permission checks, and publisher reauthentication. Scope every document, job, preview, and file operation to its organization. Use distinct public and private storage prefixes or buckets and separate credentials. PostgreSQL row security is a defense in depth control with a non-owner application role; test it because table owners and bypass roles need special treatment. See Source 8.

### 10 3 Main threat cases

| Threat | Required control and evidence |
| --- | --- |
| Malicious source files | Quarantine, type validation, bounded parsers, no active content, safe download headers |
| XML entities and archive bombs | Disabled external resolution, expansion limits, adversarial fixtures |
| Server request forgery | Restricted import fetcher, address and redirect checks, no cloud metadata access |
| Cross-organization access | Server authorization, scoped storage, database constraints, negative tests |
| Published content injection | Escaped text, sanitized markup, strict content policy, no executable rule payloads |
| Forged or altered model | Release hashes, signing, verification, controlled publication pointer |
| Compute abuse | Model budgets, worker cancellation, API quotas, retry limits |
| Preview disclosure | Private no-store routes, scoped tokens, CDN exclusion tests |
| AI prompt injection | Isolated extraction, no tool authority, candidate-only outputs |
| Misleading legal certainty | Source classes, explicit assumptions, coverage limits, unresolved branch behavior |

## 11 Operations performance and validation

### 11 1 Initial measurable targets

These are engineering acceptance targets, not measurements already achieved. Test on a documented midrange phone profile and desktop profile, with repeatable network and CPU settings.

| Measure | Initial target |
| --- | --- |
| Public loading | LCP at or below 2.5 seconds on the documented warm-service test profile |
| Interaction | INP at or below 200 milliseconds in measured representative journeys |
| Layout stability | CLS at or below 0.1 |
| Model execution | At most 1 second for the reference 10,000 event run on the desktop profile |
| Visible scene | Smooth interaction with 100 visible nodes and 200 edges; larger graphs use grouping |
| Public first load | Target at most 1 MB compressed critical assets, excluding optional source downloads |
| Reference model | Target at most 2 MB compressed per initial curated pack |
| Accessibility | No unresolved critical automated finding and successful keyboard and screen-reader journeys |
| Release integrity | Every referenced public asset hash resolves and validates before pointer update |

Cold starts, free-tier suspension, and external source latency are measured separately. A cheap deployment is not represented as highly available. Publish observed performance and limitations rather than claiming an unmeasured service guarantee.

### 11 2 Verification strategy

Use unit tests for calendar functions, predicates, and rules. Use property tests for deterministic replay, obligation lifecycle, reachability limits, and resource conservation when applicable. Use small independently specified examples as reference results, rather than generating expectations from the implementation being tested. Test legal source interpretation and software behavior as separate evidence categories.

Use integration tests for imports, publication transactions, job recovery, and storage permissions. Browser tests cover the short journey, source inspection, comparison, parameter change, sharing, accessibility sequence, and mobile layouts. Adversarial tests cover parser abuse, tenant boundaries, malformed models, cache leaks, and runaway execution. Every published pack has versioned source-to-rule coverage and golden scenario traces.

### 11 3 Observability and recovery

Log structured request and job IDs, release identity, engine version, validation failure category, queue lag, cache behavior, and bounded execution metrics. Exclude document content and visitor facts. Public health checks report application readiness; publishing checks verify its specific database and storage dependencies. Avoid letting an optional source provider make all public reading unhealthy. Render's health-check behavior is described in Source 10.

Back up editorial metadata, source objects, releases, and publication pointers. Keep audit events append-only through the application role and export integrity checkpoints. Test restoration into an isolated environment. Initial targets are a 24 hour recovery point and a four hour recovery time for editorial data, conditional on the backup mechanism actually configured and verified. Rebuildable published assets should also have a retained backup, not an assumption that the hosting cache is durable.

Use expand-and-contract migrations, immutable release paths, reversible publication pointers, and documented rollback. A schema migration must not make old released public packs unreadable. Add a separate worker or cache service only after metrics show that the initial service is insufficient and resources are authorized.

### 11 4 Cost controls

Public runs make no paid AI requests. Authoring AI is optional and budgeted. Imports are cached by source identity and digest, deduplicated, and subject to refresh limits. Avoid object-store listing on every request; serve a manifest and fetch known keys. Apply storage retention to failed imports, duplicate sources, temporary exports, and job artifacts. Display actual provider usage when available.

Start without Redis, Kubernetes, a graph database, a vector database, a GPU service, or an always-on simulation cluster. The model describes institutional graphs, but that alone does not require a graph database. Published scenes and model packages cover the initial read workload. Pricing and account quotas must be checked at provisioning time; this specification does not assume paid capacity is available.

## 12 Reuse and supported limits

### 12 1 Ask Bill compatibility

The shared SDK exposes loadRelease, listProvisions, resolveCitation, getGlossaryEntry, runScenario, getTraceExplanation, and getSceneFocusTarget. Focus targets are stable semantic provision, actor, rule, or event IDs; screen coordinates are a renderer concern. This allows a future Ask Bill character to guide someone to an explanation without coupling legal reasoning to animation.

No consumer may substitute a fresh uncited summary for the release's executable rule or provenance. A future conversational service may explain and retrieve from this contract, with its own answer validation. This plan does not implement that service.

### 12 2 New legislative domains

Validate reuse with a second pack covering a simple hypothetical permit workflow and a small resource allocation example. It must use the same compiler and simulator without electronic-filing-specific conditionals in engine code. The resource example demonstrates typed quantities and conservation; it does not claim to be a macroeconomic forecasting model.

The core supports institutional processes, deadlines, rights, permissions, eligibility, and simple resource flows. Specialized tax, ecological, economic, or epidemiological predictions require explicit domain models and evidence. An imported bill without such a model can have a source explorer and explanatory graph while simulation remains unavailable or partial.

## 13 Comprehensive PR plan

### 13 1 Work unit and merge rules

The plan contains 60 stable work units, LM-001 through LM-060. These are plan IDs, not existing GitHub PR numbers. Each is intended to produce one reviewable PR; a later correction PR can link to the same unit. Use the exact ID at the start of the eventual PR title, retain real PR mappings, and count a unit complete only when all linked implementation PRs are confirmed merged. Product acceptance and deployment remain separate from merge status.

When adopted into a repository, use registry/roadmap.json as the repository-owned roadmap described by the current Engine Room roadmap contract. The count must match the 60 milestone records. Use real repository identity, version, planVerified, plannedPrCount, stable milestone IDs, and initially empty pullRequests arrays. Do not fabricate observation timestamps or PR mappings. Preserve the full architecture and plan documents as source material. Legacy plan paths, if any, redirect to the canonical file rather than becoming independent denominators.

LM-001 must verify the importer behavior against both Boardroom and Engine Room and reconcile any discrepancy before claiming integration. The existing systems are read-only dependencies for this project unless a separate change is required and authorized. This document does not modify either system or certify portfolio-wide registry consistency.

Every functional PR includes relevant automated tests, substantive AI-assisted source and security review, source-bound evidence, migration notes when needed, and a rollback or feature-disable route. Mandatory external human audit, paid penetration testing, or certification is not a prerequisite. Do not block unrelated work on unavailable optional providers. Failed required checks and actual unresolved vulnerabilities block the affected release.

Dependencies below are prerequisites for integration, not a requirement to leave independent preparation idle. Merge in dependency order, refresh branches as needed, and do not register a planned unit as approved work solely because a draft document exists.

### 13 2 Milestones

| Milestone | Units | Usable result |
| --- | --- | --- |
| Foundations | LM-001 to LM-008 | Repository, contracts, design primitives, validation fixtures |
| Legislative sources | LM-009 to LM-018 | Versioned source explorer and curated electronic-filing content |
| Executable system | LM-019 to LM-030 | Reproducible simulation and first full bill scenario suite |
| Public demonstration | LM-031 to LM-034 | Guided interactive claim journey with inspectable sources |
| Public explorer | LM-035 to LM-041 | Comparison, sandbox, stress tests, mobile, sharing, public index |
| Authoring and publishing | LM-042 to LM-050 | Secure reusable workflow for additional bills |
| Production and reuse | LM-051 to LM-060 | Recovery, deployment, hardening, domain reuse, launch acceptance |

### LM 001 Architecture decisions and roadmap registration

Dependencies: none.

Deliver the architecture records, package boundaries, scope, public-product boundaries, implementation milestones, and the adopted canonical roadmap. Inspect the current source contract used by Boardroom and Engine Room before producing its machine-readable representation. Preserve plan IDs and original plan text.

Acceptance: schema validation confirms 60 unique work units; both consumer contract fixtures import the same denominator and IDs; empty PR links remain unstarted. The PR title and actual GitHub number are distinct. No portfolio repository is modified as a side effect.

### LM 002 Workspace and continuous integration

Dependencies: LM-001.

Create the pnpm workspace, TypeScript configuration, application scaffold, dependency lockfile, linting, type checks, CI, and source-security checks. Set package import restrictions and a provider-free development command. Document the owner's AI review policy without imposing an external-auditor gate.

Acceptance: a clean checkout builds and runs tests without cloud credentials. A deliberately prohibited browser-to-database import fails CI. Secret scanning and dependency findings produce actionable results; real findings are resolved or the affected feature is disabled.

### LM 003 Domain contracts and identity

Dependencies: LM-002.

Define schemas for bill versions, provisions, actors, source anchors, rules, assumptions, scenarios, releases, and traces. Establish identifier scopes, version references, typed quantities, unknown values, and compatibility policy. Generate shared TypeScript boundary types.

Acceptance: positive and negative fixtures validate deterministically. Cross-version references, invalid quantities, duplicate IDs, and unsupported schema versions fail with precise diagnostics. A schema compatibility test protects retained public examples.

### LM 004 Canonical serialization and integrity

Dependencies: LM-003.

Implement raw source digests, canonical JSON serialization, manifest hashing, content-addressed asset names, and release verification. Exclude volatile metadata from content identity only by an explicit documented rule.

Acceptance: reordered JSON keys produce the same canonical digest; changed source bytes produce a different source digest; tampered, missing, or mismatched assets fail verification. Node and browser implementations agree on fixtures.

### LM 005 Design system and accessible interaction primitives

Dependencies: LM-002.

Create typography, color and shape semantics, buttons, dialogs, tabs, inspectors, focus management, motion preferences, responsive layout primitives, and loading and error states. Establish the public visual direction with institution and document illustrations.

Acceptance: components support keyboard navigation and documented contrast targets. Reduced motion and touch layouts work. Static previews show readable hierarchy on phone and desktop without reliance on color alone.

### LM 006 Headless SDK boundaries

Dependencies: LM-003 and LM-004.

Create the public package interfaces, manifest loader, schema negotiation, error vocabulary, and contract tests for a non-React consumer. Stub later simulation methods with explicit unsupported responses until their implementations land.

Acceptance: a command-line fixture loads a release and resolves a provision without importing the web application. An incompatible engine or schema fails explicitly. Package exports do not expose private provider or authoring code.

### LM 007 Coverage and capability declarations

Dependencies: LM-003.

Represent modeled, explanatory-only, ambiguous, and unsupported provisions. Declare which rule operations, calendars, and domain capabilities a pack requires. Create visible status labels for draft law, baseline date, hypothetical scenario, and partial coverage.

Acceptance: a pack requiring an unsupported operation cannot execute as complete. Coverage counts derive from explicit provision mappings. Public fixtures cannot lose their legislative-status label through a scene change.

### LM 008 Reference fixtures and independent test oracle

Dependencies: LM-003, LM-004, and LM-007.

Create a tiny toy law, source anchors, independently specified expected event traces, malformed examples, and a browser/server parity harness. Document the reasoning behind each expected result so tests do not merely reproduce implementation output.

Acceptance: altered routing, unknown handling, and source mappings are caught. The fixtures run without network access. Test data clearly separates invented toy law from real legislative text.

### LM 009 Text Markdown and DOCX ingestion

Dependencies: LM-003 and LM-008.

Implement original-byte preservation, basic source metadata, text and Markdown import, and bounded DOCX extraction with hierarchy and tables. Create import diagnostics and explicit source numbering records.

Acceptance: nested provisions and table text survive round trips; unsupported active content is never executed. Oversized or highly expanded archives are rejected. The original file and extracted text remain distinguishable.

### LM 010 Official XML and metadata adapters

Dependencies: LM-009.

Add separate USLM and House Bill DTD parsers with namespace and schema detection. Add optional Congress.gov and GovInfo metadata adapters with fixture caching, timeouts, and source version capture.

Acceptance: one fixture from each supported XML family parses correctly; unsupported schemas fail clearly. External entities cannot read files or initiate network calls. Unpublished local drafts work without an official-source API key.

### LM 011 PDF extraction and correction workflow

Dependencies: LM-009.

Add bounded text-PDF extraction with page anchors, extraction-quality diagnostics, and an optional isolated OCR interface. Provide correction records for low-confidence text and retain the original bytes.

Acceptance: columns, page breaks, scanned pages, and malformed files have explicit outcomes. A low-confidence passage cannot silently support an operative rule. OCR absence leaves the source readable and correctable rather than blocking unrelated imports.

### LM 012 Canonical provision tree and version persistence format

Dependencies: LM-009, LM-010, and LM-011.

Normalize supported inputs into the provision tree. Preserve displayed numbering, parent relationships, definitions, cross-references, original spans, and version-local identities. Build exportable source-explorer data.

Acceptance: renumbering does not overwrite prior versions. Duplicate section labels and missing parents yield diagnostics. Each rendered provision can recover its exact source version and text.

### LM 013 Citation resolver and source inspector data

Dependencies: LM-012 and LM-004.

Implement composite anchors, exact quote resolution, page links, version-aware cross-references, public source excerpts, and citation metadata for downstream consumers.

Acceptance: moved or edited text is marked stale rather than linked silently. All first-pack rule references resolve against their pinned source. Private source paths are excluded from public metadata.

### LM 014 Baseline snapshots and temporal applicability

Dependencies: LM-012 and LM-007.

Define dated baselines, jurisdiction and agency variants, effective-date expressions, enactment assumptions, transition periods, and unresolved interpretations. Add official-source snapshots for the first comparison area.

Acceptance: a proposal cannot load as enacted law by default. Runs before and after a staged effective date select different applicable provisions. A baseline gap is visible and cannot be filled with an invented rule.

### LM 015 Amendatory instructions and consolidated projections

Dependencies: LM-014 and LM-013.

Implement typed insert, replace, repeal, and renumber operations against exact baseline versions. Preserve the instruction and its projected result as different artifacts. Allow an unresolved patch to remain inspectable.

Acceptance: ambiguous or absent targets fail safely; old baseline bytes remain unchanged. A generated consolidation is labeled. Tests cover multiple amendments touching the same provision and declared precedence.

### LM 016 Version diff and dependency invalidation

Dependencies: LM-015.

Add text and structural diff, provisional provision correspondence, and the dependency index from source spans to rules, scenarios, scenes, and translations. Mark affected derivatives stale when source content changes.

Acceptance: editing an operative exception invalidates its dependent scenarios. Renumbering alone does not falsely assert unchanged meaning without checking text. Prior releases and citations remain reproducible.

### LM 017 Evidence assumptions and interpretation records

Dependencies: LM-013 and LM-014.

Implement source-language, interpretation, empirical-evidence, assumption, and unknown classifications. Add units, ranges, evidence limitations, conflict records, and review disposition.

Acceptance: an empirical delay cannot masquerade as statutory time. Every operative rule has provenance; every numerical forecast input has evidence or an assumption label. Alternative interpretations can coexist without one silently replacing another.

### LM 018 Electronic filing source and content pack

Dependencies: LM-013, LM-014, and LM-017.

Create the initial bill version, provision mappings, glossary, institutions, baseline source inventory, coverage report, and scenario specifications. Preserve the supplied wording and identify missing front matter for later attachment.

Acceptance: each of the 14 required scenario specifications identifies sources, expected checkpoints, assumptions, and unresolved points. The draft is labeled throughout. Current-law assertions cite dated official material and declared jurisdictional scope.

### LM 019 Rule language parser and validator

Dependencies: LM-003, LM-008, and LM-017.

Implement the typed allowlisted expression language, triggers, guards, effects, modal force, exceptions, and diagnostics. Establish static validation and operator capability negotiation.

Acceptance: type errors and arbitrary code payloads are rejected. Unknown predicates retain unknown semantics. Unsupported legal concepts generate diagnostics rather than falling back to a plausible-looking result.

### LM 020 Rule compiler and provenance graph

Dependencies: LM-019, LM-013, and LM-007.

Compile validated rules to immutable execution data and build source-to-effect dependencies. Check reachability, missing actors, explicit precedence, unresolved conflicts, and public explanation keys.

Acceptance: a transition without provenance fails validation. Conflicting rules cannot produce a single definitive branch without a recorded resolution. Compiled data is executable by both browser and server interpreters.

### LM 021 Simulation state and deterministic scheduler

Dependencies: LM-020 and LM-008.

Implement event queues, causal event IDs, typed state, stable ordering, scheduled actions, stop conditions, cancellation checkpoints, and event budgets. Separate simulated time from wall-clock animation.

Acceptance: the same release and inputs produce the same ordered trace. Zero-time loops and event storms terminate with a diagnostic. Pause and step do not change the final result.

### LM 022 Calendar and deadline engine

Dependencies: LM-019 and LM-014.

Implement versioned calendars, timezones, observed holidays, business days, calendar months, counting conventions, cutoff rules, and deadline extensions. Preserve the source of each legal counting choice.

Acceptance: independent fixtures cover leap days, daylight saving changes, month-end arithmetic, weekends, and holidays. Six months is not computed as 180 days. Missing counting rules create a visible interpretation requirement.

### LM 023 Duties rights permissions and breach

Dependencies: LM-021 and LM-022.

Implement obligation creation, satisfaction, breach, rights preservation, permissions, prohibitions, and source-supported remedies. Keep actor behavior separate from legal force.

Acceptance: a two-day duty with five-day performance records a breach. A permission does not automatically trigger action. A receipt does not create a merits judgment. Remedy events require their own applicable rule and conditions.

### LM 024 Exceptions discretion and alternative branches

Dependencies: LM-023.

Implement nested exceptions, qualifying conditions, explicit discretionary choices, unknown facts, and supported alternative interpretations. Add branch labels and branch explosion limits.

Acceptance: an exception explains which duty it modifies. Missing facts never silently become false. An unresolved source conflict produces a limited result or explicit alternatives, and the branch limit is disclosed.

### LM 025 Operational queues resources and compliance behavior

Dependencies: LM-021 and LM-023.

Add arrivals, queues, service capacity, failure and retry behavior, operational interventions, and compliance models. Separate legally specified timing from modeled processing time.

Acceptance: higher workload can cause missed duties without changing their legal existence. Conserved resource examples balance exactly under fixed precision. Every processing-time distribution is labeled and traceable to evidence or an assumption.

### LM 026 Random streams replay and browser parity

Dependencies: LM-021, LM-022, and LM-025.

Implement specified pseudorandom streams, canonical inputs, engine retention metadata, deterministic rounding, checkpoints, and replay import and export. Expose the full run identity.

Acceptance: browser and Node replay agree on reference traces. Comparison inputs remain aligned despite different numbers of internal events. Changing engine or calendar version changes run identity and never silently claims exact replay.

### LM 027 Before and after comparison engine

Dependencies: LM-024 and LM-026.

Run pinned baseline and bill models under shared circumstances. Align semantic checkpoints and derive changes in legal status, obligations, timing, operational load, and unresolved results.

Acceptance: only declared framework changes occur in default comparison. A disappeared step is explained rather than matched to an unrelated event. Mixed baseline dates and incompatible scenario inputs are rejected or explicitly disclosed.

### LM 028 Explanation trace and causal inspection

Dependencies: LM-020 and LM-027.

Generate structured explanations with applied rules, predicates, exceptions, assumptions, source excerpts, causal parents, and unresolved alternatives. Use authored templates for public text.

Acceptance: every substantive outcome can be traced backward to its rules and inputs. An unknown outcome remains unknown in prose. No uncited generative sentence becomes part of the official trace.

### LM 029 Worker execution and responsiveness controls

Dependencies: LM-026 and LM-028.

Move simulation and layout work behind a typed Web Worker protocol with progress messages, cancellation, payload limits, and safe worker restart. Retain a constrained fallback path for environments that cannot use the worker.

Acceptance: a long bounded run does not freeze scenario navigation. Cancellation releases resources and cannot append events to a newer run. The fallback reports its limits and produces the same results on supported fixtures.

### LM 030 Complete electronic filing executable pack

Dependencies: LM-018, LM-024, LM-027, LM-028, and LM-029.

Implement the 14 scenario specifications, staged implementation, compliance failures, exact source mappings, and unresolved-interpretation branches. Add independently specified golden traces, AI-assisted source review, and pack coverage output.

Acceptance: missing amount, wrong agency, relation back, delivery failure, outages, and protected material all retain their qualifications. No branch invents enactment or a real filing receipt. All modeled deadlines have explicit calendar semantics.

### LM 031 Public shell catalog and first scene

Dependencies: LM-005, LM-006, and LM-018.

Build the homepage, pack landing page, legislative status, version selector, short introduction, scenario chooser, empty states, and source-explorer route. Deliver a useful public reading experience before the full animation lands.

Acceptance: a new visitor can choose the wrong-agency example and inspect the bill without an account. Deep links pin a version. Phone and desktop layouts remain readable with JavaScript loading or a model unavailable.

### LM 032 Systems map and semantic scene projection

Dependencies: LM-031, LM-028, and LM-030.

Render institutions, routes, decisions, selected objects, grouped subflows, custom illustrations, and stable layouts. Build semantic focus targets and a local-view navigation model.

Acceptance: selected actor, provision, and trace event remain synchronized. Large groups collapse without losing state. Moving a visual node cannot alter a rule, actor identity, or simulation outcome.

### LM 033 Playback timeline and animated journeys

Dependencies: LM-032 and LM-029.

Add play, pause, step, speed, scrub, reset, event checkpoints, animated document travel, waiting indicators, and missed-duty states. Bind animation to the completed or streamed trace.

Acceptance: scrubbing reconstructs the correct state at each checkpoint. Reduced motion replaces movement with clear state updates. The first complete claim journey can be experienced from start to outcome.

### LM 034 Inspector and guided explanation journey

Dependencies: LM-033 and LM-013.

Build rule, actor, exception, and source inspectors plus a short guided wrong-agency tour. Link each explanation to exact text and allow visitors to expand into detail and return to their position.

Acceptance: the demonstration works through mouse, touch, keyboard, and the initial sequence view. Visitors can answer why a date changed and identify its source. This is the first demonstration milestone, with remaining features clearly absent.

### LM 035 Synchronized comparison experience

Dependencies: LM-034 and LM-027.

Build baseline and bill comparison with matched scenario inputs, semantic timeline alignment, changed-step highlighting, and a concise outcome difference view. Provide a single-column mobile comparison.

Acceptance: changing the selected legal framework never silently changes staffing or compliance. Baseline source dates are visible. A difference that depends on an assumption exposes that assumption beside the outcome.

### LM 036 Scenario controls and labeled sandbox forks

Dependencies: LM-035 and LM-024.

Add schema-driven parameter controls, scenario validation, reset, local forks, modified-rule labels, and comparison against the published pack. Keep custom legal experiments separate from the official draft model.

Acceptance: invalid inputs explain their limits. A shared sandbox cannot appear as the published model. Reset restores the exact pinned scenario, seed, and assumptions.

### LM 037 Stress testing and sensitivity view

Dependencies: LM-036 and LM-025.

Expose bounded workload, capacity, outage, compliance, and service-time controls. Add parameter sweeps, repeated runs, distributions, and methodology summaries for advanced users.

Acceptance: results distinguish statutory duties from predicted performance. Charts identify sample count, units, and assumptions. Excessive runs are bounded and cancelable; unsupported probability claims cannot be published.

### LM 038 Complete accessible sequence and mobile navigation

Dependencies: LM-034, LM-035, and LM-036.

Complete parity between graph and sequence views, keyboard map navigation, focus restoration, announcements, zoom and reflow, touch controls, motion preferences, and mobile inspectors.

Acceptance: keyboard and screen-reader users can finish the same journey, change circumstances, compare results, and inspect a citation. Automated checks and documented assistive-technology journeys pass. No essential action requires dragging or hover.

### LM 039 Share links and reproducible exports

Dependencies: LM-036 and LM-026.

Add pinned public scenario links, parameter allowlists, local JSON export, printable explanation reports, and version-aware import. Preserve run identity and distinguish local exports from server-verified results.

Acceptance: a shared link recreates the same supported run. Sensitive free text and private previews cannot leak into URLs or public exports. A withdrawn or incompatible release produces an explicit status rather than a substituted current model.

### LM 040 Search glossary and learning depth

Dependencies: LM-031 and LM-034.

Add public pack and provision search, glossary links, related rules, basic and detailed explanation depth, and stable multilingual content keys. Provide source and status information in search results.

Acceptance: a visitor can find routing, presentment, and denial without knowing section numbers. Simplified wording keeps the same legal qualifications. Search indexes contain only published content.

### LM 041 Public explorer acceptance and static distribution

Dependencies: LM-035 through LM-040, inclusive.

Integrate all public journeys, complete first-pack editorial checks, measure reference performance, create a reproducible static public build, and document how to host it without consuming a new backend service slot.

Acceptance: the 14 scenarios, mobile and accessible journeys, source inspection, comparison, sandbox, stress view, and sharing pass. The public build runs without database or AI credentials. Report actual performance, unresolved coverage, and hosting limitations.

### LM 042 Database persistence and durable editorial records

Dependencies: LM-003, LM-016, and LM-017.

Implement SQL migrations, repositories, revision guards, tenant keys, release tables, audit events, and the durable job store. Add isolated local development data and a no-credentials fixture mode.

Acceptance: stale edits return conflicts; transactions prevent partial metadata writes; cross-organization references fail. Migration rollback or a forward recovery procedure is tested against representative data.

### LM 043 Author authentication and authorization

Dependencies: LM-042 and LM-005.

Integrate the selected maintained identity provider, memberships, contributor/editor/publisher roles, secure sessions, reauthentication, server authorization, and scoped preview access. Provide a local test identity adapter.

Acceptance: unauthenticated and wrong-organization requests fail across every author route. Revoking membership invalidates effective access. One owner can hold the necessary publishing roles without external-review requirements.

### LM 044 Secure source storage and import endpoints

Dependencies: LM-043, LM-009, LM-010, and LM-011.

Add private object storage, bounded upload and fetch endpoints, source deduplication, quarantine state, signed access, and network restrictions for import URLs. Enqueue imports rather than parsing in requests.

Acceptance: private files cannot be fetched through public keys or predictable IDs. Tests block metadata endpoints, private addresses, redirect bypasses, archive bombs, and oversized files. Source bytes survive service restarts.

### LM 045 Authoring workbench and model editor

Dependencies: LM-044, LM-020, LM-028, and LM-016.

Build the integrated source, rule, institution, assumption, scenario, and trace editor. Add draft validation, revision conflicts, change impact, preview, and manual correction paths.

Acceptance: an author creates a supported rule and scenario without editing application source. Invalid models cannot be previewed as valid. Saving one panel cannot overwrite a concurrent revision from another editor silently.

### LM 046 Durable import and compilation runner

Dependencies: LM-042 and LM-044.

Implement lease-based job claiming, checkpoints, heartbeat, backoff, retries, cancellation, idempotency, dead-letter handling, and an independent worker entry point. Run bounded work within the initial service footprint.

Acceptance: killing the process during import or compilation allows safe resumption. Duplicate jobs do not duplicate versions or releases. Long jobs never keep an HTTP request open, and expired leases recover correctly.

### LM 047 Validation reports editorial review and publication

Dependencies: LM-045, LM-046, LM-004, and LM-030.

Implement publication validation, scoped editorial attestation, immutable asset assembly, atomic release pointers, release manifests, and correction or withdrawal status. Connect the public runtime to published releases.

Acceptance: a failed upload cannot activate a partial release; stale validation cannot publish a newer revision. Missing provenance and unresolved critical dependencies fail appropriately. Rolling back a pointer restores the prior complete release.

### LM 048 Optional AI extraction adapter

Dependencies: LM-045 and LM-046.

Add provider-neutral candidate extraction with schema validation, exact source spans, generation metadata, job budgets, cancellation, and a kill switch. Keep manual authoring fully supported.

Acceptance: malicious source instructions cannot invoke tools, alter permissions, or publish content. Candidates require editorial disposition. Missing credentials or a provider outage leaves manual authoring and all public simulations operational.

### LM 049 Revision maintenance and official source refresh

Dependencies: LM-047, LM-016, and LM-010.

Add explicit refresh jobs, source change detection, impact reports, stale-content warnings, correction notes, and revision comparison. Use cached metadata and bounded fetches; support manually triggered refresh without a recurring service.

Acceptance: a changed official document creates a new candidate version and never overwrites a release. Rate limits and source failures retain the last valid snapshot with its original date. No automatic update publishes unreviewed rules.

### LM 050 Authoring API contracts and integration documentation

Dependencies: LM-047, LM-048, and LM-049.

Finish OpenAPI, SDK examples, errors, pagination, idempotency, import/export schemas, author workflows, and operator documentation. Add organization export and safe import for moving supported packs.

Acceptance: a contract test client imports a fixture, checks a job, validates a model, publishes, and reads the release. Export contains no credentials or unintended private material. The full workflow works with AI disabled.

### LM 051 Server verification and optional saved scenarios

Dependencies: LM-039, LM-043, LM-046, and LM-047.

Add bounded server replay, verification records, explicit saved-scenario retention, access control, deletion, and unguessable sharing identifiers where server saves are enabled. Default anonymous use remains local.

Acceptance: a forged client outcome fails recomputation. Private records cannot be read or enumerated by other users. Expired or deleted saves cease to resolve while immutable public model sources remain intact.

### LM 052 Telemetry privacy and operating diagnostics

Dependencies: LM-041 and LM-050.

Implement structured operational logs, validation metrics, queue lag, execution budget reports, optional aggregate product events, redaction, retention, and diagnostics pages. Separate service health from optional provider health.

Acceptance: logs and analytics contain no scenario facts or source contents by default. Correlation IDs connect a failed job to its diagnostics. Provider failure does not make already published models unreadable.

### LM 053 Backups restore and audit integrity

Dependencies: LM-047 and LM-052.

Configure verified backup procedures for database records, private sources, released assets, publication pointers, and signing material as applicable. Add integrity checkpoints and an isolated restore runbook.

Acceptance: restore a representative pack into an isolated environment and replay its pinned scenario. Measure recovery point and recovery time against the declared targets. A cache or local disk is never counted as the only backup.

### LM 054 Deployment migrations and rollback

Dependencies: LM-041, LM-050, LM-052, and LM-053.

Provide Render deployment configuration, environment variable inventory, migration command, health endpoints, static-mode alternative, deployment verification, and rollback procedures. Keep worker separation optional.

Acceptance: stage a deployment using authorized resources, verify the deployed commit and release digest, restart during a job, and roll back safely. The setup documents current account constraints instead of provisioning paid resources or deleting another service automatically.

### LM 055 Performance budgets and large model behavior

Dependencies: LM-037, LM-038, LM-047, and LM-052.

Profile the stated browser and model budgets. Add grouping, lazy loading, viewport-aware rendering, precomputed layouts, worker message optimization, cache limits, and bounded large-run handling where measurements justify them.

Acceptance: report the actual reference measurements and their environment. A large model remains navigable or gives a clear supported limit. Optimization preserves trace parity and accessibility; it cannot change legal results.

### LM 056 Adversarial review and security fixes

Dependencies: LM-050, LM-051, LM-054, and LM-055.

Perform substantive AI-assisted source review and adversarial integration tests across imports, authorization, previews, caches, publication, job recovery, and executable models. Fix concrete findings and retain evidence tied to the reviewed commit.

Acceptance: parser abuse, tenant escape, SSRF, stored injection, CSRF where applicable, public-cache leakage, and resource exhaustion regressions pass. No actual critical or high-risk unresolved exploit is hidden by a checklist. An external-audit placeholder cannot block release by itself.

### LM 057 Release signing verification and key rotation

Dependencies: LM-004, LM-047, LM-053, and LM-056.

Add publisher release signatures, public verification keys, key IDs, rotation, revocation metadata, secure signing credentials, and verification in browser and SDK. Keep content hashes and signature trust as separate concepts.

Acceptance: tampering and untrusted signatures fail; old authorized releases verify under the documented key policy; a compromised key can be revoked without silently trusting replacement content. Restore procedures include signing recovery or deliberate reissuance.

### LM 058 Second domain pack and domain reuse proof

Dependencies: LM-041, LM-047, and LM-055.

Build the hypothetical permit and simple resource-allocation examples using published contracts. Demonstrate eligibility, exceptions, capacity, and resource accounting without electronic-filing-specific branches in engine code.

Acceptance: both examples run through the same compiler, simulator, source inspector, graph, and accessible sequence. No scenario claims macroeconomic or ecological forecasting capability. Required domain additions are explicit operators with tests and versioned capability declarations.

### LM 059 Shared SDK release and Ask Bill handoff

Dependencies: LM-050, LM-057, and LM-058.

Publish or package the reusable SDK, schema documentation, semantic focus contract, compatibility fixtures, glossary access, and trace explanation examples. Provide a small headless consumer demonstration for a future Ask Bill application.

Acceptance: a separate consumer loads a signed release, resolves a citation, runs a scenario, and requests a semantic focus target without importing the Law Machine UI. No character, chat, voice, or 3D work is required for this unit.

### LM 060 Production acceptance and operational handoff

Dependencies: LM-051 through LM-059, inclusive.

Run the complete product acceptance matrix, source and model checks, deployment verification, recovery evidence, accessibility journeys, performance checks, and public content review. Publish the operational manual, coverage statement, known limitations, and actual launch evidence.

Acceptance: both legislative domains, all electronic-filing scenarios, anonymous exploration, secure authoring, correction and withdrawal, deterministic replay, signing, restore, and rollback work on the release commit. Report merge, deployment, content coverage, and operational acceptance separately. Required checks pass and actual vulnerabilities are resolved; outside certification remains a separate optional status.

## 14 Release completion criteria

The demonstration milestone is complete when a visitor can follow the wrong-agency journey, step through time, inspect the duty and receipt rules, and reach the exact draft language through both visual and accessible navigation. It remains labeled as a demonstration with partial feature scope.

The public explorer milestone is complete when the 14 curated scenarios, framework comparison, sandbox changes, bounded stress tests, source inspection, mobile sequence, and reproducible sharing pass against the same pinned models. It can be distributed as a static public experience.

The production milestone is complete when the publishing workflow, recovery procedures, security fixes, performance evidence, release verification, second-domain reuse, and SDK handoff pass. Merged PR counts alone do not establish this result.

## 15 Deferred extensions

Ask Bill's character and conversational interface, real-time coauthoring, public deliberation, automated legislative forecasting, arbitrary user-written plugins, headset experiences, institutional single sign-on, paid products, and actual government filing are outside this 60-unit plan. They may consume the resulting contracts through separately scoped plans. There is no payment integration in Law Machine launch scope.

## 16 Sources and reference contracts

The following primary technical sources were checked on 16 October 2026. They support the selected capabilities and implementation cautions; the system design, work breakdown, performance targets, and resource strategy are engineering recommendations. The supplied electronic-filing draft is the source for proposed-law examples. Its formal title and complete front matter should be attached when the first pack is implemented.

1. React Flow accessibility documentation. https://reactflow.dev/learn/advanced-use/accessibility

2. React Flow layout documentation, including ELK integration. https://reactflow.dev/learn/layouting/layouting

3. W3C Web Content Accessibility Guidelines 2.2. https://www.w3.org/TR/WCAG22/

4. Library of Congress Congress.gov API repository and documentation. https://github.com/LibraryOfCongress/api.congress.gov

5. Government Publishing Office Beta USLM XML description and supported source families. https://www.govinfo.gov/features/beta-uslm-xml

6. Electronic Code of Federal Regulations, 28 CFR 14.2, Administrative claim when presented. https://www.ecfr.gov/current/title-28/chapter-I/part-14/section-14.2

7. Next.js self-hosting documentation. https://nextjs.org/docs/app/guides/self-hosting

8. PostgreSQL row security documentation. https://www.postgresql.org/docs/current/ddl-rowsecurity.html

9. Neon connection pooling documentation. https://neon.com/docs/connect/connection-pooling

10. Render health-check documentation. https://render.com/docs/health-checks

11. MDN Using Web Workers. https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers

12. Engine Room repository-owned roadmap contract, read from the default branch on 16 October 2026. https://github.com/neophilism/Engine-Room/blob/main/docs/REPOSITORY_ROADMAP_CONTRACT.md

13. Engine Room active roadmap representation inspected on 16 October 2026. https://github.com/neophilism/Engine-Room/blob/main/registry/roadmap.json

14. Engine Room owner security review policy and repository instructions, read on 16 October 2026. https://github.com/neophilism/Engine-Room/blob/main/AGENTS.md
