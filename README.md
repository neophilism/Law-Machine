# Law Machine

Follow a hypothetical claim, application, decision, document or resource through a source-linked model of law. Compare a dated baseline with a proposed bill, change circumstances, and inspect the rules and assumptions behind each outcome.

This repository contains the original specification, all 60 approved work units, architectural decisions, agent policies, and a runnable TypeScript/Next.js development workspace. The legal simulator and production experience are planned work; the current shell explicitly reports its fixture-only scope.

## Start here

- [Agent instructions](AGENTS.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Complete development plan](docs/DEVELOPMENT_PLAN.md)
- [Canonical PR registry](registry/prs.json) and [format](registry/PR_FORMAT.md)
- [Implementation handoff](docs/HANDOFF.md)
- [Security scope and threat model](security/THREAT_MODEL.md)
- [Original specification](docs/source/ORIGINAL_SPECIFICATION.md)

## Check the foundation

Use Node **24.19.0** and Python **3.11 or later**, then run:

```sh
npm run check
```

For a fresh checkout, first run `pnpm install --frozen-lockfile`. Then `pnpm dev` runs the application locally without provider credentials or a database. See [development commands](docs/DEVELOPMENT.md) for builds, browser tests and dependency auditing. The original offline contract checks remain available through `npm run check:foundation`.

Public reading and simulation will require no account. The first model concerns a proposed electronic-filing bill; the service will not accept real filings, issue government receipts or calculate authoritative deadlines for a person's case. Ask Bill's character, conversation and voice remain separate product work consuming a future headless SDK.
