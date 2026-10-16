# Headless public SDK boundary (LM-006)

The public SDK exports only \`packages/sdk/src/index.ts\`. It imports pure contract and integrity modules. It does **not** import React, Next.js, a database client, a model provider, browser UI state, or private authoring services.

\`loadPublicRelease\` consumes caller-supplied data: a parsed model bundle, a specific release ID, a release manifest, the independently trusted SHA-256 digest of that manifest, exact original source bytes, and all declared public assets. It performs strict schema and engine-version negotiation, LM-003 model validation, LM-004 content verification, and release/manifest consistency checks. The resulting frozen session resolves provisions only in the release's pinned bill version and refuses ambiguous displayed citations.

The exported current engine version is **0.0.0**, indicating that no simulation engine exists yet. Incompatible requested versions fail with \`INCOMPATIBLE_ENGINE\`; unknown model versions fail with \`INCOMPATIBLE_SCHEMA\`. \`simulate\` always returns \`UNSUPPORTED_FEATURE\` until the validated rule interpreter and scheduler milestones land. Nothing in this SDK creates a government filing, receipt, deadline or legal conclusion.

SDK methods return a discriminated \`SdkResult<T>\`: \`{ok:true,value}\` or \`{ok:false,error:{code,message}}\`. Errors distinguish schema/engine incompatibility, model/manifest integrity, missing releases, missing or ambiguous provisions, and future unsupported operations. Every source byte and public asset must be provided; no network or provider credentials are accessed by the SDK.

Run \`pnpm smoke:sdk\` from a clean checkout after \`pnpm install --frozen-lockfile\`. It loads an invented electronic-filing toy law, verifies the original bytes against a trusted manifest digest, resolves a version-scoped provision, and confirms simulation remains unsupported. It is included in \`pnpm check\` and requires no database, secrets, network, public deploy or browser.

The caller is responsible for independently establishing trusted manifest digest/publisher provenance and maintaining source privacy prior to intentional public release. Passing this SDK validation proves only internal integrity against that root and current schema, not legal accuracy or official government authorization.
