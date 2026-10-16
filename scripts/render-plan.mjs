import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parsePrRegistry} from '../registry/pr-contract.mjs';

export function renderPlan(document) {
  const sections = document.units.map(unit => [
    `## ${unit.id}: ${unit.title}`,
    `Dependencies: ${unit.dependsOn.length ? unit.dependsOn.join(', ') : 'none'}.`,
    ...unit.scope,
    `Acceptance: ${unit.acceptanceCriteria}`,
  ].join('\n\n'));
  return [
    '# Law Machine development plan',
    '> Generated from `registry/prs.json` by `node scripts/render-plan.mjs`. Edit the canonical approved units, then regenerate. PR numbers and live state belong to GitHub.',
    `${document.plannedPrCount} approved work units; roadmap version ${document.roadmapVersion}. Stable IDs are not GitHub PR numbers. Original scope, dependencies, and acceptance are retained from the [approved source](reference/APPROVED_PLAN_2026-10-16.md).`,
    'The architecture is in [ARCHITECTURE.md](ARCHITECTURE.md). Agent-owned implementation, testing, and remediation follow [AGENTS.md](../AGENTS.md). Deferred independent human review and certification do not gate development or release. Actual failed checks are fixed, and unavailable optional integrations do not stop independent work.',
    '| Milestone | Units | Result |\n| --- | --- | --- |\n| Foundations | LM-001–008 | Repository, contracts, design primitives, fixtures |\n| Legislative sources | LM-009–018 | Versioned explorer and first source pack |\n| Executable system | LM-019–030 | Deterministic engine and first complete model |\n| First demonstration | LM-031–034 | Guided wrong-agency journey and source inspector |\n| Public explorer | LM-035–041 | Comparison, sandbox, accessibility, static distribution |\n| Authoring/publication | LM-042–050 | Secure editorial workflow and releases |\n| Operations/reuse | LM-051–060 | Recovery, security, second domain, SDK, acceptance |',
    ...sections,
  ].join('\n\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {document} = parsePrRegistry(await readFile(new URL('../registry/prs.json', import.meta.url), 'utf8'), 'neophilism/Law-Machine');
  const path = new URL('../docs/DEVELOPMENT_PLAN.md', import.meta.url);
  const expected = renderPlan(document);
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== expected) throw new Error('Development plan is stale. Run node scripts/render-plan.mjs.');
    console.log('Readable development plan matches the canonical registry.');
  } else {
    await writeFile(path, expected);
    console.log('Rendered docs/DEVELOPMENT_PLAN.md.');
  }
}
