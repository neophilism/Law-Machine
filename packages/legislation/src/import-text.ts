import { sha256Hex } from '../../contracts/src/integrity.ts';
/** LM-009 first slice: bounded text and Markdown import with immutable original bytes. */
export type SourceFormat = 'text' | 'markdown' | 'docx';
export type ImportDiagnostic = { readonly code: string; readonly line: number; readonly message: string };
export type Numbering = { readonly line: number; readonly label: string; readonly text: string; readonly depth: number };
export type ImportedSource = { readonly format: SourceFormat; readonly name: string; readonly sourceDigest: string; readonly originalBytes: Uint8Array; readonly extractedText: string; readonly numbering: readonly Numbering[]; readonly diagnostics: readonly ImportDiagnostic[] };
export async function importText(bytes: Uint8Array, options: { format: Exclude<SourceFormat, 'docx'>; name: string }): Promise<ImportedSource> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 2_000_000) throw Error('SOURCE_SIZE_LIMIT');
  if (options.format !== 'text' && options.format !== 'markdown') throw Error('UNSUPPORTED_SOURCE_FORMAT');
  if (typeof options.name !== 'string' || !options.name || options.name.length > 200 || /[\\/\x00-\x1f]/.test(options.name)) throw Error('INVALID_SOURCE_NAME');
  // Fail rather than silently replacing malformed UTF-8 and changing the legal source text.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0')) throw Error('BINARY_TEXT_NOT_SUPPORTED');
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 20000) throw Error('SOURCE_LINE_LIMIT');
  const numbering: Numbering[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  for(let i=0;i<lines.length;i++){
    const line=lines[i]!;
    if (line.length > 16000) throw Error('SOURCE_LINE_LENGTH_LIMIT');
    const heading = options.format === 'markdown' ? /^(#{1,6})\s+(.+)$/.exec(line) : null;
    const explicit = /^\s*(?:Section|Sec\.|§)\s+([0-9]+(?:\.[0-9]+)*[A-Za-z]?)\.?\s*(.*)$/i.exec(line);
    const ordered = /^\s*\(([a-z0-9ivx]+)\)\s+(.+)$/i.exec(line);
    if (heading) numbering.push({line:i+1,label:heading[2]!,text:line,depth:heading[1]!.length});
    else if(explicit) numbering.push({line:i+1,label:explicit[1]!,text:line,depth:1});
    else if(ordered) numbering.push({line:i+1,label:ordered[1]!,text:line,depth:2});
  }
  if (!numbering.length) diagnostics.push({code:'NO_NUMBERING_DETECTED',line:1,message:'No recognized headings or provision labels; source remains importable'});
  return {format:options.format,name:options.name,sourceDigest:await sha256Hex(bytes),originalBytes:bytes.slice(),extractedText:text,numbering,diagnostics};
}
