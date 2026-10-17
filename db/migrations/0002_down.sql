-- Destructive inverse for disposable test branches only.
-- Use snapshot/PITR for production recovery; never run this unattended there.
DROP TRIGGER lm_author_session_change_guard ON lm_author_sessions;
DROP FUNCTION lm_guard_author_session_change();
DROP TABLE lm_author_sessions;
DROP TABLE lm_author_identities;
DROP TRIGGER lm_membership_revision_guard ON lm_memberships;
DROP FUNCTION lm_guard_membership_change();
ALTER TABLE lm_memberships
  DROP COLUMN membership_revision,
  DROP COLUMN revoked_at;
