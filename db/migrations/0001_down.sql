-- DESTRUCTIVE inverse for isolated test databases only.
-- Production recovery: restore database snapshot / PITR; never run unattended.
DROP FUNCTION lm_update_document(uuid,uuid,uuid,bigint,jsonb,text);
DROP FUNCTION lm_create_document(uuid,uuid,uuid,jsonb,text);
DROP FUNCTION lm_assert_editor(uuid,uuid);
DROP TABLE lm_jobs;
DROP TABLE lm_releases;
DROP TABLE lm_sources;
DROP TABLE lm_audit;
DROP TABLE lm_revisions;
DROP TABLE lm_documents;
DROP TABLE lm_memberships;
DROP TABLE lm_organizations;
