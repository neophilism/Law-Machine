import {describe,it,expect} from 'vitest';
import {FixtureEditorialStore,PostgresEditorialStore,type AuthenticatedEditorialScope}
  from '../../apps/jobs/src/editorial-store.ts';
const org='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const digest='a'.repeat(64);
const scope:AuthenticatedEditorialScope={orgId:org,actorId:actor,serverVerified:true};
describe('LM-042 tenant-scoped editorial fixture',()=>{
 it('increments revisions, detects stale writes and retains audit without partial mutation',()=>{
  const store=new FixtureEditorialStore();
  expect(store.create(scope,documentId,{title:'toy'},digest).revision).toBe(1);
  expect(store.update(scope,documentId,1,{title:'updated'},digest).revision).toBe(2);
  expect(()=>store.update(scope,documentId,1,{title:'stale'},digest)).toThrow('LM_STALE_REVISION');
  expect(store.read(scope,documentId)?.payload).toEqual({title:'updated'});
  expect(store.audit(scope).map(e=>e.revision)).toEqual([1,2]);
 });
 it('enforces organization partition and refuses missing verified scope',()=>{
  const store=new FixtureEditorialStore();
  store.create(scope,documentId,{title:'private'},digest);
  const other={...scope,orgId:second};
  expect(store.read(other,documentId)).toBeNull();
  expect(store.audit(other)).toEqual([]);
  expect(()=>store.read({...scope,serverVerified:false as never},documentId)).toThrow('EDITORIAL_SCOPE_INVALID');
 });
 it('requires JSON object and normalized exact digests',()=>{
  const store=new FixtureEditorialStore();
  expect(()=>store.create(scope,documentId,['array'],digest)).toThrow('EDITORIAL_PAYLOAD_INVALID');
  expect(()=>store.create(scope,documentId,{value:Infinity},digest)).toThrow();
  expect(()=>store.create(scope,documentId,{name:'test'},'not-a-hash')).toThrow('EDITORIAL_SCOPE_OR_DIGEST_INVALID');
 });
 it('commits and rolls back scoped SQL clients and always releases them',async()=>{
  const sql:string[]=[];
  let released=0;
  let reject=false;
  const pool={connect:async()=>({
   query:async (query:string)=>{
    sql.push(query);
    if(reject&&query.includes('lm_update_document'))throw Error('LM_STALE_REVISION');
    return {rows:[{revision:query.includes('lm_create_document')?1:2}]};
   },
   release:()=>{released++;}
  })};
  const store=new PostgresEditorialStore(pool);
  expect(await store.create(scope,documentId,{name:'toy'},digest)).toBe(1);
  reject=true;
  await expect(store.update(scope,documentId,1,{name:'stale'},digest)).rejects.toThrow('LM_STALE_REVISION');
  expect(sql.filter(x=>x==='BEGIN')).toHaveLength(2);
  expect(sql.filter(x=>x==='COMMIT')).toHaveLength(1);
  expect(sql.filter(x=>x==='ROLLBACK')).toHaveLength(1);
  expect(sql.filter(x=>x.includes('set_config'))).toHaveLength(4);
  expect(released).toBe(2);
 });
});
