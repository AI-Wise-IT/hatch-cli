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
- **Hatch CLI repo:** a workflow runs the test suite and formal checks (exact commands settled by the forthcoming Testing + Formal checks cluster) on every push and PR. A separate release workflow triggers only on a pushed semver git tag (`v*`) and publishes the package to the public npm registry (per [0006-npm-public-distribution](0006-npm-public-distribution.md)) via **npm Trusted Publishing (OIDC)** — no npm token is stored as a GitHub secret.

### Credential-scope addendum (post-acceptance)

This record's "no external credentials" property for the skill-content repo's collision check still holds unchanged. It does not extend to the Hatch CLI repo's own CI: [0014-registry-collision-detection](0014-registry-collision-detection.md) adds a second, CLI-side check requiring a read-scoped GitHub credential for the private skill-content repo. This is an addendum, not a correction — nothing in this record's original decision was wrong; 0014 simply introduces a new CI job this record didn't anticipate.

### Publish authentication correction (post-acceptance)

Originally recorded as an `NPM_TOKEN` GitHub Actions encrypted secret. Two problems surfaced while provisioning it during `build-infrastructure-batch`: `npm token create` (the classic-token CLI path) is now blocked by npm for accounts authenticated with a granular access token ("Granular access tokens that bypass two-factor authentication may not perform this action"), and even a working long-lived token is exactly the kind of standing credential npm's own Trusted Publishing feature (GA since July 2025) exists to eliminate. The developer chose to switch to Trusted Publishing instead.

Trusted Publishing uses OIDC: the release workflow requests a short-lived identity token from GitHub's OIDC provider (`permissions: id-token: write`), and npm exchanges it for a one-time publish credential after verifying it matches a Trusted Publisher relationship configured on the package's npmjs.com settings (GitHub org `AI-Wise-IT`, repo `hatch-cli`, workflow filename `release.yml`). No secret is stored in the repo at all. Requires npm CLI ≥11.5.1 and Node ≥22.14.0 in the workflow runner.

One bootstrap constraint: npm requires a package to already exist before a Trusted Publisher can be configured for it (this stops name-squatting via OIDC before the real owner claims it). So the very first publish of a new package must happen manually, from the developer's own authenticated npm session (2FA one-time code required) — not from CI, and not scriptable by an agent. Every release after that first manual one goes through the workflow with zero stored credentials.

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

- The `hatchcli` npm package must have a Trusted Publisher configured on npmjs.com (org `AI-Wise-IT`, repo `hatch-cli`, workflow filename `release.yml`) before the release workflow can publish — this must be done once, manually, after the package's first (also manual) publish.
- The release workflow needs `permissions: id-token: write` and a runner with npm ≥11.5.1 / Node ≥22.14.0; no `NPM_TOKEN` or other publish secret is stored in the repo.
- The skill-content repo's collision-check workflow becomes a required status check under [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) — this record defines what the check does, that record defines how it blocks merges.
- The Hatch CLI repo's test/formal-check workflow step is a placeholder pointing at whatever the Testing + Formal checks cluster settles — this record does not itself define those commands.

## Agent Rules

- MUST implement CI/CD via GitHub Actions for both repos.
- MUST trigger the Hatch CLI npm-publish workflow only on a pushed semver git tag (`v*`), never on every merge to `main`.
- MUST NOT add third-party CI/CD vendor tooling without superseding this record.
- MUST publish via npm Trusted Publishing (OIDC), with `id-token: write` granted to the release job.
- MUST NOT store a long-lived npm token as a GitHub Actions secret for the publish step without superseding this record.

## Invariants

None. Trigger mechanics, OIDC vs. token auth, and vendor choice are all internal release plumbing — invisible to and unrelied-upon by any external consumer of the published package. Nothing here becomes harder to reverse once real users exist; it stays an ordinary, freely-revisable operational choice.

## Machine Check

```bash
find .github/workflows -name "*.yml" -exec grep -l "npm publish" {} \; | xargs grep -A2 "^on:" | grep -q "tags"
```

Expected result: the release workflow file is found, and its trigger block references `tags`, not `push: branches: [main]`.

## Precedence

- Builds on [0004-github-vcs-platform](0004-github-vcs-platform.md) and [0006-npm-public-distribution](0006-npm-public-distribution.md).
- Enforced by [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).
- Narrowed, for the Hatch CLI repo's CI only, by [0014-registry-collision-detection](0014-registry-collision-detection.md)'s new CLI-side credential requirement — see the addendum above.
- No known conflicting decision records.
