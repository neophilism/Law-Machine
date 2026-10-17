-- LM-043 contributing migration: defense in depth after membership revocation.
-- Run atomically after 0002. This does not provision auth or enable author routes.
CREATE OR REPLACE FUNCTION lm_assert_editor(p_org uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
 IF current_setting('app.organization_id',true) IS DISTINCT FROM p_org::text OR
    current_setting('app.actor_id',true) IS DISTINCT FROM p_actor::text THEN
  RAISE EXCEPTION 'LM_TENANT_OR_ACTOR_SCOPE' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM lm_memberships
    WHERE org_id=p_org AND actor_id=p_actor
      AND role IN ('contributor','editor','publisher')
      AND revoked_at IS NULL
 ) THEN
  RAISE EXCEPTION 'LM_EDITOR_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
END;
$$;
