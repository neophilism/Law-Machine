import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {ReplayStream} from '../../packages/simulation/src/replay.ts';
const source=readFileSync(new URL('../../packages/simulation/src/replay.ts',import.meta.url),'utf8');
test('Node and browser execute same RNG source and seeded replay vector',async({page})=>{
 const start=source.indexOf('export class ReplayStream');
 const end=source.indexOf('export async function namedStream',start);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'');
 const node=new ReplayStream(42,'routing');
 const expected=Array.from({length:16},()=>node.nextUint32());
 await page.goto('/');
 const actual=await page.evaluate(script=>{
   const tag=document.createElement('script');
   tag.textContent=script+'\nconst stream=new ReplayStream(42,"routing"); window.__lmReplayVector=Array.from({length:16},()=>stream.nextUint32());';
   document.head.append(tag);tag.remove();
   return (window as Window&{__lmReplayVector?:number[]}).__lmReplayVector;
 },compiled);
 expect(actual).toEqual(expected);
});
