\set ON_ERROR_STOP on
-- LM-043 synthetic, disposable-DB only. Privileged fixture role tests atomic one-time consumption.
INSERT INTO lm_oidc_pending_logins(state_digest,browser_digest,issuer,redirect_uri,
 encrypted_payload,issued_at,expires_at)
VALUES(repeat('a',64),repeat('b',64),'https://id.example.test/',
 'https://app.example.test/callback',decode(repeat('cc',48),'hex'),
 now()-INTERVAL '1 minute',now()+INTERVAL '9 minutes');
DO $$
DECLARE result record; count_found integer;
BEGIN
 SELECT count(*) INTO count_found FROM lm_consume_oidc_pending(repeat('a',64),repeat('c',64));
 IF count_found<>0 THEN RAISE EXCEPTION 'WRONG_BROWSER_CONSUMED'; END IF;
 SELECT * INTO result FROM lm_consume_oidc_pending(repeat('a',64),repeat('b',64));
 IF result.issuer IS DISTINCT FROM 'https://id.example.test/' OR
    octet_length(result.encrypted_payload)<>48 THEN
  RAISE EXCEPTION 'VALID_OAUTH_STATE_LOST'; END IF;
 SELECT count(*) INTO count_found FROM lm_consume_oidc_pending(repeat('a',64),repeat('b',64));
 IF count_found<>0 THEN RAISE EXCEPTION 'OAUTH_REPLAY_ACCEPTED'; END IF;
END $$;
INSERT INTO lm_oidc_pending_logins(state_digest,browser_digest,issuer,redirect_uri,
 encrypted_payload,issued_at,expires_at)
VALUES(repeat('d',64),repeat('e',64),'https://id.example.test/',
 'https://app.example.test/callback',decode(repeat('ff',48),'hex'),
 now()-INTERVAL '11 minutes',now()-INTERVAL '1 minute');
DO $$
DECLARE count_found integer;
BEGIN
 SELECT count(*) INTO count_found FROM lm_consume_oidc_pending(repeat('d',64),repeat('e',64));
 IF count_found<>0 THEN RAISE EXCEPTION 'EXPIRED_OAUTH_STATE_CONSUMED'; END IF;
END $$;
CREATE ROLE lm_ci_oidc_untrusted NOLOGIN;
GRANT USAGE ON SCHEMA public TO lm_ci_oidc_untrusted;
GRANT SELECT,INSERT ON lm_oidc_pending_logins TO lm_ci_oidc_untrusted;
SET ROLE lm_ci_oidc_untrusted;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM lm_oidc_pending_logins) THEN
  RAISE EXCEPTION 'PRIVATE_OAUTH_STATE_DISCLOSED'; END IF;
 BEGIN
  INSERT INTO lm_oidc_pending_logins(state_digest,browser_digest,issuer,redirect_uri,
  encrypted_payload,issued_at,expires_at)
  VALUES(repeat('f',64),repeat('b',64),'https://id.example.test/',
   'https://app.example.test/callback',decode(repeat('cc',48),'hex'),
   now(),now()+INTERVAL '10 minutes');
  RAISE EXCEPTION 'UNTRUSTED_OAUTH_INSERT_PERMITTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DROP OWNED BY lm_ci_oidc_untrusted;
DROP ROLE lm_ci_oidc_untrusted;
