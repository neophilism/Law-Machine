import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMergeEvidence, parseArgs, safeMergePR, verifyRemotePR} from '../scripts/verify-pr-merge.mjs';

const sha = 'a'.repeat(40);
function good() {
  return {repository:'neophilism/Law-Machine',expectedSha:sha,requiredChecks:['foundation'],
    pr:{number:7,state:'open',draft:false,head:{sha},base:{repo:{full_name:'neophilism/Law-Machine'}},mergeable:true,mergeable_state:'clean'},
    checks:{total_count:1,check_runs:[{name:'foundation',head_sha:sha,status:'completed',conclusion:'success'}]},
    statuses:{statuses:[]}};
}

test('only complete successful current-head evidence passes; no human-review field required', () => {
  const result = assessMergeEvidence(good());
  assert.equal(result.safe, true);
  assert.deepEqual(result.passingChecks, ['foundation']);
});

for (const [name, mutate] of [
  ['missing checks', e => {e.checks={total_count:0,check_runs:[]};}],
  ['unstarted', e => {e.checks.check_runs[0].status='queued';}],
  ['failed', e => {e.checks.check_runs[0].conclusion='failure';}],
  ['skipped', e => {e.checks.check_runs[0].conclusion='skipped';}],
  ['cancelled', e => {e.checks.check_runs[0].conclusion='cancelled';}],
  ['incomplete pagination', e => {e.checks.total_count=2;}],
  ['different commit', e => {e.checks.check_runs[0].head_sha='b'.repeat(40);}],
  ['changed PR head', e => {e.pr.head.sha='b'.repeat(40);}],
  ['missing named requirement', e => {e.requiredChecks=['browser'];}],
  ['unconfigured requirements', e => {e.requiredChecks=[];}],
  ['draft PR', e => {e.pr.draft=true;}],
  ['unknown mergeability', e => {e.pr.mergeable=null;}],
  ['wrong repository', e => {e.pr.base.repo.full_name='other/project';}],
  ['failed optional job', e => {e.checks.check_runs.push({name:'other',status:'completed',conclusion:'failure'});e.checks.total_count++;}],
  ['pending external status', e => {e.statuses.statuses=[{context:'external',state:'pending'}];}],
]) test(`merge preflight rejects ${name}`, () => {
  const evidence = good(); mutate(evidence);
  assert.equal(assessMergeEvidence(evidence).safe, false);
});

test('a newer successful legacy status supersedes an older failure for the same context', () => {
  const evidence=good();
  evidence.statuses.statuses=[{context:'external',state:'success'},{context:'external',state:'failure'}];
  assert.equal(assessMergeEvidence(evidence).safe, true);
});

function fakeRemote({secondFails=false}={}) {
  let checksRead=0;
  const calls=[];
  const request=async (url, options) => {
    calls.push({url,method:options.method,body:options.body});
    let value;
    if (options.method==='PUT') value={merged:true,sha:'c'.repeat(40)};
    else if (url.includes('/check-runs')) {
      value=good().checks;
      if (++checksRead===2 && secondFails) value.check_runs[0].conclusion='failure';
    } else if (url.includes('/status?')) value=good().statuses;
    else value=good().pr;
    return {ok:true,json:async()=>value};
  };
  return {request,calls};
}
const options={repository:'neophilism/Law-Machine',number:7,requiredChecks:['foundation'],expectedSha:sha,token:'synthetic-test-token'};

test('safe merge repeats remote inspection and sends expected SHA in the merge request', async () => {
  const fake=fakeRemote();
  const result=await safeMergePR({...options,request:fake.request});
  assert.equal(result.merged,true);
  assert.equal(fake.calls.filter(call=>call.url.endsWith('/pulls/7')).length,2);
  const writes=fake.calls.filter(call=>call.method==='PUT');
  assert.equal(writes.length,1);
  assert.deepEqual(JSON.parse(writes[0].body),{sha,merge_method:'squash'});
});

test('a failing second inspection prevents the remote merge', async () => {
  const fake=fakeRemote({secondFails:true});
  const result=await safeMergePR({...options,request:fake.request});
  assert.equal(result.merged,false);
  assert.equal(fake.calls.some(call=>call.method==='PUT'),false);
});

test('remote permission failure and missing token fail closed', async () => {
  await assert.rejects(verifyRemotePR({...options,token:''}),/scoped/);
  await assert.rejects(verifyRemotePR({...options,request:async()=>({ok:false,status:403})}),/HTTP 403/);
});

test('CLI refuses invalid repository, missing check names and invalid expected SHA', () => {
  assert.throws(()=>parseArgs(['--repo','bad','--pr','1','--require','foundation']));
  assert.throws(()=>parseArgs(['--repo','neophilism/Law-Machine','--pr','1']));
  assert.throws(()=>parseArgs(['--repo','neophilism/Law-Machine','--pr','1','--require','foundation','--expected-sha','short']));
});
