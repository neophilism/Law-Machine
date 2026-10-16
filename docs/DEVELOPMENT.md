# Local development

Use Node 24.19.0 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Open http://localhost:3000. The workspace shell and `/api/health` need no environment variables or cloud credentials.

Run `pnpm check` for foundation validation, import boundaries, lint, strict types, unit tests and baseline secret patterns. Run `pnpm build` for production compilation. Run `pnpm audit --audit-level=high` against current dependency advisories.

Run `pnpm exec playwright install --with-deps chromium` then `pnpm test:browser`. Where a verified Chromium installation already exists, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its absolute executable path. This changes only the browser binary; tests still execute the actual application.

Next.js and React versions are pinned in the web manifest; the pnpm lockfile pins transitives. TypeScript 5.9.3 is the selected compatible compiler. Next.js does not run lint during its build, so lint is a separate required check. See [installation](https://nextjs.org/docs/app/getting-started/installation) and [pnpm workspaces](https://pnpm.io/workspaces).

The seven domain packages currently declare boundaries for later work. Unsupported future features must return explicit unavailable diagnostics, never fabricated results.
