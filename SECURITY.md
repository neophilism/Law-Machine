# Security policy

Law Machine is initially a repository foundation, with no hosted application, auth service, private source store, or public filing endpoint. Security controls are implemented alongside each applicable feature in the approved plan.

Do not post secrets, real legal claims, personal information, or exploit details in public issues. Use GitHub private vulnerability reporting if enabled; otherwise coordinate a private channel with the owner before disclosing sensitive details. No private reporting channel is claimed to be configured by this commit.

See [security and testing](docs/SECURITY_AND_TESTING.md), [architecture threats](docs/ARCHITECTURE.md), and [E2EESA progress](security/e2eesa-status.json). AI-assisted review, tests, and remediation are required. Independent human review and certification are separate deferred work and do not prevent development or release.

Intentional publication makes a released pack public. Private authoring data is confidential and later requires authenticated authorization, tenant isolation, controlled storage, and explicit publication. TLS or server-held keys do not make server-readable content private end-to-end encrypted content.
