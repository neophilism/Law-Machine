# LM-043: durable pending OAuth state (not active)

Migration 0005 adds a private ten-minute browser-bound OAuth pending state store with an atomic consume function. The provider verifier, nonce, and secret callback state must be encrypted and authenticated by the separately trusted identity service before insertion. Never persist plaintext secrets or return raw payloads to a client.

RLS is FORCE-enabled with no policies; no PUBLIC privileges exist. A privileged and audited service role with appropriately limited access and key management must be separately provisioned before this can work. The function returns at most one matching, not-yet-expired row, deleting it as part of the same PostgreSQL statement. Browser binding and state hashes alone are not proof of provider identity.

`PostgresPendingOidcStore` now supplies parameterized insertion and a single atomic
consume call to this function. It requires a trusted database port and a separately
configured authenticated-encryption protector (maintained service/KMS, metadata-bound
AAD). It never writes plaintext verifier/nonce values to SQL, validates the decrypted
binding and exact timestamp window, and fails closed on store/decryption errors.
The protector is an interface, not a configured cryptographic implementation or key.

`TrustedOidcKeySet` fetches only an independently pinned same-issuer HTTPS JWKS URI,
bounds deadlines and bytes, coalesces concurrent reads, caches for at most five
minutes and permits an unknown-kid rotation refresh after a 30-second cooldown.
Expired keys have no stale fallback during outages. Provider key removal can remain
cached until the five-minute bound; deployments need an explicit revocation/incident
procedure. Signed identity proofs remain subject to nonce/audience/auth_time checks.

Still outstanding: maintained provider and protector wiring, session issuance and
revocation, authorized membership linkage, service-role policy, real transaction/
concurrency integration and live provider acceptance. The new pending-store tests
use an injected database fixture, not a PostgreSQL race test. Down migration remains
destructive and intended for disposable environments only. Author routes stay disabled.

