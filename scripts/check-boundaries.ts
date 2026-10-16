import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbidden = /^(react(?:-dom)?(?:\/|$)|next(?:\/|$)|pg$|postgres$|@neondatabase\/|@aws-sdk\/|openai$)/;
export function boundaryViolations(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pure = /^packages\/(contracts|legislation|provenance|rules|simulation|presentation|sdk)\//.test(path);
  const browser = file.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'use client');
  const violations: string[] = [];
  const inspect = (specifier: string) => {
    const destination = specifier.startsWith('.') ? relative(process.cwd(), resolve(dirname(path), specifier)).replaceAll('\\', '/') : specifier;
    if ((pure && (forbidden.test(specifier) || /^@law-machine\/(web|jobs)(\/|$)/.test(specifier) || /^(apps|db)\//.test(destination))) ||
        (browser && (/^(pg|postgres|openai)$|^node:|^@neondatabase\/|^@aws-sdk\//.test(specifier) || /(^|\/)(db|server|jobs)(\/|$)/.test(destination)))) {
      violations.push(path + ': prohibited dependency ' + specifier);
    }
  };
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const arg = node.arguments[0]; if (arg && ts.isStringLiteral(arg)) inspect(arg.text);
      else if (pure || browser) violations.push(path + ': nonliteral module loading is prohibited');
    }
    ts.forEachChild(node, visit);
  }
  visit(file); return violations;
}
export async function checkBoundaries() {
  const violations: string[] = [];
  for (const dir of ['apps', 'packages']) for (const path of await readdir(dir, { recursive: true })) {
    if (/\.(ts|tsx)$/.test(path) && !/(^|\/)(node_modules|\.next|dist)\//.test(path)) violations.push(...boundaryViolations(dir + '/' + path, await readFile(dir + '/' + path, 'utf8')));
  }
  if (violations.length) throw Error(violations.join('\n'));
  console.log('Package and browser/server import boundaries pass.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checkBoundaries();
