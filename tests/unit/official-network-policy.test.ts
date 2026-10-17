import {describe,it,expect} from 'vitest';
import {isPublicIpv4,preflightOfficialDnsAddresses} from '../../packages/legislation/src/official-network-policy.ts';
const official='https://www.congress.gov/bill/119th-congress/house-bill/1/text';
describe('LM-044 official source DNS and SSRF preflight (no live fetch)',()=>{
 it('accepts canonical globally routable IPv4 only and returns exact pin',()=>{
  const target=preflightOfficialDnsAddresses(official,['8.8.8.8','1.1.1.1']);
  expect(target.hostname).toBe('www.congress.gov');
  expect(target.pinnedIpv4).toBe('8.8.8.8');
  expect(target.redirectPolicy).toBe('reject');
  expect(target.networkVerified).toBe(false);
  expect(Object.isFrozen(target)).toBe(true);
 });
 it('rejects reserved, internal, metadata, loopback and special ranges',()=>{
  for(const ip of [
   '0.0.0.0','10.11.12.13','100.64.0.1','100.127.255.254',
   '127.0.0.1','169.254.169.254','172.16.0.1','172.31.255.254',
   '192.0.0.9','192.0.2.1','192.88.99.1','192.168.1.5',
   '198.18.0.5','198.19.255.254','198.51.100.3','203.0.113.10',
   '224.0.0.1','239.255.255.250','240.0.0.1','255.255.255.255'
  ]){
   expect(isPublicIpv4(ip),ip).toBe(false);
   expect(()=>preflightOfficialDnsAddresses(official,[ip]),ip).toThrow('OFFICIAL_DNS_NOT_PUBLIC');
  }
 });
 it('does not accept a mixed safe and unsafe answer set or empty DNS results',()=>{
  expect(()=>preflightOfficialDnsAddresses(official,['8.8.8.8','127.0.0.1'])).toThrow();
  expect(()=>preflightOfficialDnsAddresses(official,[])).toThrow();
  expect(()=>preflightOfficialDnsAddresses(official,Array(17).fill('8.8.8.8'))).toThrow();
 });
 it('rejects IPv6, mapped IPv4, weird decimal/octal encodings and host confusion',()=>{
  for(const ip of ['::1','::ffff:127.0.0.1','2001:4860:4860::8888',
    '0177.0.0.1','2130706433','8.8.8.999','8.8.8.8:443',
    '8.8.8','8.8.8.8.8','8.8.8.-1']){
   expect(isPublicIpv4(ip),ip).toBe(false);
  }
  expect(()=>preflightOfficialDnsAddresses('https://www.congress.gov.evil.test/', ['8.8.8.8'])).toThrow('SOURCE_URL_UNTRUSTED');
  expect(()=>preflightOfficialDnsAddresses('https://169.254.169.254/latest/', ['8.8.8.8'])).toThrow('SOURCE_URL_UNTRUSTED');
 });
});
