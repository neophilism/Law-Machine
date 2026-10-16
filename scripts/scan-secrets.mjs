import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export function scanText(text) {
  const patterns=[['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],['AWS access key',/\bAKIA[0-9A-Z]{16}\b/],['assigned secret',/(?:api[_-]?key|password|client[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9/+_=.-]{24,}['"]/i]];
  return patterns.filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const findings=[];
  for(const path of new Set(paths)) {
    if(/(?:^|\/)\.env(?:\.|$)/.test(path)&&!path.endsWith('.example'))findings.push(`${path}: environment file`);
    if(/\.(?:docx|pdf|png|jpg|woff2)$/.test(path))continue;
    const text=await readFile(new URL('../'+path,import.meta.url),'utf8');
    for(const kind of scanText(text))findings.push(`${path}: ${kind}`);
  }
  if(findings.length)throw Error('Potential credentials (values redacted):\n'+findings.join('\n'));
  console.log('Credential-pattern scan passed; not a guarantee against all secret formats.');
}
