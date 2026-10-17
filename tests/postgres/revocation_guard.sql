\set ON_ERROR_STOP on
-- Must execute AFTER author_security.sql revoked org1 membership.
-- All records and roles below are disposable CI fixtures, not real people.
CREATE ROLE lm_ci_revocation_guard NOLOGIN;
GRANT USAGE ON SCHEMA public TO lm_ci_revocation_guard;
GRANT SELECT,INSERT,UPDATE ON lm_memberships,lm_documents,lm_revisions,lm_audit
 TO lm_ci_revocation_guard;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO lm_ci_revocation_guard;
GRANT EXECUTE ON FUNCTION lm_assert_editor(uuid,uuid),
 lm_create_document(uuid,uuid,uuid,jsonb,text),
 lm_update_document(uuid,uuid,uuid,bigint,jsonb,text) TO lm_ci_revocation_guard;
SET ROLE lm_ci_revocation_guard;
SELECT set_config('app.organization_id','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('app.actor_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
BEGIN
 BEGIN
  PERFORM lm_create_document(
   '11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-333333333333',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '{"untrusted":"new"}'::jsonb,repeat('a',64));
  RAISE EXCEPTION 'REVOKED_ACTOR_CREATED_DOCUMENT';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'LM_EDITOR_NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM lm_update_document(
   '11111111-1111-4111-8111-111111111111',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,
   '{"untrusted":"edit"}'::jsonb,repeat('a',64));
  RAISE EXCEPTION 'REVOKED_ACTOR_UPDATED_DOCUMENT';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'LM_EDITOR_NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM lm_documents WHERE id='33333333-3333-4333-8333-333333333333')
 THEN RAISE EXCEPTION 'PARTIAL_REVOKED_WRITE'; END IF;
END $$;
-- Prove this isn't a blanket authoring outage: still-active org2 editor succeeds.
SELECT set_config('app.organization_id','22222222-2222-4222-8222-222222222222',false);
SELECT set_config('app.actor_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT lm_create_document(
 '22222222-2222-4222-8222-222222222222',
 '44444444-4444-4444-8444-444444444444',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '{"toy":"current membership"}'::jsonb,repeat('b',64));
DO $$ BEGIN
 IF (SELECT revision FROM lm_documents WHERE org_id='22222222-2222-4222-8222-222222222222'
      AND id='44444444-4444-4444-8444-444444444444')<>1 THEN
  RAISE EXCEPTION 'VALID_AUTHOR_DENIED';
 END IF;
END $$;
RESET ROLE;
DROP OWNED BY lm_ci_revocation_guard;
DROP ROLE lm_ci_revocation_guard;
