import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parsePrRegistry, attachObservedWorkIds} from '../registry/pr-contract.mjs';
import {parseStructuredPrRegistry} from './fixtures/consumers/engine-room-structured.mjs';
import {parseCanonicalRoadmap} from './fixtures/consumers/engine-room-canonical.mjs';
import {renderPlan} from '../scripts/render-plan.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const body = await read('registry/prs.json');
const actual = JSON.parse(body);
const unit = {id:'EX-001',title:'Example work',origin:'original',prs:[],dependsOn:[]};
const minimal = {schemaVersion:1,repository:'example/project',roadmapVersion:1,planVerified:true,plannedPrCount:1,observedAt:'2026-10-16T00:00:00Z',units:[unit],pullRequests:[]};
const parse = doc => parsePrRegistry(JSON.stringify(doc), 'example/project');

test('both real consumer parsers preserve all 60 IDs and explicit mappings', () => {
  const boardroom = parsePrRegistry(body, 'neophilism/Law-Machine');
  const engine = parseStructuredPrRegistry(body, 'Law-Machine');
  const expected = Array.from({length:60}, (_,i) => `LM-${String(i+1).padStart(3,'0')}`);
  assert.deepEqual(boardroom.items.map(item => item.sourceItemId), expected);
  assert.deepEqual(engine.items.map(item => item.sourceItemId), expected);
  assert.equal(actual.plannedPrCount, expected.length);
  assert.deepEqual(engine.items.map(item => item.numbers), boardroom.items.map(item => item.numbers));
  for (const item of boardroom.items) {
    if (!actual.units.find(unit => unit.id === item.sourceItemId).prs.length) assert.deepEqual(item.numbers, []);
  }
});

