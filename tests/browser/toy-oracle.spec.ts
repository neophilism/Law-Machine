import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { runFictionalToy } from '../../packages/contracts/src/toy-oracle.ts';
const source = readFileSync(new URL('../../packages/contracts/src/toy-oracle.ts',import.meta.url),'utf8');
const oracle = JSON.parse(readFileSync(new URL('../../packages/contracts/fixtures/toy-law-oracle.json',import.meta.url),'utf8')) as {cases:{id:string;facts:{received:boolean;destination:'desk-b'|null};expected:unknown[]}[]};
test('browser and server agree on independently specified toy traces', async ({ page }) => {
  await page.goto('/');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
    .replace(/^export /gm,'');
  for(const item of oracle.cases){
    const browser = await page.evaluate(({code, facts}) => {
      const script = document.createElement('script');
      script.textContent = code + '\nwindow.__toyResult = runFictionalToy(' + JSON.stringify(facts) + ');';
      document.head.append(script); script.remove();
      return (window as Window & {__toyResult?:unknown}).__toyResult;
    }, {code:compiled,facts:item.facts});
    expect(browser).toEqual(item.expected);
    expect(runFictionalToy(item.facts)).toEqual(item.expected);
  }
});
