-- LM-042: PostgreSQL editorial storage, no production database provisioned.
-- Apply as ONE transaction. Do not grant table access to public/anonymous roles.
CREATE TABLE lm_organizations (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lm_memberships (
  org_id uuid NOT NULL REFERENCES lm_organizations(id),
  actor_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('contributor','editor','publisher')),
  PRIMARY KEY (org_id, actor_id)
);
CREATE TABLE lm_documents (
  org_id uuid NOT NULL REFERENCES lm_organizations(id),
  id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE TABLE lm_revisions (
  org_id uuid NOT NULL,
  document_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 2000000),
  content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, document_id, revision),
  FOREIGN KEY (org_id, document_id) REFERENCES lm_documents(org_id, id)
);
CREATE TABLE lm_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL,
  document_id uuid NOT NULL,
  revision bigint NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','revised','published','withdrawn')),
  at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, document_id, revision)
    REFERENCES lm_revisions(org_id, document_id, revision)
);
CREATE TABLE lm_sources (
  org_id uuid NOT NULL,
  id uuid NOT NULL,
  document_id uuid NOT NULL,
  byte_digest text NOT NULL CHECK (byte_digest ~ '^[a-f0-9]{64}$'),
  bytes_count bigint NOT NULL CHECK (bytes_count >= 0 AND bytes_count <= 100000000),
  quarantine_state text NOT NULL CHECK (quarantine_state IN ('pending','reviewed','rejected')),
  storage_key text NOT NULL CHECK (length(storage_key) BETWEEN 1 AND 500),
  PRIMARY KEY (org_id, id),
  UNIQUE (org_id, byte_digest),
  FOREIGN KEY (org_id, document_id) REFERENCES lm_documents(org_id, id)
);
CREATE TABLE lm_releases (
  org_id uuid NOT NULL,
  id uuid NOT NULL,
  document_id uuid NOT NULL,
  revision bigint NOT NULL,
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('staged','published','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  FOREIGN KEY (org_id, document_id, revision)
    REFERENCES lm_revisions(org_id, document_id, revision)
);
CREATE TABLE lm_jobs (
  org_id uuid NOT NULL,
  id uuid NOT NULL,
  document_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  kind text NOT NULL CHECK (kind IN ('source-import','model-compile','release-validate')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','completed','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  UNIQUE (org_id, idempotency_key),
  FOREIGN KEY (org_id, document_id) REFERENCES lm_documents(org_id, id)
);
CREATE INDEX lm_jobs_ready_idx ON lm_jobs(org_id, state, lease_until);
CREATE INDEX lm_audit_by_document_idx ON lm_audit(org_id, document_id, id);
CREATE INDEX lm_revisions_by_actor_idx ON lm_revisions(org_id, actor_id);

-- All tenant records deny access without a trusted transaction-local organization.
-- The eventual authoring API MUST set this from authenticated organization context,
-- not user-supplied query parameters. Direct public DB access is unsupported.
ALTER TABLE lm_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_org_scope ON lm_organizations
  USING (id::text = current_setting('app.organization_id',true))
  WITH CHECK (id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_member_scope ON lm_memberships
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_document_scope ON lm_documents
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_revision_scope ON lm_revisions
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_audit_scope ON lm_audit
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_source_scope ON lm_sources
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_release_scope ON lm_releases
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));
ALTER TABLE lm_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY lm_job_scope ON lm_jobs
  USING (org_id::text = current_setting('app.organization_id',true))
  WITH CHECK (org_id::text = current_setting('app.organization_id',true));

CREATE FUNCTION lm_assert_editor(p_org uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.organization_id',true) IS DISTINCT FROM p_org::text OR
     current_setting('app.actor_id',true) IS DISTINCT FROM p_actor::text THEN
    RAISE EXCEPTION 'LM_TENANT_OR_ACTOR_SCOPE' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lm_memberships
    WHERE org_id = p_org AND actor_id = p_actor
      AND role IN ('contributor','editor','publisher')
  ) THEN
    RAISE EXCEPTION 'LM_EDITOR_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE FUNCTION lm_create_document(
  p_org uuid, p_document uuid, p_actor uuid, p_payload jsonb, p_digest text
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM lm_assert_editor(p_org, p_actor);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR
     octet_length(p_payload::text) > 2000000 OR p_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'LM_DOCUMENT_INVALID';
  END IF;
  INSERT INTO lm_documents(org_id,id,revision) VALUES(p_org,p_document,1);
  INSERT INTO lm_revisions(org_id,document_id,revision,payload,content_digest,actor_id)
    VALUES(p_org,p_document,1,p_payload,p_digest,p_actor);
  INSERT INTO lm_audit(org_id,document_id,revision,actor_id,action)
    VALUES(p_org,p_document,1,p_actor,'created');
  RETURN 1;
END;
$$;

CREATE FUNCTION lm_update_document(
  p_org uuid, p_document uuid, p_actor uuid, p_expected bigint,
  p_payload jsonb, p_digest text
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  next_revision bigint;
BEGIN
  PERFORM lm_assert_editor(p_org, p_actor);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR
     octet_length(p_payload::text) > 2000000 OR p_digest !~ '^[a-f0-9]{64}$' OR
     p_expected IS NULL OR p_expected < 1 THEN
    RAISE EXCEPTION 'LM_DOCUMENT_INVALID';
  END IF;
  UPDATE lm_documents SET revision=revision+1,updated_at=now()
    WHERE org_id=p_org AND id=p_document AND revision=p_expected
    RETURNING revision INTO next_revision;
  IF next_revision IS NULL THEN
    RAISE EXCEPTION 'LM_STALE_REVISION';
  END IF;
  INSERT INTO lm_revisions(org_id,document_id,revision,payload,content_digest,actor_id)
    VALUES(p_org,p_document,next_revision,p_payload,p_digest,p_actor);
  INSERT INTO lm_audit(org_id,document_id,revision,actor_id,action)
    VALUES(p_org,p_document,next_revision,p_actor,'revised');
  RETURN next_revision;
END;
$$;
