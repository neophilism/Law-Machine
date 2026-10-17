import {authorizeAuthorAction,DisabledAuthorIdentityAdapter} from '../../../../lib/author-auth.ts';

// LM-043 author API surface remains fail-closed until maintained OIDC provider,
// rotating secure sessions and trusted organization authorization are integrated.
export async function GET(
  request:Request,
  context:{params:Promise<{organizationId:string}>}
):Promise<Response>{
  const {organizationId}=await context.params;
  const access=await authorizeAuthorAction({
    request,organizationId,action:'view',
    adapter:new DisabledAuthorIdentityAdapter()
  });
  if(!access.authorized)return Response.json({code:access.code},
    {status:401,headers:{'Cache-Control':'no-store'}});
  return Response.json({code:'AUTHOR_PREVIEW_NOT_ENABLED'},
    {status:503,headers:{'Cache-Control':'no-store'}});
}
