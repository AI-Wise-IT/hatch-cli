# CLI distribution: public npm registry, npx as primary invocation

## Metadata

- **id:** 0006-npm-public-distribution
- **component:** cli-distribution
- **status:** accepted
- **applies_to:** the Hatch CLI's `package.json` publish configuration and its installation/invocation documentation
- **decision_record:** `docs/architecture/decisions/0006-npm-public-distribution.md`

## Decision

Hatch CLI is published as a public package on the public npm registry (npmjs.org), under the scoped package name `@ai-wise/hatchcli`. The primary invocation is `npx @ai-wise/hatchcli@latest`; the installed CLI command itself is still `hatchcli` (the package's `bin` map key, independent of its scope). `npm install -g @ai-wise/hatchcli` remains available as an optional convenience for frequent desktop use, not the primary path. Only the `latest` npm dist-tag is used in this MVP — no separate beta/pre-release channel.

### Package name corrections (post-acceptance)

Two corrections, both discovered during `build-infrastructure-batch`'s bootstrap publish attempt, in order:

1. The package name was originally recorded as `hatch-cli`. `npm view hatch-cli` showed that name already claimed by an unrelated, unaffiliated published package (v1.1.5) — it was never available. The developer chose the unscoped alternative `hatchcli` from a set of confirmed-available options.
2. Publishing `hatchcli` (unscoped) then failed with npm's anti-typosquatting check: `403 Package name too similar to existing package hatch-cli`. Unscoped names are checked for similarity against every existing package on the registry; `hatchcli` was rejected even though it was itself available, purely for being too close to the still-squatted `hatch-cli`. Scoped packages (`@scope/name`) aren't subject to this global-similarity check, so the developer created a free npm organization (`ai-wise`, public-packages-only plan) and the package moved to `@ai-wise/hatchcli`.

Every other part of this decision — public registry, `latest`-only dist-tag, no private flag, no non-default registry, no embedded credentials — is unchanged. This is a correction to the same accepted decision, not a new proposal.

## Context

[0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) chose Node.js/npm as the CLI runtime largely because cloud-agent sandboxes (Claude Code, Codex) reliably allow-list the public npm registry in their default egress proxy configuration — that same finding carries directly into this decision. The developer confirmed, when this cluster was settled, that public distribution is acceptable "as long as the package is only usable with the password" — which already holds by construction: [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) and [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md) put all access control at the registry-content layer (the GitHub PAT gating `hatch login`/`hatch import`), not in the CLI package itself. The published CLI code contains no secrets and no private skill content, so its own visibility is not a security boundary.

## Alternatives Considered

- **GitHub Packages npm registry, authenticated with the existing GitHub PAT.** Not chosen: requires a `.npmrc` pointing at `npm.pkg.github.com` in every fresh sandbox — an extra setup step, and that endpoint isn't confirmed to sit on the same default egress allowlist as `registry.npmjs.org`, risking a reintroduction of the exact cloud-sandbox friction [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) chose Node/npm specifically to avoid.

## Trade-offs Accepted

- **Prompt coherence:** high — `npx @ai-wise/hatchcli` follows the same familiar npm scoped-package invocation pattern an agent already knows, with no extra configuration beyond including the scope.
- **Failure surface:** the CLI's source is publicly world-readable; accepted because no secret or private skill content lives in it — the sensitive layer is the registry credential (0005), not the CLI code.
- **Reversibility:** standard npm publish/unpublish path; well-trodden if a platform change is ever needed.
- **Operational simplicity:** no additional credential is needed just to install or run the CLI itself, on top of the one GitHub PAT already required for registry access.

## Consequences

- `package.json`'s `name` field must be `@ai-wise/hatchcli` — not `hatch-cli` (unavailable, unrelated package) and not unscoped `hatchcli` (rejected by npm's anti-typosquatting similarity check).
- `package.json` must set `publishConfig.access` to `public` — scoped packages default to private on publish otherwise — and must not set `"private": true` or configure `publishConfig.registry` to point anywhere other than the default public npm registry.
- The CLI source and its published package must never embed the GitHub PAT, harness-registry contents, or any other registry credential — already required structurally by [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md), restated here as an explicit publish-time expectation.
- Release mechanics — how a new version actually gets published and what triggers it — are the subject of the Deployment/CI-CD cluster, not this record.
- Any installation or invocation documentation must say `npx @ai-wise/hatchcli@latest`, not `hatch-cli` or unscoped `hatchcli`.
- The `ai-wise` npm organization (free, public-packages-only plan) now exists and owns this package; no private packages should be added to it without a paid-plan decision, which this record does not make.

## Agent Rules

- MUST publish Hatch CLI as a public package named `@ai-wise/hatchcli` to the default public npm registry, with `publishConfig.access: "public"` set.
- MUST NOT set `"private": true` in `package.json` or configure a non-default private publish registry without superseding this record.
- MUST NOT embed any registry credential, token, or private skill content in the published package.
- MUST NOT revert the package name to `hatch-cli` or unscoped `hatchcli` — the former belongs to an unrelated package, the latter is blocked by npm's similarity check against it.

## Invariants

- **MUST NOT revert the package name from `@ai-wise/hatchcli`.** Becomes irreversible once: any real user has installed or scripted around `npx @ai-wise/hatchcli` — renaming breaks every existing invocation outright, and npm's own registry-immutability policy means an abandoned name/version can never be reclaimed if this one is ever unpublished. Enforcement mechanism: npm's own registry (external to this project) rejects re-publishing a version under a name it's already seen; internally, `hatch-cli`'s CI `decision-records` job executes this record's Machine Check on every pull request, failing a `package.json` marked private or renamed away from `@ai-wise/hatchcli`. Current mode: blocking.

## Machine Check

- **context:** cli-repo

```bash
grep -q '"private": true' package.json && { echo "VIOLATION: package.json marks the package private"; exit 1; }
grep -q '"name": "@ai-wise/hatchcli"' package.json || { echo "VIOLATION: package is not named @ai-wise/hatchcli"; exit 1; }
echo "public, and named @ai-wise/hatchcli: correct"
```

Expected result: the confirmation line, exit 0 — `package.json` does not mark the package private, and is named `@ai-wise/hatchcli`.

## Precedence

- Builds on [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) (npm chosen for sandbox-egress reasons) and [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md) (the auth model that makes public distribution safe).
- No known conflicting decision records.
