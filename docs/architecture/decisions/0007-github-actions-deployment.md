# Deployment/CI-CD: GitHub Actions, tag-triggered npm release

## Metadata

- **id:** 0007-github-actions-deployment
- **component:** deployment
- **status:** accepted
- **applies_to:** CI/CD workflows in both the skill-content repo and the Hatch CLI repo
- **decision_record:** `docs/architecture/decisions/0007-github-actions-deployment.md`

## Decision

GitHub Actions is the CI/CD provider for both repos.

- **Skill-content repo:** a workflow runs the UC-5 destination-path collision check on every push and PR. It requires no external credentials — it only ever reads the full local checkout CI already has.
- **Hatch CLI repo:** a workflow runs the test suite and formal checks (exact commands settled by the forthcoming Testing + Formal checks cluster) on every push and PR. A separate release workflow triggers only on a pushed semver git tag (`v*`) and publishes the package to the public npm registry (per [0006-npm-public-distribution](0006-npm-public-distribution.md)), authenticated with an `NPM_TOKEN` stored as a GitHub Actions encrypted repository secret.

## Context

[0004-github-vcs-platform](0004-github-vcs-platform.md) put both repos on GitHub, and GitHub Actions is the CI/CD provider with native, zero-setup affinity to that choice — no third-party vendor earns its keep here. UC-5 (Prevent Destination-Path Collisions) requires this check to "run automatically in CI, not as a manual step," operating "on the full local checkout already available to CI" with no registry fetch needed — this record implements that requirement directly.

The developer's stated reasoning for wanting merges gated (see [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md)) — most implementation work will be done by agents, and a safety net is needed against agent-introduced violations of tests, formal checks, or established practices — is the direct driver for making these CI jobs required status checks rather than merely advisory.

## Alternatives Considered

- **A third-party CI/CD vendor (CircleCI, Travis, etc.).** Not chosen: no reason to add a vendor when GitHub Actions is native, free at this project's scale, and already zero-setup given 0004.
- **Continuous deployment to npm on every merge to `main`.** Not chosen: for a solo project without change-management tooling (e.g. changesets) to safely detect when a version bump warrants a publish, a deliberate tag-triggered release is simpler and avoids shipping every commit automatically.

## Trade-offs Accepted

- **Prompt coherence:** high — GitHub Actions workflow YAML is a well-known, well-documented convention.
- **Failure surface:** the skill-content repo's check needs no secrets at all (matches UC-5 exactly); the Hatch CLI release workflow depends on one repo secret (`NPM_TOKEN`) — a single credential to rotate if it's ever compromised.
- **Reversibility:** workflows are just YAML files inside each repo, trivially edited or replaced later.
- **Operational simplicity:** no infrastructure beyond what GitHub already provides; tag-triggered release avoids needing a version-bump-detection tool.

## Consequences

- `NPM_TOKEN` must be stored as a GitHub Actions encrypted repository secret in the Hatch CLI repo, scoped to publish only.
- The skill-content repo's collision-check workflow becomes a required status check under [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) — this record defines what the check does, that record defines how it blocks merges.
- The Hatch CLI repo's test/formal-check workflow step is a placeholder pointing at whatever the Testing + Formal checks cluster settles — this record does not itself define those commands.

## Agent Rules

- MUST implement CI/CD via GitHub Actions for both repos.
- MUST trigger the Hatch CLI npm-publish workflow only on a pushed semver git tag (`v*`), never on every merge to `main`.
- MUST NOT add third-party CI/CD vendor tooling without superseding this record.
- MUST store the npm publish credential as a GitHub Actions encrypted secret, never committed to either repo.

## Machine Check

```bash
find .github/workflows -name "*.yml" -exec grep -l "npm publish" {} \; | xargs grep -A2 "^on:" | grep -q "tags"
```

Expected result: the release workflow file is found, and its trigger block references `tags`, not `push: branches: [main]`.

## Precedence

- Builds on [0004-github-vcs-platform](0004-github-vcs-platform.md) and [0006-npm-public-distribution](0006-npm-public-distribution.md).
- Enforced by [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).
- No known conflicting decision records.
