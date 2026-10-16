import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const major = Number(process.versions.node.split('.')[0]);
if (major !== 24) throw Error('Use the pinned Node 24 runtime in .node-version');
for (const directory of ['scripts', 'registry', 'tests']) {
  for (const path of await readdir(new URL('../' + directory + '/', import.meta.url), { recursive: true })) {
    if (path.endsWith('.mjs')) run(process.execPath, ['--check', directory + '/' + path]);
  }
}
run(process.execPath, ['scripts/validate-pr-registry.mjs']);
const tests = (await readdir(new URL('../tests/', import.meta.url))).filter(p => p.endsWith('.test.mjs')).sort();
if (!tests.length) throw Error('No foundation tests found');
run(process.execPath, ['--test', ...tests.map(p => 'tests/' + p)]);
run('python3', ['scripts/validate_e2eesa_status.py']);
run('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py']);
console.log('Foundation checks passed. Application/runtime acceptance is not yet implemented.');
