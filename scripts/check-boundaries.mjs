import ts from 'typescript';
import {readFile, readdir} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const dependencies={contracts:[],legislation:['contracts'],provenance:['contracts','legislation'],rules:['contracts','legislation','provenance'],simulation:['contracts','rules'],presentation:['contracts'],sdk:['contracts','legislation','provenance','rules','simulation','presentation']};
const serverOnly=/^(node:|pg$|postgres$|@neondatabase\/|@prisma\/|@aws-sdk\/|openai$|server-only$)|(?:^|\/)server(?:\/|$)|apps\/jobs/;
export function imports(source,path='module.ts') {
  const result=[];
  const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true, path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(node) {
    if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) result.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))) {
      if (node.arguments.length!==1||!ts.isStringLiteral(node.arguments[0])) result.push('<dynamic-import>');
      else result.push(node.arguments[0].text);
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  return result;
}
export function checkSources(files) {
  const errors=[];
  const edges=new Map();
  for (const [path,source] of Object.entries(files)) {
    const name=path.match(/^packages\/([^/]+)/)?.[1];
    edges.set(path,imports(source,path));
    for (const imported of edges.get(path)) {
      if (name&&(/^(react(?:-dom)?(?:\/|$)|next(?:\/|$))/.test(imported)||serverOnly.test(imported)||imported==='<dynamic-import>')) errors.push(`${path}: pure package cannot import ${imported}`);
      const target=imported.match(/^@law-machine\/([^/]+)/)?.[1]??(imported.startsWith('.')?relative(root,resolve(root,dirname(path),imported)).match(/^packages\/([^/]+)/)?.[1]:undefined);
      if (name&&target&&target!==name&&!dependencies[name]?.includes(target)) errors.push(`${path}: ${name} cannot depend on ${target}`);
      if (name&&imported.startsWith('.')&&relative(root,resolve(root,dirname(path),imported)).startsWith('apps/')) errors.push(`${path}: core cannot import an application`);
    }
  }
  function visitClient(path,seen) {
    if(seen.has(path))return;seen.add(path);
    for(const imported of edges.get(path)??[]) {
      if(serverOnly.test(imported)||imported==='<dynamic-import>') errors.push(`${path}: browser graph imports ${imported}`);
      const destination=imported.startsWith('.')?relative(root,resolve(root,dirname(path),imported)):imported.startsWith('@law-machine/')?`packages/${imported.split('/')[1]}/src/index.ts`:null;
      if(destination) for(const candidate of [destination,destination+'.ts',destination+'.tsx',destination+'/index.ts']) if(Object.hasOwn(files,candidate)) visitClient(candidate,seen);
    }
  }
  for(const [path,source]of Object.entries(files)) if(/^\s*['"]use client['"]/.test(source)) visitClient(path,new Set());
  return [...new Set(errors)];
}
async function collect(directory) {
  const result={};
  for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})) {
    if(['node_modules','.next','dist'].includes(entry.name))continue;
    const path=directory+'/'+entry.name;
    if(entry.isDirectory())Object.assign(result,await collect(path));
    else if(/\.(?:m?[jt]sx?)$/.test(entry.name)&&!entry.name.endsWith('.d.ts'))result[path]=await readFile(resolve(root,path),'utf8');
  }
  return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const errors=checkSources({...await collect('apps'),...await collect('packages')});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Package and browser/server boundaries valid.');
}
