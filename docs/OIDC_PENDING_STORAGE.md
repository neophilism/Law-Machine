# LM-043: durable pending OAuth state (not active)

Migration 0005 adds a private ten-minute browser-bound OAuth pending state store with an atomic consume function. The provider verifier, nonce, and secret callback state must be encrypted and authenticated by the separately trusted identity service before insertion. Never persist plaintext secrets or return raw payloads to a client.

RLS is FORCE-enabled with no policies; no PUBLIC privileges exist. A privileged and audited service role with appropriately limited access and key management must be separately provisioned before this can work. The function returns at most one matching, not-yet-expired row, deleting it as part of the same PostgreSQL statement. Browser binding and state hashes alone are not proof of provider identity.

Still outstanding: token-signature verification against independently trusted JWKS, session issuance and revocation, authorized membership linkage, service-role policy, transaction/concurrency tests and live identity provider integration. Down migration is destructive and intended for disposable environments only. Do not activate real author routes based on this schema.
