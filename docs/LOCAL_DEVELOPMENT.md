# Local development and verification

Use the pinned Node runtime in `.node-version` and pnpm 11.25.0. Python 3.11+ runs the shared security-status checks. No cloud credentials are required.

```sh
npm install --global pnpm@11.25.0 --ignore-scripts
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. The initial public shell explicitly describes development status. A local shell is not a released legal simulator.

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm scan:dependencies
```

`check` runs the original foundation suite plus package/browser boundary checks, ESLint, strict TypeScript, domain tests and a credential-pattern scanner. Browser tests run the production build on desktop and mobile and include axe accessibility checks. `scan:dependencies` audits the pinned dependency graph and exits nonzero for high/critical findings. These checks do not certify the product or replace the later human review.

Boundary checks inspect static imports, re-exports, dynamic imports and require calls. Client modules are checked transitively through local and workspace imports. Core packages cannot import React, Next.js, database/provider libraries or application modules. Extend these policies when adding a new provider or alias; do not evade them with a new entry point.

The credential scanner detects a documented set of credential patterns and environment files without printing values. It is not an exhaustive detector for every possible secret. Keep all credentials in runtime secret management, never in committed fixtures or browser bundles. No external provider is enabled in LM-002.
