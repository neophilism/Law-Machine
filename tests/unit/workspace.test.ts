import { describe, it, expect } from 'vitest';
import { boundaryViolations } from '../../scripts/check-boundaries.ts';
import { secretFindings } from '../../scripts/scan-secrets.ts';
import { GET } from '../../apps/web/app/api/health/route.ts';
describe('workspace boundaries', () => {
  it('rejects database imports from client code, including dynamic imports', () => {
    expect(boundaryViolations('apps/web/app/editor.tsx', "'use client'; import pg from 'pg';")).toHaveLength(1);
    expect(boundaryViolations('apps/web/app/editor.tsx', "'use client'; const p = import('postgres');")).toHaveLength(1);
    expect(boundaryViolations('apps/web/app/editor.tsx', "/* comment */ 'use client'; import x from 'node:fs';")).toHaveLength(1);
  });
  it('rejects presentation and provider imports in the simulation core', () => {
    expect(boundaryViolations('packages/simulation/src/index.ts', "export { x } from 'react';")).toHaveLength(1);
    expect(boundaryViolations('packages/simulation/src/index.ts', "import x from '@law-machine/web';")).toHaveLength(1);
    expect(boundaryViolations('packages/simulation/src/index.ts', "import x from '../../../apps/web/server/key';")).toHaveLength(1);
    expect(boundaryViolations('packages/simulation/src/index.ts', "import type { X } from '@law-machine/contracts';")).toHaveLength(0);
  });
  it('detects synthetic credential patterns without logging values', () => {
    expect(secretFindings('ghp_' + 'A'.repeat(36))).toEqual(['github-token']);
    expect(secretFindings('AKIA' + 'A'.repeat(16))).toEqual(['aws-access-key']);
    expect(secretFindings('ordinary hypothetical source text')).toEqual([]);
  });
  it('runs without providers and reports limitations explicitly', async () => {
    const response = GET();
    expect(await response.json()).toEqual({ status: 'ok', mode: 'fixture', application: 'law-machine', simulationAvailable: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
