import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, {cwd:root, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['scripts/validate-pr-registry.mjs']);
run(process.execPath, ['scripts/render-plan.mjs', '--check']);
run(process.execPath, ['scripts/check-doc-links.mjs']);
run('python3', ['scripts/validate_e2eesa_status.py']);
run('python3', ['-c', "import ast; from pathlib import Path; ast.parse(Path('scripts/validate_e2eesa_status.py').read_text()); print('Python syntax valid.')"]);
for (const directory of ['scripts', 'registry', 'tests', 'tests/fixtures/consumers']) {
  for (const file of (await readdir(new URL(`../${directory}/`, import.meta.url))).sort()) {
    if (file.endsWith('.mjs')) run(process.execPath, ['--check', `${directory}/${file}`]);
  }
}
const files = (await readdir(new URL('../tests/', import.meta.url))).filter(file => file.endsWith('.test.mjs')).sort();
if (!files.length) throw new Error('No foundation tests discovered.');
run(process.execPath, ['--test', ...files.map(file => `tests/${file}`)]);
console.log('Foundation checks passed; application and full-product security acceptance remain separate.');
