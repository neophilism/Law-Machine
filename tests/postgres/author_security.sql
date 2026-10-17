\set ON_ERROR_STOP on
-- LM-043 test: no real users, tokens, or providers. Runs on disposable PostgreSQL.
INSERT INTO lm_author_identities(provider,subject,actor_id)
VALUES ('fixture-idp','fixture-user-1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO lm_author_sessions
 (id, token_digest, csrf_digest, provider, subject, actor_id, issued_at,
  expires_at, last_reauthenticated_at)
VALUES
 ('99999999-9999-4999-8999-999999999999',repeat('a',64),repeat('b',64),
  'fixture-idp','fixture-user-1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2026-10-17T11:00:00Z','2026-10-17T17:00:00Z','2026-10-17T11:05:00Z');

DO $$
BEGIN
 IF (SELECT count(*) FROM lm_author_sessions) <> 1 THEN
  RAISE EXCEPTION 'SESSION_NOT_PERSISTED'; END IF;
 IF (SELECT membership_revision FROM lm_memberships
     WHERE org_id='11111111-1111-4111-8111-111111111111') <> 1 THEN
  RAISE EXCEPTION 'MEMBERSHIP_REVISION_INITIAL'; END IF;
END $$;
UPDATE lm_memberships SET role='publisher'
 WHERE org_id='11111111-1111-4111-8111-111111111111'
   AND actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$
BEGIN
 IF (SELECT membership_revision FROM lm_memberships
     WHERE org_id='11111111-1111-4111-8111-111111111111') <> 2 THEN
  RAISE EXCEPTION 'MEMBERSHIP_REVISION_NOT_ADVANCED'; END IF;
END $$;

UPDATE lm_memberships SET revoked_at='2026-10-17T12:00:00Z'
 WHERE org_id='11111111-1111-4111-8111-111111111111';
DO $$
BEGIN
 IF (SELECT membership_revision FROM lm_memberships
     WHERE org_id='11111111-1111-4111-8111-111111111111') <> 3 THEN
  RAISE EXCEPTION 'MEMBERSHIP_REVOCATION_NOT_VERSIONED'; END IF;
 BEGIN
  UPDATE lm_memberships SET revoked_at=NULL
    WHERE org_id='11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'MEMBERSHIP_UNREVOCATION_PERMITTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;

UPDATE lm_author_sessions SET revoked_at='2026-10-17T12:00:00Z'
 WHERE id='99999999-9999-4999-8999-999999999999';
DO $$
BEGIN
 BEGIN
  UPDATE lm_author_sessions SET revoked_at=NULL
   WHERE id='99999999-9999-4999-8999-999999999999';
  RAISE EXCEPTION 'SESSION_UNREVOCATION_PERMITTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE lm_author_sessions SET token_digest=repeat('c',64)
   WHERE id='99999999-9999-4999-8999-999999999999';
  RAISE EXCEPTION 'SESSION_SECRET_CHANGED_IN_PLACE';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO lm_author_sessions(id,token_digest,csrf_digest,provider,subject,actor_id,issued_at,expires_at,last_reauthenticated_at)
  VALUES('88888888-8888-4888-8888-888888888888',repeat('c',64),repeat('d',64),
    'fixture-idp','fixture-user-1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '2026-10-17T11:00:00Z','2026-10-17T12:00:00Z','2026-10-17T11:00:00Z');
  RAISE EXCEPTION 'CROSS_IDENTITY_SESSION_ACCEPTED';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO lm_author_sessions(id,token_digest,csrf_digest,provider,subject,actor_id,issued_at,expires_at,last_reauthenticated_at)
  VALUES('77777777-7777-4777-8777-777777777777',repeat('c',64),repeat('d',64),
    'fixture-idp','fixture-user-1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-10-17T11:00:00Z','2026-10-19T12:00:00Z','2026-10-17T11:00:00Z');
  RAISE EXCEPTION 'OVERLONG_SESSION_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;

-- Grant simulated query permissions: FORCE RLS with no policy MUST still deny.
CREATE ROLE lm_ci_auth_untrusted NOLOGIN;
GRANT USAGE ON SCHEMA public TO lm_ci_auth_untrusted;
GRANT SELECT,INSERT,UPDATE ON lm_author_sessions,lm_author_identities TO lm_ci_auth_untrusted;
SET ROLE lm_ci_auth_untrusted;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM lm_author_sessions) OR
    EXISTS (SELECT 1 FROM lm_author_identities) THEN
  RAISE EXCEPTION 'PUBLIC_IDENTITY_OR_SESSION_DISCLOSED';
 END IF;
 BEGIN
  INSERT INTO lm_author_identities(provider,subject,actor_id)
  VALUES ('fixture-idp','attacker','66666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'ANONYMOUS_IDENTITY_ENROLLMENT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DROP OWNED BY lm_ci_auth_untrusted;
DROP ROLE lm_ci_auth_untrusted;
-- Down migration is tested independently by workflow; never exercise on real data.
