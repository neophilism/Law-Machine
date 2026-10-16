# ADR-0002: Modular TypeScript application with a pure domain core

Status: accepted design; workspace implementation belongs to LM-002.

| Path | Owns | May depend on |
| --- | --- | --- |
| packages/contracts | Schemas, stable identities, API/SDK types | Pure validation primitives |
| packages/legislation | Versioned provisions, amendments, anchors | contracts |
| packages/provenance | Evidence classes, citations, dependency tracking | contracts, legislation |
| packages/rules | Bounded rule language and compiler | contracts, legislation, provenance |
| packages/simulation | Calendar, scheduler, transitions, traces | contracts, rules |
| packages/presentation | Semantic scenes, trace projections | contracts; public domain types |
| packages/sdk | Headless release loading, resolution, execution | Public packages above |
| apps/web | Public UI and authorized authoring routes | SDK, presentation; server-only adapters |
| apps/jobs | Durable import/compile/validation handlers | Domain packages; server-only adapters |
| content/packs | Versioned sources, rules, scenarios, scenes | Published schemas |
| db | Migrations and editorial storage | Server-only code |

Browser modules cannot import database drivers, secrets, authoring services or provider SDKs. Domain packages cannot import React or Next.js. A renderer projects events and cannot alter legal outcomes. Enforce these boundaries in LM-002.

The planned runtime is Next.js/React with React Flow/ELK presentation, pure deterministic TypeScript simulation in a Web Worker, PostgreSQL editorial records and S3-compatible artifact storage. Pin compatible maintained versions during LM-002 and later adapter implementation. Do not provision services in the foundation.

Public simulation is local and provider-independent. Optional AI extraction produces untrusted editorial candidates. Static public distribution remains possible without an authoring server. Use one modular application until measurements justify splitting services.
