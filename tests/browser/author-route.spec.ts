import {test,expect} from '@playwright/test';
test('author routes default to denied without verified provider, even with supplied cookies',async({request})=>{
 const org='11111111-1111-4111-8111-111111111111';
 const url='/api/author/'+org+'/preview';
 for(const headers of [{},{'cookie':'session=forged; role=publisher; org='+org},{'authorization':'Bearer fake'},{'x-organization-id':org}]){
  const res=await request.get(url,{headers});
  expect(res.status()).toBe(401);
  expect((await res.json()).code).toBe('AUTH_REQUIRED');
  expect(res.headers()['cache-control']).toBe('no-store');
 }
});
