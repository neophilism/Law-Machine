import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, cp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
test('real validation CLIs work from an unrelated working directory', () => {
  for (const [command,args] of [
    [process.execPath,[join(root,'scripts/validate-pr-registry.mjs')]],
    [process.execPath,[join(root,'scripts/render-plan.mjs'),'--check']],
    ['python3',[join(root,'scripts/validate_e2eesa_status.py')]],
  ]) {
    const result=spawnSync(command,args,{cwd:tmpdir(),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
});

test('invalid canonical count and a duplicate legacy plan make the CLI exit nonzero', async () => {
  const directory=await mkdtemp(join(tmpdir(),'law-machine-registry-'));
  try {
    await cp(join(root,'registry'),join(directory,'registry'),{recursive:true});
    await mkdir(join(directory,'scripts'));
    await cp(join(root,'scripts/validate-pr-registry.mjs'),join(directory,'scripts/validate-pr-registry.mjs'));
    const run=()=>spawnSync(process.execPath,['scripts/validate-pr-registry.mjs'],{cwd:directory,encoding:'utf8'});
    const path=join(directory,'registry/prs.json');
    const source=await readFile(path,'utf8');
    const corrupt=JSON.parse(source); corrupt.plannedPrCount++;
    await writeFile(path,JSON.stringify(corrupt));
    assert.notEqual(run().status,0);
    await writeFile(path,source);
    await writeFile(join(directory,'registry/roadmap.json'),JSON.stringify({repository:'neophilism/Law-Machine',deprecated:true,redirectTo:'registry/prs.json',milestones:[]}));
    const duplicate=run();
    assert.notEqual(duplicate.status,0);
    assert.match(duplicate.stderr,/Only registry\/prs.json/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('security tracking remains honest and malformed completion order fails validation', async () => {
  const status=JSON.parse(await readFile(join(root,'security/e2eesa-status.json'),'utf8'));
  assert.equal(status.repository,'neophilism/Law-Machine');
  assert.equal(status.implementation.complete,false);
  assert.equal(status.testing.complete,false);
  assert.equal(status.independentReview.complete,false);
  const directory=await mkdtemp(join(tmpdir(),'law-machine-security-'));
  try {
    await cp(join(root,'security'),join(directory,'security'),{recursive:true});
    status.testing.complete=true;
    await writeFile(join(directory,'security/e2eesa-status.json'),JSON.stringify(status));
    const result=spawnSync('python3',[join(root,'scripts/validate_e2eesa_status.py'),'--root',directory],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Testing depends on implementation/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
