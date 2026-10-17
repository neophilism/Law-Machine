import { describe, it, expect, vi } from 'vitest';
import { importLegislativeXML } from '../../packages/legislation/src/import-xml.ts';
import { loadOfficialMetadata, officialEndpoint } from '../../packages/legislation/src/official-metadata.ts';
const enc=new TextEncoder();
const uslm='<?xml version="1.0"?><bill xmlns="http://xml.house.gov/schemas/uslm/1.0"><main>'+
  '<section id="s1"><num>SEC. 1.</num><heading>Toy routing</heading><content><p>A &amp; B share a document.</p></content>'+
  '<subsection id="s1a"><num>(a)</num><content><p>Desk A forwards it.</p></content></subsection></section>'+
  '</main></bill>';
const house='<?xml version="1.0"?>\n<!DOCTYPE bill SYSTEM "bill.dtd">'+
  '<bill><metadata><title>Metadata only</title></metadata><form/><legis-body>'+
  '<section id="s1"><enum>SEC. 1.</enum><header>Fictional title</header><text>A document starts at Desk A.</text>'+
  '<subsection id="s1a"><enum>(a)</enum><text>Send a copy to Desk B.</text></subsection></section>'+
  '</legis-body></bill>';
describe('LM-010 version-pinned legislative XML ingestion',()=>{
  for(const [name,source,family] of [['USLM',uslm,'uslm'],['House Bill DTD',house,'house-bill-dtd']] as const){
    it('parses '+name+' without resolving DTD or replacing original bytes',async()=>{
      const bytes=enc.encode(source);
      const result=await importLegislativeXML(bytes,{name:'fictional.xml'});
      expect(result.family).toBe(family);
      expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.provisions).toHaveLength(2);
      expect(result.provisions[0]).toMatchObject({id:'s1',parentId:null,citation:'SEC. 1.'});
      expect(result.provisions[1]).toMatchObject({id:'s1a',parentId:'s1',citation:'(a)'});
      expect(result.extractedText).toContain(family==='uslm'?'A & B':'Desk A');
      bytes[0]=0;
      expect(new TextDecoder().decode(result.originalBytes)).toBe(source);
      expect(result.provisions[0]!.startOffset).toBeLessThan(result.provisions[1]!.startOffset);
    });
  }
  it('rejects entities, internal DTD subsets, xincludes and unsupported schema',async()=>{
    for(const xml of [
      '<!DOCTYPE bill [<!ENTITY x SYSTEM "file:///etc/passwd">]><bill><legis-body><section>&x;</section></legis-body></bill>',
      '<!DOCTYPE bill SYSTEM "https://evil.invalid/x.dtd"><bill><legis-body><section>test</section></legis-body></bill>',
      uslm.replace('<main>','<main><xi:include href="file:///etc/shadow"/>'),
    ])await expect(importLegislativeXML(enc.encode(xml),{name:'bad.xml'})).rejects.toThrow(/XML_UNSAFE/);
    await expect(importLegislativeXML(enc.encode('<bill><section>A</section></bill>'),{name:'a.xml'})).rejects.toThrow('XML_FAMILY_UNSUPPORTED');
    await expect(importLegislativeXML(enc.encode(uslm.replace('&amp;','&unknown;')),{name:'a.xml'})).rejects.toThrow('XML_ENTITY_UNSUPPORTED');
  });
  it('rejects duplicate scoped IDs, malformed XML and oversized inputs',async()=>{
    const same=uslm.replace('</main>','<section id="s1"><num>2</num></section></main>');
    await expect(importLegislativeXML(enc.encode(same),{name:'a.xml'})).rejects.toThrow('XML_DUPLICATE_ID');
    await expect(importLegislativeXML(enc.encode(uslm.replace('</section></main>','</main>')),{name:'a.xml'})).rejects.toThrow('XML_MALFORMED');
    await expect(importLegislativeXML(new Uint8Array(5_000_001),{name:'huge.xml'})).rejects.toThrow('XML_SIZE_LIMIT');
  });
});
describe('LM-010 bounded official metadata',()=>{
  const congress={provider:'congress' as const,congress:119,billType:'hr' as const,billNumber:1};
  const govinfo={provider:'govinfo' as const,packageId:'BILLS-119hr1ih'};
  it('uses deterministic offline fixture cache without network or credentials',async()=>{
    const fetcher=vi.fn(()=>{throw Error('not expected');});
    const fixtureCache=new Map([['congress:119/hr/1',{bill:{number:'1',title:'Fictional fixture'}}]]);
    const one=await loadOfficialMetadata(congress,{fixtureCache,fetcher:fetcher as never});
    const two=await loadOfficialMetadata(congress,{fixtureCache,fetcher:fetcher as never});
    expect(one.mode).toBe('fixture');
    expect(one.retrievedAt).toBe(null);
    expect(one.sourceDigest).toBe(two.sourceDigest);
    expect(one.data).not.toBe(fixtureCache.get('congress:119/hr/1'));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('restricts provider host and IDs and requires explicit opt-in live credentials',async()=>{
    expect(officialEndpoint(govinfo).url).toBe('https://api.govinfo.gov/packages/BILLS-119hr1ih/summary');
    expect(()=>officialEndpoint({...govinfo,packageId:'../x'})).toThrow('METADATA_INVALID_IDENTIFIER');
    await expect(loadOfficialMetadata(govinfo)).rejects.toThrow('METADATA_CREDENTIAL_NOT_CONFIGURED');
  });
  it('retrieves bounded live response with a short-lived timeout and never returns credentials',async()=>{
    let captured='';
    const fetcher=vi.fn(async(url:string)=>{captured=url;return Response.json({packageId:'BILLS-119hr1ih',lastModified:'2025-01-01T00:00:00Z'});});
    const result=await loadOfficialMetadata(govinfo,{apiKey:'DEMO_KEY',fetcher:fetcher as never,timeoutMs:1000});
    expect(captured).toContain('api_key=DEMO_KEY');
    expect(result.sourceUrl).not.toContain('DEMO_KEY');
    expect(JSON.stringify(result)).not.toContain('DEMO_KEY');
    expect(result.mode).toBe('live');
    expect(result.retrievedAt).toMatch(/^\d{4}-/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fails closed on overlarge provider bodies and invalid credential shape',async()=>{
    const large=async()=>new Response('x'.repeat(250001),{status:200,headers:{'content-length':'250001'}});
    await expect(loadOfficialMetadata(govinfo,{apiKey:'DEMO_KEY',fetcher:large as never})).rejects.toThrow('METADATA_RESPONSE_LIMIT');
    await expect(loadOfficialMetadata(govinfo,{apiKey:'a?b',fetcher:large as never})).rejects.toThrow('METADATA_INVALID_CREDENTIAL');
  });
});
