import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { test, expect } from '@playwright/test';
import { canonicalJSON, canonicalDigest, sha256Hex } from '../../packages/contracts/src/index.ts';

/** Compile the actual provider-free TypeScript module for browser execution.
 * Only the immutable schema constant is inlined to avoid a module resolver.
 */
const source = readFileSync(new URL('../../packages/contracts/src/integrity.ts', import.meta.url), 'utf8');
const browserSource = source.replace("import { SCHEMA_VERSION } from './model.ts';", "const SCHEMA_VERSION = '1.0.0' as const;");
if (source === browserSource) throw new Error('Browser harness failed to inline the version constant');
const js = ts.transpileModule(browserSource, {compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
}}).outputText;
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');

test('Node and Chromium produce exactly the same canonical JSON and digest',async({page})=>{
  await page.goto('/');
  const fixture={z:[3,'c'],a:{b:true,a:null}};
  const fromNode={serialized:canonicalJSON(fixture),digest:await canonicalDigest(fixture),
    rawHash:await sha256Hex(new TextEncoder().encode('raw\r\n'))};
  const fromBrowser=await page.evaluate(async({url,fixture})=>{
    const module=await import(url);
    return {serialized:module.canonicalJSON(fixture),digest:await module.canonicalDigest(fixture),
      rawHash:await module.sha256Hex(new TextEncoder().encode('raw\r\n'))};
  },{url:moduleUrl,fixture});
  expect(fromBrowser).toEqual(fromNode);
  expect(fromBrowser.digest).toBe('1b553761187d54000ee70b6abf35733ac138ce77905aa7f6e8552456bd58910e');
});
