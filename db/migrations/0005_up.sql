-- LM-043: private, encrypted, one-time OAuth callback state; not activated.
CREATE TABLE lm_oidc_pending_logins (
 state_digest text PRIMARY KEY CHECK (state_digest ~ '^[a-f0-9]{64}$'),
 browser_digest text NOT NULL CHECK (browser_digest ~ '^[a-f0-9]{64}$'),
 issuer text NOT NULL CHECK (length(issuer) BETWEEN 10 AND 2048),
 redirect_uri text NOT NULL CHECK (length(redirect_uri) BETWEEN 10 AND 2048),
 encrypted_payload bytea NOT NULL CHECK (octet_length(encrypted_payload) BETWEEN 32 AND 8192),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CONSTRAINT lm_oidc_pending_window CHECK (expires_at=issued_at+INTERVAL '10 minutes')
);
CREATE INDEX lm_oidc_pending_expiry ON lm_oidc_pending_logins(expires_at);
ALTER TABLE lm_oidc_pending_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE lm_oidc_pending_logins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lm_oidc_pending_logins FROM PUBLIC;
CREATE FUNCTION lm_consume_oidc_pending(p_state text,p_browser text)
RETURNS TABLE(issuer text,redirect_uri text,encrypted_payload bytea,
 issued_at timestamptz,expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_state IS NULL OR p_browser IS NULL OR
 p_state !~ '^[a-f0-9]{64}$' OR p_browser !~ '^[a-f0-9]{64}$'
 THEN RETURN; END IF;
 RETURN QUERY DELETE FROM lm_oidc_pending_logins p
 WHERE p.state_digest=p_state AND p.browser_digest=p_browser
 AND p.expires_at>clock_timestamp() AND p.issued_at<=clock_timestamp()
 RETURNING p.issuer,p.redirect_uri,p.encrypted_payload,p.issued_at,p.expires_at;
END; $$;
REVOKE ALL ON FUNCTION lm_consume_oidc_pending(text,text) FROM PUBLIC;
