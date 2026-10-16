# ADR-0004: Continuous AI-led verification with honest security scope

Status: accepted under the owner's policy.

Apply End-to-End Everywhere controls to each actual component and data flow. Public releases are intentional public disclosures. Private authoring requires authorized server processing, tenant isolation and explicit publication; transport/storage encryption alone is not private E2EE. Do not introduce bespoke cryptography.

Track implementation, complete testing and independent review separately. The foundation declares planned components and controls, not a certified runtime. As each component lands, update its inventory, threat cases and source-bound evidence. Use the pinned standard development commit as a reference, without upgrading it to a production certification basis.

The agent performs all applicable implementation and tests and fixes failures. Independent human review/certification is deferred and does not gate development or release. Actual unresolved vulnerabilities, failed required checks, missing credentials and transaction authorization still require concrete resolution for the affected action. Continue safe independent work when one integration is unavailable.

Before PR merge, verify required checks on the current head and use an expected-SHA constraint. Local test results do not masquerade as remote CI. No deployment is claimed without actual resource and deployed-source evidence.
