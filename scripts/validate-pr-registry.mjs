import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parsePrRegistry } from '../registry/pr-contract.mjs';

export const REPOSITORY = 'neophilism/Law-Machine';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function sourceUnits(markdown) {
  const rows = [...markdown.matchAll(/### LM (\d{3}) ([^\n]+)\n\nDependencies: ([^\n]+)\n\n([\s\S]*?)\n\nAcceptance: ([\s\S]*?)(?=\n\n### LM |\n\n## 14 Release completion criteria)/g)];
  return rows.map(([, n, title, dependencyText, scope, acceptance]) => {
    let dependsOn = dependencyText.match(/LM-\d{3}/g) || [];
    if (dependencyText.includes('through')) {
      const [start, end] = dependsOn.map(id => Number(id.slice(3)));
      dependsOn = Array.from({ length: end - start + 1 }, (_, i) => 'LM-' + String(start + i).padStart(3, '0'));
    }
    return { id: 'LM-' + n, title, dependsOn, scope, acceptance: acceptance.trim() };
  });
}

export function validateRegistry(body, retired, originalText) {
  const result = parsePrRegistry(body, REPOSITORY);
  const { document: doc } = result;
  if (retired.repository !== REPOSITORY || retired.deprecated !== true ||
      retired.redirectTo !== 'registry/prs.json' ||
      ['milestones', 'units', 'plannedPrCount', 'pullRequests'].some(key => Object.hasOwn(retired, key))) {
    throw Error('Only registry/prs.json may contain the active plan');
  }
  const originals = sourceUnits(originalText);
  if (originals.length !== 60 || new Set(originals.map(u => u.id)).size !== 60) throw Error('Original source must contain all 60 distinct work units');
  for (const original of originals) {
    const unit = doc.units.find(u => u.id === original.id);
    if (!unit || unit.origin !== 'original') throw Error('Missing original work unit: ' + original.id);
    for (const key of ['title', 'scope', 'acceptance', 'dependsOn']) {
      if (JSON.stringify(unit[key]) !== JSON.stringify(original[key])) throw Error(original.id + ': original ' + key + ' changed');
    }
    if (unit.source?.path !== 'docs/source/ORIGINAL_SPECIFICATION.md') throw Error('Missing source provenance: ' + unit.id);
  }
  for (const unit of doc.units) {
    if (!['original', 'addition'].includes(unit.origin) ||
        !['scope', 'acceptance'].every(key => typeof unit[key] === 'string' && unit[key].trim())) throw Error('Missing work scope or acceptance: ' + unit.id);
  }
  return result;
}

export async function validateFiles() {
  const [body, retired, original, source] = await Promise.all([
    read('registry/prs.json'), read('registry/roadmap.json'),
    read('docs/source/ORIGINAL_SPECIFICATION.md'), read('docs/source/SOURCE.json')
  ]);
  const record = JSON.parse(source);
  if (sha256(original) !== record.textSha256) throw Error('Original source text digest mismatch');
  const docx = await readFile(new URL('docs/source/Law-Machine-Architecture-and-PR-Plan.docx', root));
  if (sha256(docx) !== record.sha256) throw Error('Original DOCX digest mismatch');
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== REPOSITORY) throw Error('Unexpected CI repository identity');
  return validateRegistry(body, JSON.parse(retired), original);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { document } = await validateFiles();
  console.log('Valid PR registry: ' + REPOSITORY + ', ' + document.units.length + ' approved units; runtime acceptance is separate.');
}
