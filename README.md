# Law Machine

Follow a hypothetical claim, application, decision, document or resource through a source-linked model of law. Compare a dated baseline with a proposed bill, change circumstances, and inspect the rules and assumptions behind each outcome.

This repository retains all 60 approved milestones and has 29 merged milestone implementations as of the 2026-10-17 checkpoint. The TypeScript simulation primitives now cover versioned sources, deterministic scheduling, obligations, comparisons and source-linked explanations; a real browser worker runs **fictional fixtures only**. The production electronic-filing pack and public legal simulator are **not** complete or deployed. See [current handoff](docs/HANDOFF.md) for merged units, open PRs and blocked dependencies.

## Start here

- [Agent instructions](AGENTS.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Complete development plan](docs/DEVELOPMENT_PLAN.md)
- [Canonical PR registry](registry/prs.json) and [format](registry/PR_FORMAT.md)
- [Implementation handoff](docs/HANDOFF.md)
- [Security scope and threat model](security/THREAT_MODEL.md)
- [Original specification](docs/source/ORIGINAL_SPECIFICATION.md)

## Develop and verify

Use Node **24.19.0**, pnpm **11.25.0** and Python **3.11 or later**, then run:

```sh
pnpm check
pnpm audit
pnpm build
```

For a fresh checkout, first run `pnpm install --frozen-lockfile`. Then `pnpm dev` runs the application locally without provider credentials or a database. The `/design` and `/worker-preview` pages use explicitly fictional examples; private author routes remain disabled until managed authentication is verified. See [development commands](docs/DEVELOPMENT.md) for builds, browser tests and dependency auditing. The original offline contract checks remain available through `npm run check:foundation`.

Public reading and simulation will require no account. Authoring will require secure authenticated sessions and organization membership. The first model concerns a proposed electronic-filing bill; the service will not accept real filings, issue government receipts or calculate authoritative deadlines for a person's case. Ask Bill's character, conversation and voice remain separate product work consuming a future headless SDK.
