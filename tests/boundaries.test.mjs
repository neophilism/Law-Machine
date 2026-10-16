import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSources} from '../scripts/check-boundaries.mjs';
import {scanText} from '../scripts/scan-secrets.mjs';
test('browser to database import fails, including transitive dependencies',()=>{
  const errors=checkSources({'apps/web/app/widget.tsx':"'use client'; import './helper.ts';",'apps/web/app/helper.ts':"import pg from 'pg';"});
  assert.match(errors.join('\n'),/browser graph imports pg/);
});
test('pure core imports cannot reach React or an inverted package dependency',()=>{
  assert.equal(checkSources({'packages/simulation/src/index.ts':"import React from 'react';"}).length,1);
  assert.equal(checkSources({'packages/contracts/src/index.ts':"export * from '@law-machine/sdk';"}).length,1);
  assert.equal(checkSources({'packages/contracts/src/index.ts':"export * from '../../sdk/src/index.ts';"}).length,1);
});
test('dynamic require and client server-side access fail; allowed domain import succeeds',()=>{
  assert.ok(checkSources({'apps/web/app/x.tsx':"'use client'; const x=require(name);"}).length);
  assert.ok(checkSources({'apps/web/app/x.tsx':"'use client'; import('node:fs');"}).length);
  assert.deepEqual(checkSources({'packages/legislation/src/index.ts':"import type {X} from '@law-machine/contracts';"}),[]);
});
test('credential scanner detects generated credential fixtures without reporting their values',()=>{
  for(const secret of ['ghp_'+'x'.repeat(36),'AKIA'+'A'.repeat(16),'-----BEGIN '+'PRIVATE KEY-----']) assert.equal(scanText(secret).length,1);
  assert.deepEqual(scanText('API keys are supplied through the secret environment.'),[]);
});
