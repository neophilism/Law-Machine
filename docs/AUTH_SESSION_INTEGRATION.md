# Law Machine author sessions: safe integration boundary (LM-043)

This document describes a **prepared but disabled** authorization component. It is not an enabled sign-in system. The only production author route still uses `DisabledAuthorIdentityAdapter` and returns HTTP 401.

## Authentication vs local authorization

1. Use a maintained identity provider (candidate: Neon Auth, backed by Better Auth) on a dedicated Law Machine project/branch. Do not share other projects' databases or cookies.
2. Configure provider redirect allowlists, verified callbacks, issuer, session validation and multi-factor/reauthentication as appropriate. Never trust a user-supplied email, provider ID or role.
3. **Only after** independently verifying the provider session, resolve a permanently mapped `(provider, subject) → internal actor UUID` in `lm_author_identities` and issue a CSPRNG `__Host-lm_session` token plus a separate CSRF token.
4. Store only SHA-256 digests of the random opaque tokens in `lm_author_sessions`, along with provider/actor binding, issuance, expiry, last reauthentication and revocation. Send cookies over HTTPS with Secure, Path=/, SameSite=Lax, and HttpOnly for the session token. Rotate by revoking old rows and issuing new tokens. Revoke all session rows on identity compromise and provider logout.
5. `StoredCookieAuthorIdentityAdapter` authenticates each request by looking up the current token digest in a **trusted, server-only database connection**, checking record consistency, expiry and revocation, and matching the CSRF cookie digest in constant time. It obtains organization membership fresh via `lookupMembership(actorId, orgId)`. The existing `authorizeAuthorAction` checks current role and membership revocation and validates Origin/CSRF on every mutation.
6. Provision a dedicated least-privilege PostgreSQL auth service role, with explicit narrow RLS policies for identity/session lookup and scoped membership; never expose its secret to the browser. The LM-043 metadata tables currently have FORCE RLS with no policies and are not accessible to ordinary application users.
7. Keep author routes disabled until real end-to-end tests exercise authentication, session refresh, revocation, multi-org isolation, CSRF, reauthentication, provider outage, DB restart and recovery. Do not treat a fixture adapter or local database success as production acceptance.

## Negative assumptions

Cookie existence alone is **not** authentication. Anonymous users, replayed or expired tokens, duplicate cookies, inconsistent session records, unavailable databases and revoked memberships must fail closed. Never log raw Cookie, Authorization, CSRF or private source data. Do not enable public source uploads or publication until LM-043, LM-044 and LM-047 are accepted.

## Status

Prepared helpers and synthetic tests are in `apps/web/app/lib/author-cookie-session.ts` and `tests/unit/author-cookie-session.test.ts`. They do not connect to Neon Auth, create an author account, store a live token or alter production environment variables. The roadmap records this work as contributing evidence, not completed LM-043. No independent audit is claimed.