test('canonical plan preserves every original title, scope, acceptance and dependency', async () => {
  const source = await read('docs/reference/APPROVED_PLAN_2026-10-16.md');
  const blocks = [...source.matchAll(/^### LM (\d{3}) (.+)\n\nDependencies: ([^\n]+)\n\n([\s\S]*?)\n\nAcceptance: ([\s\S]*?)(?=\n\n##|$)/gm)];
  assert.equal(blocks.length, 60);
  for (const [, number, title, dependencyText, scope, acceptance] of blocks) {
    const approved = actual.units.find(unit => unit.id === `LM-${number}`);
    assert.equal(approved.title, title);
    assert.deepEqual(approved.scope, [scope]);
    assert.equal(approved.acceptanceCriteria, acceptance);
    let dependencies = dependencyText.match(/LM-\d{3}/g) ?? [];
    if (dependencyText.includes('through')) {
      const [start, end] = dependencies.map(id => Number(id.slice(3)));
      dependencies = Array.from({length:end-start+1}, (_,i) => `LM-${String(start+i).padStart(3,'0')}`);
    }
    assert.deepEqual(approved.dependsOn, dependencies);
    assert.deepEqual(approved.externalPrerequisites, [], 'No human-review blocker inserted');
  }
});

test('readable plan is a faithful generated view and retirement notice contains no second plan', async () => {
  assert.equal(await read('docs/DEVELOPMENT_PLAN.md'), renderPlan(actual));
  const retirement = JSON.parse(await read('registry/roadmap.json'));
  assert.deepEqual(retirement, {repository:actual.repository,deprecated:true,redirectTo:'registry/prs.json'});
  assert.throws(() => parseCanonicalRoadmap(JSON.stringify(retirement), 'Law-Machine'));
});

test('upstream contracts and consumer fixtures match their recorded Git blob identities', async () => {
  const sources = JSON.parse(await read('registry/upstream-sources.json'));
  for (const file of sources.files) {
    const bytes = await readFile(new URL(file.localPath, root));
    const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(digest, file.blobSha, `${file.localPath} differs from its inspected upstream blob`);
  }
});

test('malformed identity, versions, totals, timestamps and legacy plans fail closed', () => {
  for (const change of [{repository:'other/project'},{schemaVersion:2},{roadmapVersion:0},{plannedPrCount:2},{planVerified:false},{observedAt:'2026-02-30T00:00:00Z'},{observedAt:'yesterday'},{redirectTo:'other.json'},{milestones:[]}]) assert.throws(() => parse({...minimal,...change}));
  assert.throws(() => parsePrRegistry('{', minimal.repository));
  assert.throws(() => parsePrRegistry(' '.repeat(2_000_001), minimal.repository));
  assert.equal(parse({...minimal,planVerified:false,plannedPrCount:0,units:[]}).items.length, 0);
});

test('unique stable IDs and real positive PR reference shapes are required', () => {
  for (const change of [{id:'1'},{prs:[0]},{prs:[1,1]},{prs:['2']},{prs:[4],contributingPrs:[4]}]) assert.throws(() => parse({...minimal,units:[{...unit,...change}]}));
  assert.throws(() => parse({...minimal,plannedPrCount:2,units:[unit,unit]}));
});

test('unknown, self and cyclic dependencies are rejected; independent branches remain valid', () => {
  for (const dependsOn of [['EX-002'],['EX-001'],['EX-002','EX-002']]) assert.throws(() => parse({...minimal,units:[{...unit,dependsOn}]}));
  assert.throws(() => parse({...minimal,plannedPrCount:2,units:[{...unit,dependsOn:['EX-002']},{...unit,id:'EX-002',dependsOn:['EX-001']}]}));
  assert.equal(parse({...minimal,plannedPrCount:3,units:[unit,{...unit,id:'EX-002',dependsOn:['EX-001']},{...unit,id:'EX-003',dependsOn:['EX-001']}]}).items.length, 3);
});

test('partial/historical evidence and approximate titles do not imply completion', () => {
  for (const evidence of [{contributingPrs:[8]},{priorEvidencePrs:[8]}]) {
    const {items} = parse({...minimal,units:[{...unit,...evidence}]});
    assert.deepEqual(attachObservedWorkIds(items,[{number:8,title:'EX-001: Partial',state:'closed'}])[0].numbers, []);
  }
  assert.deepEqual(attachObservedWorkIds(parse(minimal).items,[{number:1,title:'Example work',state:'open'}])[0].numbers, []);
});

test('exact IDs map unique observed PRs; open follow-ups revoke a sole completed mapping', () => {
  const linked = attachObservedWorkIds(parse(minimal).items,[{number:19,title:'EX-001: Build',state:'open'}]);
  assert.deepEqual(linked[0].numbers, [19]);
  const items = parse({...minimal,units:[{...unit,prs:[19]}]}).items;
  assert.deepEqual(attachObservedWorkIds(items,[{number:28,title:'EX-001: Repair',state:'open'}])[0].numbers, [19,28]);
  const ambiguous = attachObservedWorkIds(parse(minimal).items,[{number:19,title:'EX-001: First',state:'closed'},{number:28,title:'EX-001: Second',state:'closed'}])[0];
  assert.equal(ambiguous.ambiguous, true);
  assert.deepEqual(ambiguous.numbers, []);
});

test('contradictory or cross-repository observed PR records are rejected', () => {
  const record = {id:101,number:3,title:'EX-001: Build',state:'open',url:'https://github.com/example/project/pull/3',createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',closedAt:null,mergedAt:null,draft:false};
  assert.equal(parse({...minimal,pullRequests:[record]}).pullRequests.length, 1);
  for (const change of [{url:'https://github.com/other/project/pull/3'},{mergedAt:'2026-10-15T00:00:00Z'},{closedAt:'2026-10-15T00:00:00Z'},{updatedAt:'2026-02-30T00:00:00Z'},{draft:'false'}]) assert.throws(() => parse({...minimal,pullRequests:[{...record,...change}]}));
});

test('deterministic malformed-input sweep never accepts an invalid declared denominator', () => {
  for (let size=0; size<128; size++) {
    const invalid = structuredClone(minimal);
    invalid.plannedPrCount = size === 1 ? 2 : size;
    assert.throws(() => parse(invalid));
  }
});
