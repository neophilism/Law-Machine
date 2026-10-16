import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parsePrRegistry, attachObservedWorkIds } from '../registry/pr-contract.mjs';
import { parseStructuredPrRegistry, attachObservedWorkIds as attachEngine } from './fixtures/consumers/engine-room-structured-pr-registry.mjs';
import { REPOSITORY, validateRegistry, validateFiles } from '../scripts/validate-pr-registry.mjs';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const body = await read('registry/prs.json');
const doc = JSON.parse(body);
const original = await read('docs/source/ORIGINAL_SPECIFICATION.md');
const retired = JSON.parse(await read('registry/roadmap.json'));
const copy = () => structuredClone(doc);
const parse = d => parsePrRegistry(JSON.stringify(d), REPOSITORY);
const idList = Array.from({ length: 60 }, (_, i) => 'LM-' + String(i + 1).padStart(3, '0'));

test('complete original scope and source bytes survive adoption', async () => {
  const { document } = await validateFiles();
  assert.deepEqual(document.units.filter(u => u.origin === 'original').map(u => u.id), idList);
});
test('both actual consumer parsers import the same denominator, IDs, titles and mappings', () => {
  const board = parsePrRegistry(body, REPOSITORY);
  const engine = parseStructuredPrRegistry(body, 'Law-Machine');
  const project = r => r.items.map(({ sourceItemId, title, scope, numbers }) => ({ sourceItemId, title, scope, numbers }));
  assert.equal(board.document.plannedPrCount, engine.document.plannedPrCount);
  assert.deepEqual(project(board), project(engine));
});
test('unlinked original units remain unstarted in both consumers', () => {
  const unlinked = copy(); unlinked.units.forEach(u => { u.prs = []; }); unlinked.pullRequests = [];
  const text = JSON.stringify(unlinked);
  for (const items of [parsePrRegistry(text, REPOSITORY).items, parseStructuredPrRegistry(text, 'Law-Machine').items]) {
    assert.equal(items.length, 60);
    assert.ok(items.every(u => u.numbers.length === 0 && u.reason === null));
  }
});
test('range dependencies expand exactly without dropping intermediate units', () => {
  assert.deepEqual(doc.units.find(u => u.id === 'LM-041').dependsOn, idList.slice(34, 40));
  assert.deepEqual(doc.units.find(u => u.id === 'LM-060').dependsOn, idList.slice(50, 59));
});
test('vendored consumer, merge and security tooling match recorded upstream Git blob identities', async () => {
  const provenance = JSON.parse(await read('registry/CONTRACT_SOURCES.json'));
  for (const source of provenance.sources) {
    const bytes = await readFile(new URL('../' + source.localPath, import.meta.url));
    const digest = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(digest, source.blobSha, source.localPath);
    assert.match(source.commit, /^[a-f0-9]{40}$/);
  }
});
for (const [name, mutate] of [
  ['wrong repository', d => { d.repository = 'neophilism/Other'; }],
  ['count drift', d => { d.plannedPrCount--; }],
  ['duplicate IDs', d => { d.units[1].id = d.units[0].id; }],
  ['invalid timestamp', d => { d.observedAt = '2026-02-30T00:00:00Z'; }],
  ['unverified approved units', d => { d.planVerified = false; }],
  ['unknown dependency', d => { d.units[0].dependsOn = ['LM-999']; }],
  ['self dependency', d => { d.units[0].dependsOn = ['LM-001']; }],
  ['dependency cycle', d => { d.units[0].dependsOn = ['LM-002']; }],
  ['duplicate PR references', d => { d.units[0].prs = [7, 7]; }],
  ['invalid PR number', d => { d.units[0].prs = [0]; }],
  ['contribution used as completion', d => { d.units[0].prs = [7]; d.units[0].contributingPrs = [7]; }],
  ['alternate active plan', d => { d.milestones = []; }],
  ['redirecting active plan', d => { d.redirectTo = 'elsewhere'; }]
]) test('rejects ' + name, () => { const d = copy(); mutate(d); assert.throws(() => parse(d)); });
test('rejects lost scope, acceptance, dependencies and a second plan', () => {
  for (const field of ['scope', 'acceptance', 'dependsOn']) {
    const d = copy(); d.units[10][field] = field === 'dependsOn' ? [] : 'Reduced scope';
    assert.throws(() => validateRegistry(JSON.stringify(d), retired, original));
  }
  assert.throws(() => validateRegistry(body, { ...retired, units: [] }, original));
});
test('synthetic observed PR records reject foreign URLs and contradictory states', () => {
  const record = { id: 777, number: 77, title: 'LM-001: fixture', state: 'open', url: 'https://github.com/neophilism/Law-Machine/pull/77', createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z', closedAt: null, mergedAt: null, draft: false };
  const d = copy(); d.pullRequests = [record]; assert.doesNotThrow(() => parse(d));
  d.pullRequests[0].url = 'https://github.com/neophilism/Other/pull/77'; assert.throws(() => parse(d));
  d.pullRequests[0] = { ...record, mergedAt: '2026-10-16T00:00:00Z' }; assert.throws(() => parse(d));
});
test('exact ID mapping works for both consumers; ordinal and fuzzy titles do not', () => {
  const d = copy(); d.units.forEach(u => { u.prs = []; });
  for (const [parseFn, attach] of [
    [s => parsePrRegistry(s, REPOSITORY), attachObservedWorkIds],
    [s => parseStructuredPrRegistry(s, 'Law-Machine'), attachEngine]
  ]) {
    const items = parseFn(JSON.stringify(d)).items;
    assert.deepEqual(attach(items, [{ number: 77, title: 'LM-001: foundation', state: 'open' }])[0].numbers, [77]);
    assert.deepEqual(attach(items, [{ number: 1, title: 'First architecture', state: 'open' }])[0].numbers, []);
    assert.deepEqual(attach(items, [{ number: 77, title: 'LM-001: first' }, { number: 78, title: 'LM-001: second' }])[0].numbers, []);
  }
});
test('Boardroom includes an open follow-up instead of retaining false completion', () => {
  const d = copy();
  // Use synthetic IDs that cannot collide with real PR observations as this project grows.
  const occupied = [...d.pullRequests.map(pr => pr.number), ...d.units.flatMap(unit => unit.prs)];
  const original = Math.max(1000, ...occupied) + 10;
  const followup = original + 1;
  d.units[0].prs = [original];
  assert.deepEqual(
    attachObservedWorkIds(parse(d).items, [{ number: followup, title: 'LM-001: correction', state: 'open' }])[0].numbers,
    [original, followup]
  );
});
test('bounded deterministic mutation corpus rejects 128 unknown dependencies', () => {
  for (let i = 0; i < 128; i++) {
    const d = copy(); d.units[i % 60].dependsOn.push('FUZZ-' + (1000 + i));
    assert.throws(() => parse(d));
  }
});
