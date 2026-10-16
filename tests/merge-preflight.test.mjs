import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMergeEvidence, safeMergePR } from '../scripts/verify-pr-merge.mjs';

const sha = 'a'.repeat(40);
function evidence() {
  return { repository: 'neophilism/Law-Machine', expectedSha: sha, requiredChecks: ['foundation'],
    pr: { number: 1, state: 'open', draft: false, head: { sha }, base: { repo: { full_name: 'neophilism/Law-Machine' } }, mergeable: true, mergeable_state: 'clean' },
    checks: { total_count: 1, check_runs: [{ name: 'foundation', head_sha: sha, status: 'completed', conclusion: 'success' }] },
    statuses: { statuses: [] } };
}
test('successful exact-head checks allow merge assessment without a human-audit field', () => {
  assert.equal(assessMergeEvidence(evidence()).safe, true);
});
for (const conclusion of ['failure', 'skipped', 'cancelled', null]) test('rejects ' + conclusion + ' checks', () => {
  const e = evidence(); e.checks.check_runs[0].conclusion = conclusion;
  assert.equal(assessMergeEvidence(e).safe, false);
});
test('rejects missing, incomplete, pending, stale-head and resource-blocked evidence', () => {
  for (const mutate of [
    e => { e.checks = { total_count: 0, check_runs: [] }; },
    e => { e.checks.total_count = 2; },
    e => { e.checks.check_runs[0].status = 'in_progress'; },
    e => { e.pr.head.sha = 'b'.repeat(40); },
    e => { e.statuses.statuses = [{ context: 'capacity', state: 'failure' }]; }
  ]) { const e = evidence(); mutate(e); assert.equal(assessMergeEvidence(e).safe, false); }
});
test('a mismatched PR head cannot cause a merge API write', async () => {
  let writes = 0;
  const e = evidence();
  const request = async (url, options) => {
    if (options.method !== 'GET') writes++;
    const data = url.endsWith('/pulls/1') ? e.pr : url.includes('check-runs') ? e.checks : e.statuses;
    return { ok: true, json: async () => data };
  };
  const result = await safeMergePR({ repository: e.repository, number: 1, expectedSha: 'b'.repeat(40), requiredChecks: ['foundation'], token: 'synthetic-test-token', request });
  assert.equal(result.safe, false);
  assert.ok(result.blockers.includes('HEAD_SHA_MISMATCH'));
  assert.equal(writes, 0);
});
