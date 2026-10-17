import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  ReplayStream, runIdentity, namedStream, checkpoint, fixedRound, exportReplay, importReplay,
  type ReplayDescriptor
} from '../../packages/simulation/src/replay.ts';

const replaySource = readFileSync(new URL('../../packages/simulation/src/replay.ts', import.meta.url), 'utf8');
const integritySource = readFileSync(new URL('../../packages/contracts/src/integrity.ts', import.meta.url), 'utf8');
const descriptor: ReplayDescriptor = {
  engineVersion: '1.0.0', calendarVersion: '2026-us-toy', modelDigest: 'a'.repeat(64),
  scenarioId: 'fictional-route', seed: 42, facts: { b: 2, a: { unknown: true } }
};

// Browser executes the actual TypeScript implementations of canonical hashing
// and replay, not a hand-written duplicate of the algorithms under test.
function browserSource(): string {
  const compile = (source: string) => ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText
    .replace(/^import\s+.*;\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  return "const SCHEMA_VERSION = '1.0.0';\n" +
    compile(integritySource) + '\n' + compile(replaySource) +
    '\nwindow.__lmReplayAPI = {ReplayStream, runIdentity, namedStream, checkpoint, fixedRound, exportReplay, importReplay};';
}

test('Node and browser agree on actual named streams, run identity and replay checkpoints', async ({ page }) => {
  const stream = new ReplayStream(42, 'routing');
  const vector = Array.from({ length: 16 }, () => stream.nextUint32());
  const independentVector = [1369506609, 1227121042, 1742610489, 3639831413, 103786203, 2892188545];
  expect(vector.slice(0, 6)).toEqual(independentVector);
  const named = await namedStream(descriptor, 'routing');
  const expected = {
    vector,
    identity: await runIdentity(descriptor),
    updatedIdentity: await runIdentity({ ...descriptor, calendarVersion: '2027-us-toy' }),
    namedVector: Array.from({ length: 8 }, () => named.nextUint32()),
    checkpoint: await checkpoint('after-route', [{ tick: 0, actor: 'desk-a' }]),
    rounded: fixedRound(1.23456789),
    replay: importReplay(exportReplay(descriptor, [await checkpoint('after-route', [{ tick: 0, actor: 'desk-a' }])]))
  };
  await page.goto('/');
  const actual = await page.evaluate(async ({ script, d }) => {
    const tag = document.createElement('script');
    tag.textContent = script;
    document.head.append(tag);
    tag.remove();
    type API = typeof import('../../packages/simulation/src/replay.ts');
    const api = (window as Window & { __lmReplayAPI?: API }).__lmReplayAPI;
    if (!api) throw Error('Browser replay API missing');
    const s = new api.ReplayStream(42, 'routing');
    const n = await api.namedStream(d, 'routing');
    const cp = await api.checkpoint('after-route', [{ tick: 0, actor: 'desk-a' }]);
    return {
      vector: Array.from({ length: 16 }, () => s.nextUint32()),
      identity: await api.runIdentity(d),
      updatedIdentity: await api.runIdentity({ ...d, calendarVersion: '2027-us-toy' }),
      namedVector: Array.from({ length: 8 }, () => n.nextUint32()),
      checkpoint: cp,
      rounded: api.fixedRound(1.23456789),
      replay: api.importReplay(api.exportReplay(d, [cp]))
    };
  }, { script: browserSource(), d: descriptor });
  expect(actual).toEqual(expected);
  expect(actual.identity).not.toBe(actual.updatedIdentity);
});
