# Law Machine architecture

Approved 16 October 2026. This describes the target implementation; implemented scope is recorded in PRs and acceptance evidence. See [development plan](DEVELOPMENT_PLAN.md) and [source references](reference/APPROVED_PLAN_2026-10-16.md#16-sources-and-reference-contracts).

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

The repository is neophilism/Law-Machine. Keep these boundaries:

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

## 14 Release completion criteria

The demonstration milestone is complete when a visitor can follow the wrong-agency journey, step through time, inspect the duty and receipt rules, and reach the exact draft language through both visual and accessible navigation. It remains labeled as a demonstration with partial feature scope.

The public explorer milestone is complete when the 14 curated scenarios, framework comparison, sandbox changes, bounded stress tests, source inspection, mobile sequence, and reproducible sharing pass against the same pinned models. It can be distributed as a static public experience.

The production milestone is complete when the publishing workflow, recovery procedures, security fixes, performance evidence, release verification, second-domain reuse, and SDK handoff pass. Merged PR counts alone do not establish this result.

## 15 Deferred extensions

Ask Bill's character and conversational interface, real-time coauthoring, public deliberation, automated legislative forecasting, arbitrary user-written plugins, headset experiences, institutional single sign-on, paid products, and actual government filing are outside this 60-unit plan. They may consume the resulting contracts through separately scoped plans. There is no payment integration in Law Machine launch scope.
