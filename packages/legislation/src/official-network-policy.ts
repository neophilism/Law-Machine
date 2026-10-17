import {validateOfficialSourceUrl} from './source-intake.ts';

/**
 * Offline LM-044 SSRF policy. All resolved A records must be globally routable.
 * The eventual HTTPS connector MUST pin the returned IP for TLS connection,
 * retain URL hostname for SNI and certificate validation, ignore proxy env vars,
 * deny redirects, enforce byte/time budgets, and resolve again for each request.
 * This function makes NO DNS or network requests and is not an HTTP fetcher.
 */
const DENIED_RANGES:readonly (readonly [number,number])[]=[
 [0x00000000,8],   // 0/8
 [0x0a000000,8],   // RFC 1918 10/8
 [0x64400000,10],  // shared address space 100.64/10
 [0x7f000000,8],   // loopback 127/8
 [0xa9fe0000,16],  // link-local / cloud metadata 169.254/16
 [0xac100000,12],  // RFC 1918 172.16/12
 [0xc0000000,24],  // IETF protocol assignments 192.0.0/24
 [0xc0000200,24],  // documentation 192.0.2/24
 [0xc0586300,24],  // 6to4 anycast 192.88.99/24
 [0xc0a80000,16],  // RFC 1918 192.168/16
 [0xc6120000,15],  // benchmarking 198.18/15
 [0xc6336400,24],  // documentation 198.51.100/24
 [0xcb007100,24],  // documentation 203.0.113/24
 [0xe0000000,4],   // multicast 224/4
 [0xf0000000,4]    // reserved/limited broadcast 240/4
];
function ipv4Value(value:unknown):number|null {
 if(typeof value!=='string'||value.length<7||value.length>15)return null;
 const octets=value.split('.');
 if(octets.length!==4)return null;
 const nums:number[]=[];
 for(const part of octets){
  if(!/^(0|[1-9][0-9]{0,2})$/.test(part))return null;
  const x=Number(part);
  if(x>255)return null;
  nums.push(x);
 }
 return (((nums[0]!<<24)|(nums[1]!<<16)|(nums[2]!<<8)|nums[3]!)>>>0);
}
export function isPublicIpv4(value:unknown):boolean {
 const addr=ipv4Value(value);
 if(addr===null)return false;
 return !DENIED_RANGES.some(([network,length])=>
  (addr >>> (32-length)) === (network >>> (32-length)));
}
export type PinnedOfficialSource={
 readonly url:string;readonly hostname:string;readonly pinnedIpv4:string;
 readonly maximumBodyBytes:15000000;readonly redirectPolicy:'reject';
 readonly networkVerified:false;
};
/** Required input: a single bounded DNS A-record resolution snapshot from trusted resolver. */
export function preflightOfficialDnsAddresses(
 candidateUrl:unknown,answers:unknown
):PinnedOfficialSource{
 const url=validateOfficialSourceUrl(candidateUrl);
 if(!Array.isArray(answers)||answers.length<1||answers.length>16||
    answers.some(address=>!isPublicIpv4(address)))throw Error('OFFICIAL_DNS_NOT_PUBLIC');
 const hostname=new URL(url).hostname;
 // Choose deterministic first address; future HTTPS connector MUST use THIS IP.
 return Object.freeze({
  url,hostname,pinnedIpv4:answers[0] as string,
  maximumBodyBytes:15000000,redirectPolicy:'reject' as const,
  networkVerified:false as const
 });
}
