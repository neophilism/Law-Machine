# ADR 0001: one modular TypeScript application with a pure simulation core

Status: accepted design, 2026-10-16. Implementation proceeds through LM-002 onward.

Law Machine needs explainable legal models that can be reused by multiple interfaces and replayed without ongoing AI calls. Use a strict TypeScript pnpm monorepo with independent legislation, citation, rules, simulation, release, and presentation-contract packages; a Next.js/React web application; React Flow/ELK views; a Web Worker for ordinary visitor simulation; and later PostgreSQL/object storage adapters for authoring and immutable publication.

The pure core cannot import UI frameworks, database libraries, or provider SDKs. Renderers project a trace; they do not decide legal outcomes. AI can propose cited candidates for editorial review but cannot execute or publish law. Exact source versions, baseline dates, interpretations, empirical assumptions, and unknowns remain distinct.

Run deterministic discrete events with pinned engine/calendar/model versions, fixed-precision quantities, named random streams, and replay traces. A legal duty does not force compliance: delayed behavior emits a breach and only sourced remedies. Accessible sequence and visual graph views consume the same trace. Later Ask Bill uses stable semantic IDs through the SDK, with no dependency on character or conversation implementation.

Begin with one web service and bounded durable jobs rather than provisioning distributed services. No service, paid dependency, production credential, or deployment is created by LM-001. A static public explorer precedes full authoring infrastructure.

Consequences: the core is portable and testable without cloud credentials, but domain semantics and source coverage require explicit fixtures. Dependency import checks start in LM-002; schema and identity work in LM-003; the engine begins in LM-019. The complete design and risk/acceptance details are in `docs/ARCHITECTURE.md`.
