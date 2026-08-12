# Testing: Vitest, unit + mocked-integration, no live end-to-end in CI

## Metadata

- **id:** 0011-vitest-testing
- **component:** testing
- **status:** accepted
- **applies_to:** the Hatch CLI repo's test suite; the CI test job established by [0007-github-actions-deployment](0007-github-actions-deployment.md)
- **decision_record:** `docs/architecture/decisions/0011-vitest-testing.md`

## Decision

Vitest is the test runner/framework for the Hatch CLI. Test types in scope for this MVP:

- **Unit tests** for pure logic — semver comparison and compatibility rules ([0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md)), manifest schema migrations ([0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)), and harness resolution ([0001-harness-suffix-convention](0001-harness-suffix-convention.md), [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md)).
- **Integration tests** that spawn the built CLI as a subprocess against temporary git repositories, with GitHub API calls mocked (e.g. via `msw` or `nock`).

No live end-to-end tests against the real registry or the real GitHub API run in this MVP's CI.

## Context

[0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) fixed Node.js/TypeScript as the runtime. [0007-github-actions-deployment](0007-github-actions-deployment.md) established a CI test job as a placeholder pointing at this decision, and [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) makes that job's speed and reliability matter directly — it's a required status check blocking every merge, driven by the developer's stated need for a safety net against agent-introduced regressions. Given the CLI's core logic is git shell-outs ([0002](0002-cli-runtime-nodejs.md)), GitHub tarball fetches ([0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md)), and PAT-based auth ([0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md)) — exactly the kind of external-dependency logic that benefits from mocking rather than live network calls in a fast, required CI gate.

## Alternatives Considered

- **Jest.** Not chosen: CJS/ESM friction in TypeScript projects that Vitest avoids by being ESM-native from the start, with an equivalent (largely Jest-compatible) API.
- **Node's built-in test runner (`node:test`).** Not chosen: still needs extra libraries bolted on for mocking and richer assertions, undercutting its main appeal of having zero additional dependencies.

## Trade-offs Accepted

- **Prompt coherence:** high — Vitest's Jest-compatible API is widely known.
- **Failure surface:** mocked GitHub API calls mean a real API contract change wouldn't be caught by this test suite — accepted as the trade for CI speed and reliability; could be mitigated later with an optional, non-blocking scheduled live-smoke-test job if ever needed, not part of this MVP.
- **Reversibility:** easy to swap test runners later given the Jest-compatible API.
- **Operational simplicity:** fast (esbuild-based), built-in coverage tooling, no live network dependency in CI.

## Consequences

- The Hatch CLI repo needs a Vitest config, a mocking library (`msw` or `nock`) for GitHub API calls, and fixtures for temporary git repos used in integration tests.
- CI's test job (established by [0007-github-actions-deployment](0007-github-actions-deployment.md)) runs the Vitest suite as part of the required status check gating merges under [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).

## Agent Rules

- MUST use Vitest as the test runner for the Hatch CLI repo.
- MUST mock GitHub API calls in tests rather than hitting the live registry.
- MUST NOT add live end-to-end tests against the real registry to the required CI gate in this MVP.

## Invariants

None. Test-runner choice is entirely internal — no external dependent observes or relies on which framework verifies the CLI's own behavior. Freely revisable at any time.

## Machine Check

```bash
grep -q '"vitest"' package.json
```

Expected result: `vitest` is listed as a devDependency in `package.json`.

## Precedence

- Builds on [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md), [0007-github-actions-deployment](0007-github-actions-deployment.md), and [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).
- No known conflicting decision records.
