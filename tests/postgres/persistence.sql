\set ON_ERROR_STOP on
-- Synthetic UUIDs only. This test never holds user/editor private records.
INSERT INTO lm_organizations(id,slug) VALUES
 ('11111111-1111-4111-8111-111111111111','fictional-one'),
 ('22222222-2222-4222-8222-222222222222','fictional-two');
INSERT INTO lm_memberships(org_id,actor_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','editor'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','editor');

-- Nonowner app role: test RLS without relying on superuser table access.
CREATE ROLE lm_ci_editor NOLOGIN;
GRANT USAGE ON SCHEMA public TO lm_ci_editor;
GRANT SELECT,INSERT,UPDATE ON lm_organizations,lm_memberships,lm_documents,
  lm_revisions,lm_audit,lm_sources,lm_releases,lm_jobs TO lm_ci_editor;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO lm_ci_editor;
GRANT EXECUTE ON FUNCTION lm_assert_editor(uuid,uuid),
  lm_create_document(uuid,uuid,uuid,jsonb,text),
  lm_update_document(uuid,uuid,uuid,bigint,jsonb,text) TO lm_ci_editor;

-- A simulated audit write failure must roll back the revision pointer too.
CREATE FUNCTION lm_ci_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action = 'revised' AND NEW.revision = 3 THEN
    RAISE EXCEPTION 'LM_CI_AUDIT_REJECTED';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER lm_ci_audit_failure BEFORE INSERT ON lm_audit
  FOR EACH ROW EXECUTE FUNCTION lm_ci_reject_audit();

SET ROLE lm_ci_editor;
SELECT set_config('app.organization_id','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('app.actor_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT lm_create_document(
 '11111111-1111-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '{"title":"fictional draft","status":"draft"}'::jsonb,repeat('a',64)
);
SELECT lm_update_document(
 '11111111-1111-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,
 '{"title":"fictional revision 2"}'::jsonb,repeat('b',64)
);
DO $$
DECLARE n bigint; BEGIN
 SELECT revision INTO n FROM lm_documents
 WHERE org_id='11111111-1111-4111-8111-111111111111'
   AND id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF n <> 2 THEN RAISE EXCEPTION 'REVISION_NOT_TWO'; END IF;
 IF (SELECT count(*) FROM lm_revisions) <> 2 THEN
   RAISE EXCEPTION 'REVISION_HISTORY_MISSING';
 END IF;
 BEGIN
   PERFORM lm_update_document('11111111-1111-4111-8111-111111111111',
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'{"stale":true}'::jsonb,repeat('c',64));
   RAISE EXCEPTION 'EXPECTED_STALE_CONFLICT';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'LM_STALE_REVISION' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM lm_update_document('11111111-1111-4111-8111-111111111111',
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'{"willRollBack":true}'::jsonb,repeat('c',64));
   RAISE EXCEPTION 'EXPECTED_AUDIT_REJECTION';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'LM_CI_AUDIT_REJECTED' THEN RAISE; END IF;
 END;
 IF (SELECT revision FROM lm_documents WHERE org_id='11111111-1111-4111-8111-111111111111'
     AND id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 2 THEN
   RAISE EXCEPTION 'PARTIAL_METADATA_WRITE';
 END IF;
 IF (SELECT count(*) FROM lm_revisions) <> 2 OR (SELECT count(*) FROM lm_audit) <> 2 THEN
   RAISE EXCEPTION 'PARTIAL_AUDIT_WRITE';
 END IF;
END $$;

-- RLS enforces that the same app DB role cannot read other org rows.
SELECT set_config('app.organization_id','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM lm_documents) <> 0 THEN
   RAISE EXCEPTION 'CROSS_TENANT_READ_ALLOWED';
 END IF;
 BEGIN
   PERFORM lm_update_document('11111111-1111-4111-8111-111111111111',
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'{"crossOrg":true}'::jsonb,repeat('d',64));
   RAISE EXCEPTION 'EXPECTED_TENANT_DENIAL';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'LM_TENANT_OR_ACTOR_SCOPE' THEN RAISE; END IF;
 END;
END $$;

RESET ROLE;
DROP TRIGGER lm_ci_audit_failure ON lm_audit;
DROP FUNCTION lm_ci_reject_audit();
-- Test-only inverse in a transaction. The original representative records survive rollback.
BEGIN;
\i db/migrations/0001_down.sql
DO $$ BEGIN
 IF to_regclass('public.lm_documents') IS NOT NULL THEN
  RAISE EXCEPTION 'DOWN_MIGRATION_NOT_EFFECTIVE';
 END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
 IF (SELECT count(*) FROM lm_revisions) <> 2 THEN
  RAISE EXCEPTION 'TRANSACTIONAL_RECOVERY_DID_NOT_RESTORE';
 END IF;
END $$;
DROP ROLE lm_ci_editor;
