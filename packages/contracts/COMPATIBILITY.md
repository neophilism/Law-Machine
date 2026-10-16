# Domain contract version 1.0.0

This is the **public data model**, not a legal interpreter or an official legal source. Its TypeScript types live in src/model.ts, structural JSON Schema in schemas/model-bundle-v1.schema.json, and authoritative cross-record checking in src/validate.ts. The exported validator does not execute rules or fetch providers.

## Identity and provenance

- Each billVersion.id is unique within a bundle. Provision and rule IDs are scoped to their immutable bill version; the same displayed ID can appear in two versions without collision.
- Source references pin versionId, provisionId, sourceDigest (64 lowercase hexadecimal SHA-256 characters) and an exact quote found in the cited provision. Every source digest must match the bill version's *declared* source digest. Validating it against actual original bytes is LM-004's responsibility.
- Actor, assumption, scenario, release, and trace-event IDs are unique within the entire bundle. Trace rule IDs resolve in the selected scenario's version scope, rather than an arbitrary version.
- Parent references resolve only within a version; missing parents and ancestry cycles are rejected. A release points to one immutable version and matching source digest.
- Known/unknown is an explicit tagged union. Unknown does not coerce to false or zero. Units must be declared and finite. A trace without pinned provenance fails.

## Compatibility policy

Only schemaVersion **1.0.0** is currently recognized. Unknown major, minor, and patch identifiers fail closed until a deliberate compatibility decision and tests support them. Compatible informational properties may be added, but an execution engine **must not execute unrecognized fields or operations**. Changes to required fields, reference scopes, serialized interpretation, or unknown handling require a new schema contract, migration plan, and archived regression fixture.

The checked-in \`fixtures/v1-hypothetical.json\` is a retained public compatibility example. CI checks its JSON roundtrip, version-local ID reuse, negative inputs and stable validation semantics. It is invented toy law, not legislative source material.

JSON Schema covers portable structural syntax. \`validateBundle\` additionally checks internal references, quote identity, digest consistency, UTC timestamps, quantity restrictions, and cycles. Always run both where a standalone JSON Schema validator is used. A valid model is not proof of source authenticity, current law, correct interpretation, authorized publication or simulation accuracy.

## Safety and limits

The validator expects parsed JSON-compatible plain objects, never functions or executable payloads. It does not call code embedded in model fields. Top-level arrays are limited to 10,000 entries, nested source references to 100, scenario assumption references to 1,000, and identifiers/strings have explicit limits. Diagnostics are capped. Source-file byte limits, parser CPU/depth limits, signature checks, and deployment authorization belong at upstream import/release boundaries.
