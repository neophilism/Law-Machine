# Law Machine

Follow a hypothetical claim, application, decision, document or resource through a source-linked model of law. Compare a dated baseline with a proposed bill, change circumstances, and inspect the rules and assumptions behind each outcome.

This repository begins with **LM-001: Architecture decisions and roadmap registration**. It contains the original specification, all 60 approved work units, architectural decisions, agent policies, and executable foundation validation. The simulator and public application are planned work, not yet implemented or deployed.

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

No package installation, provider credentials, database or network access is needed for these checks. They validate all 60 units against both pinned consumer implementations, preserve the original scope, exercise malformed inputs and PR mappings, and validate honest security status. LM-002 adds the pnpm/TypeScript application workspace and application checks.

Public reading and simulation will require no account. The first model concerns a proposed electronic-filing bill; the service will not accept real filings, issue government receipts or calculate authoritative deadlines for a person's case. Ask Bill's character, conversation and voice remain separate product work consuming a future headless SDK.
