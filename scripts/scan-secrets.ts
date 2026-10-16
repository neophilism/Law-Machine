import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function secretFindings(source: string): string[] {
  return [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
    ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/],
    ['credential-url', /(?:postgres(?:ql)?|mysql):\/\/[^\s:/]+:[^\s@/]+@/]
  ].filter(([, pattern]) => (pattern as RegExp).test(source)).map(([name]) => name as string);
}
export async function scan() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const problems: string[] = [];
  for (const file of new Set(files)) {
    if (file.endsWith('.docx')) continue;
    const content = await readFile(file, 'utf8');
    for (const kind of secretFindings(content)) problems.push(file + ': ' + kind);
  }
  if (problems.length) throw Error('Potential secrets (values suppressed):\n' + problems.join('\n'));
  console.log('Baseline source secret patterns pass; this is not a certification or exhaustive scanner.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await scan();
