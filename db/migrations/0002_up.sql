-- LM-043 contributing implementation. No public auth feature is enabled.
-- Requires LM-042. Apply atomically, on a privileged migration connection.
-- These new author tables intentionally have FORCE RLS and NO access policy:
-- a future isolated service role/policy must be provisioned and verified first.
ALTER TABLE lm_memberships
  ADD COLUMN membership_revision bigint NOT NULL DEFAULT 1 CHECK (membership_revision > 0),
  ADD COLUMN revoked_at timestamptz;

CREATE FUNCTION lm_guard_membership_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN
    RAISE EXCEPTION 'LM_MEMBERSHIP_ID_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'LM_MEMBERSHIP_REVOCATION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  NEW.membership_revision := OLD.membership_revision + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER lm_membership_revision_guard BEFORE UPDATE ON lm_memberships
  FOR EACH ROW EXECUTE FUNCTION lm_guard_membership_change();

-- Namespaced identity mappings are never derived from a user-supplied actor ID.
-- Only a verified external provider callback may enroll an identity.
CREATE TABLE lm_author_identities (
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._-]{0,63}$'),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  actor_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,subject),
  UNIQUE(provider,subject,actor_id)
);
ALTER TABLE lm_author_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_author_identities FORCE ROW LEVEL SECURITY;

-- Only SHA-256 digests of high-entropy session and CSRF tokens are persisted;
-- raw credentials and identity-provider secrets are never stored here.
CREATE TABLE lm_author_sessions (
  id uuid PRIMARY KEY,
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  csrf_digest text NOT NULL CHECK (csrf_digest ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL,
  subject text NOT NULL,
  actor_id uuid NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_reauthenticated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(provider,subject,actor_id)
    REFERENCES lm_author_identities(provider,subject,actor_id) ON DELETE RESTRICT,
  CONSTRAINT lm_session_window CHECK (
    expires_at > issued_at AND
    expires_at <= issued_at + INTERVAL '24 hours' AND
    last_reauthenticated_at >= issued_at AND
    last_reauthenticated_at <= expires_at AND
    (revoked_at IS NULL OR revoked_at >= issued_at)
  )
);
CREATE INDEX lm_author_sessions_expiry_idx ON lm_author_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX lm_author_sessions_actor_idx ON lm_author_sessions(actor_id,expires_at);
ALTER TABLE lm_author_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_author_sessions FORCE ROW LEVEL SECURITY;

CREATE FUNCTION lm_guard_author_session_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
   OR NEW.token_digest IS DISTINCT FROM OLD.token_digest
   OR NEW.csrf_digest IS DISTINCT FROM OLD.csrf_digest
   OR NEW.provider IS DISTINCT FROM OLD.provider
   OR NEW.subject IS DISTINCT FROM OLD.subject
   OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
   OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
   OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'LM_AUTH_SESSION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'LM_SESSION_REVOCATION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER lm_author_session_change_guard BEFORE UPDATE ON lm_author_sessions
 FOR EACH ROW EXECUTE FUNCTION lm_guard_author_session_change();

REVOKE ALL ON TABLE lm_author_identities,lm_author_sessions FROM PUBLIC;
-- A managed identity provider, backing service grant, session issuance and
-- issuer/redirect verification are not configured by this schema migration.
