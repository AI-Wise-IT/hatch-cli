# CLI distribution: public npm registry, npx as primary invocation

## Metadata

- **id:** 0006-npm-public-distribution
- **component:** cli-distribution
- **status:** accepted
- **applies_to:** the Hatch CLI's `package.json` publish configuration and its installation/invocation documentation
- **decision_record:** `docs/architecture/decisions/0006-npm-public-distribution.md`

## Decision

Hatch CLI is published as a public package on the public npm registry (npmjs.org). The primary invocation is `npx hatch-cli@latest`, requiring no local installation step. `npm install -g hatch-cli` remains available as an optional convenience for frequent desktop use, not the primary path. Only the `latest` npm dist-tag is used in this MVP — no separate beta/pre-release channel.

## Context

[0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) chose Node.js/npm as the CLI runtime largely because cloud-agent sandboxes (Claude Code, Codex) reliably allow-list the public npm registry in their default egress proxy configuration — that same finding carries directly into this decision. The developer confirmed, when this cluster was settled, that public distribution is acceptable "as long as the package is only usable with the password" — which already holds by construction: [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) and [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md) put all access control at the registry-content layer (the GitHub PAT gating `hatch login`/`hatch import`), not in the CLI package itself. The published CLI code contains no secrets and no private skill content, so its own visibility is not a security boundary.

## Alternatives Considered

- **GitHub Packages npm registry, authenticated with the existing GitHub PAT.** Not chosen: requires a `.npmrc` pointing at `npm.pkg.github.com` in every fresh sandbox — an extra setup step, and that endpoint isn't confirmed to sit on the same default egress allowlist as `registry.npmjs.org`, risking a reintroduction of the exact cloud-sandbox friction [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) chose Node/npm specifically to avoid.

## Trade-offs Accepted

- **Prompt coherence:** high — `npx hatch-cli` is the default npm invocation an agent already knows, with no extra configuration.
- **Failure surface:** the CLI's source is publicly world-readable; accepted because no secret or private skill content lives in it — the sensitive layer is the registry credential (0005), not the CLI code.
- **Reversibility:** standard npm publish/unpublish path; well-trodden if a platform change is ever needed.
- **Operational simplicity:** no additional credential is needed just to install or run the CLI itself, on top of the one GitHub PAT already required for registry access.

## Consequences

- `package.json` must not set `"private": true` and must not configure `publishConfig.registry` to point anywhere other than the default public npm registry.
- The CLI source and its published package must never embed the GitHub PAT, harness-registry contents, or any other registry credential — already required structurally by [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md), restated here as an explicit publish-time expectation.
- Release mechanics — how a new version actually gets published and what triggers it — are the subject of the Deployment/CI-CD cluster, not this record.

## Agent Rules

- MUST publish Hatch CLI as a public package to the default public npm registry.
- MUST NOT set `"private": true` in `package.json` or configure a non-default private publish registry without superseding this record.
- MUST NOT embed any registry credential, token, or private skill content in the published package.

## Machine Check

```bash
grep -q '"private": true' package.json && echo "VIOLATION" || echo "OK"
```

Expected result: `OK` — `package.json` does not mark the package private.

## Precedence

- Builds on [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) (npm chosen for sandbox-egress reasons) and [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md) (the auth model that makes public distribution safe).
- No known conflicting decision records.
