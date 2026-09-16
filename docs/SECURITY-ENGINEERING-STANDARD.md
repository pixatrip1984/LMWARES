# LMWares Security Engineering Standard

Status: mandatory baseline for all new work.

This document defines the minimum security bar for LMWares. Cloudflare controls are defense in depth; application correctness must not depend on the edge being perfectly configured.

## Non-negotiable principles

1. Deny by default. New capabilities expose only the minimum behavior required.
2. Least privilege. Every token, Worker binding, browser capability, filesystem path, API route and CI permission gets the smallest scope that works.
3. Explicit trust boundaries. Browser input, client state, generated content, uploads, external APIs, webhooks, AI output and local-runner output are untrusted until validated at the boundary that consumes them.
4. Server-side authorization. The client may express intent; it never decides identity, ownership, role, price, entitlement, lifecycle state or authorization.
5. Fail closed. Missing, malformed, stale, unverifiable or ambiguous security state rejects the operation.
6. No security by obscurity. Public routes remain safe even when an attacker knows their shape and implementation.
7. No secrets in source, browser bundles, public manifests, generated demos, logs, URLs or error payloads. Remote secrets belong in the platform secret store; local secrets stay in ignored local secret files.
8. Minimize sensitive data. Do not send, persist, log or copy PII/private operational data unless the feature strictly requires it.
9. Immutable/auditable transitions for privileged workflows. Sensitive state changes must have a verifiable actor/context and reject stale or replayed operations.
10. Defense in depth. Edge controls, application validation, authorization, data constraints and monitoring should independently reduce risk.

## Mandatory review for every public surface

Before implementation, identify:
- assets and sensitive data touched;
- callers and trust level;
- authentication and authorization boundary;
- abuse cases, replay/enumeration risk and expected rate;
- persistence and lifecycle transitions;
- external network/file/browser capabilities;
- rollback/failure behavior.

Every public route or tool must consider, where applicable:
- strict schema validation and bounded request sizes;
- canonicalization before security decisions;
- authorization after resource lookup and before mutation;
- exact CORS allowlists rather than permissive wildcard credentials;
- CSRF protection for cookie-authenticated mutations;
- request/replay idempotency for financially or operationally sensitive mutations;
- rate limiting and abuse controls at both application and edge layers when warranted;
- enumeration-resistant responses for private resources;
- safe output encoding and no untrusted HTML/script execution;
- upload limits, content validation and storage isolation;
- SSRF protection: no arbitrary URL fetching; use explicit schemes/hosts and revalidate redirects when network fetching is required;
- path traversal protection: resolved paths must remain inside the intended root;
- safe logging: identifiers needed for audit, never secrets or unnecessary PII;
- cryptographically secure randomness for security tokens;
- explicit cache rules so private/authenticated responses cannot become public cache entries.

Turnstile, WAF rules, Access, rate limits and other Cloudflare controls are additional layers; none replaces application authorization or input validation.

## Generated code, AI and automation

AI/model/browser-extension/local-runner output is untrusted input.

- Never execute generated code with production credentials or unrestricted host access before validation.
- Generated manifests/packages must be schema-validated and size-bounded.
- File names and paths must be normalized and constrained to an explicit workspace root.
- Artifact identity/integrity should be recorded with cryptographic hashes when crossing process or review boundaries.
- Automation that claims/leases work must reject stale ownership/generation and must not complete work after losing its lease.
- Public creative/demo contexts must contain only data deliberately classified as public.

## Dependencies and CI

- Lock dependencies; reproducible CI installs use the committed lockfile.
- GitHub Actions must be pinned to immutable commit SHAs, not floating tags.
- CI receives read-only repository permissions unless a narrowly reviewed job demonstrably needs more.
- Checkout credentials are not persisted in verification jobs.
- Verification workflows must not use `pull_request_target` to execute untrusted pull-request code.
- No production secrets are supplied to generic build/test jobs.
- Runtime dependency vulnerabilities at high/critical severity block normal merge until reviewed and remediated or explicitly documented with a bounded exception.
- New third-party actions/packages require a supply-chain review proportional to their privilege and runtime exposure.

## Required merge evidence

A change is not considered ready merely because the happy path works. Relevant evidence must include:
- lint/typecheck/build success;
- existing regression tests;
- new positive tests for new behavior;
- negative/adversarial tests for security-sensitive boundaries;
- authorization tests for privileged mutations;
- validation tests for malformed, oversized, stale and replayed inputs where relevant;
- confirmation that no new secrets or unnecessary PII cross the changed boundary.

Security-sensitive code should prefer small, reviewable commits and explicit invariants over broad rewrites.

## Repository/change discipline

- Do not develop security-sensitive work directly on the default branch.
- Do not merge solely because code compiles.
- Do not perform production deploys, remote database migrations, secret rotation or destructive operations as an incidental part of a feature change.
- Production-impacting operations require an explicit step and separate confirmation.
- If a security invariant cannot be demonstrated, stop the release rather than weakening the invariant to make the pipeline green.

## Incident rule

If a plausible vulnerability is discovered while implementing another feature, stop expanding the feature, preserve evidence without copying secrets into tickets/logs, bound the affected surface, fix the invariant, add a regression test and rotate/revoke credentials when exposure is possible.

This standard is intentionally stricter than the minimum needed to ship. Security is a product property of LMWares, not a later Cloudflare configuration task.
