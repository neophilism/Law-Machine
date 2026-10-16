# Canonical serialization and release verification (LM-004)

This module is provider-free and works with browser Web Crypto and Node Web Crypto. It establishes deterministic **content identity**, not legal authenticity, publisher identity, secure distribution, or user trust in a release.

## Two separate hashes

1. Original source files are hashed as raw Uint8Array bytes using SHA-256, *before* decoding, normalization, OCR or parsing. Line-ending changes, whitespace, a single byte change or an altered PDF produce a different digest. No original-byte normalization is permitted.
2. JSON objects are serialized by project canonical JSON v1, encoded as UTF-8, then hashed with SHA-256. Object keys sort by ECMAScript lexicographic UTF-16 order recursively. Arrays retain order. Scalars use JSON.stringify semantics, including JSON -0 becoming 0. Numbers must be finite; undefined, functions, symbols, BigInt, non-plain objects, cycles, holes and excessive nesting are not accepted. No skipped properties or volatile-metadata exclusions are allowed: *every included field is part of identity*.

Project canonical JSON v1 is a fixed project contract; it is **not advertised as RFC 8785/JCS conformance**. Canonicalization behavior requires explicit compatibility migration to change. Duplicitous JSON source keys must be detected upstream during original parsing, before parsed objects erase duplicates.

## Manifest, names and trusted root

A release manifest declares schemaVersion, releaseId, original source SHA-256 and a list of assets with SHA-256 digests. Asset names are \`assets/<hex-sha256>.<safe-extension>\`, not relative paths supplied by a visitor. \`verifyRelease\` requires **all** raw asset bytes, original source bytes, and an independently trusted expected manifest digest.

Verification checks that the manifest digest matches that trusted root, source bytes match its pinned source digest, each asset path matches its declared digest and actual bytes, and there are no missing, tampered, duplicate or unexpected assets. It is fail-closed and has no network calls, provider imports, secret keys or database writes.

**Important security boundary:** The hash of a self-supplied manifest proves nothing about publisher identity. An attacker who changes the manifest and the root together can produce another internally consistent bundle. Trusted release pointers, publisher signatures/authorization and transactional publication must be established in later release and publishing milestones. Never label a validated local preview as enacted law.

## Verification and rollback

\`tests/unit/integrity.test.ts\` includes pinned canonical hash vectors, raw-byte differences, tampered/missing/extra assets, invalid paths, untrusted roots, and unsafe JavaScript values. \`tests/browser/integrity.spec.ts\` executes the actual TypeScript implementation compiled into Chromium and compares canonical output and digests with Node on the same fixtures.

No schema migration, stored releases or production service is introduced. Roll back via a reviewed revert of LM-004. Later schemas must negotiate canonical version and trust-root upgrades deliberately, preserving older public release reproducibility.
