import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    if (['.git', 'node_modules', '__pycache__'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}
for (const path of await walk(root)) {
  for (const [, link] of (await readFile(path, 'utf8')).matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z\d+.-]*:|^#/i.test(link)) continue;
    const target = resolve(dirname(path), decodeURIComponent(link.split('#')[0]));
    try { await stat(target); }
    catch { throw new Error(`Missing local link from ${path}: ${link}`); }
  }
}
console.log('Local Markdown link targets exist (remote URLs and anchors are not checked).');
