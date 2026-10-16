import test from 'node:test';
import assert from 'node:assert/strict';
import {requireJob} from '../apps/jobs/src/index.ts';
test('unimplemented jobs fail explicitly rather than silently succeeding',()=>assert.throws(()=>requireJob('publish'),/UNSUPPORTED_JOB/));
