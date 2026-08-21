# Branching strategy: trunk-based with required-status-check branch protection

## Metadata

- **id:** 0008-trunk-based-branch-protection
- **component:** branching-strategy
- **status:** accepted
- **applies_to:** branch structure and merge rules in both the skill-content repo and the Hatch CLI repo
- **decision_record:** `docs/architecture/decisions/0008-trunk-based-branch-protection.md`

## Decision

Trunk-based development: `main` is the only long-lived branch in both repos. Feature branches are short-lived and freely named. All changes land via a pull request — direct pushes to `main` are disabled in both repos. Branch protection on `main` requires the repo's relevant CI status check(s) (from [0007-github-actions-deployment](0007-github-actions-deployment.md)) to pass before a PR can merge. Approving code review is NOT required — there is no second developer to provide one — so the merge gate is CI passing, not human review.

## Decision History

Initially proposed without branch protection, reasoning that a solo project has no collaborators to protect against. The developer rejected that framing directly: most implementation work is done by agents on their behalf, and a safety net catching agent-introduced violations of tests, formal checks, or established practices is needed precisely because a human isn't reviewing every change line by line. Branch protection was added on that basis before this record was written.

## Context

[0004-github-vcs-platform](0004-github-vcs-platform.md) put both repos on GitHub. UC-5's own Business Rules already establish this pattern for the skill-content repo specifically — "CI fails the check, blocking the change from merging/publishing" — this record generalizes the same mechanism across both repos as one consistent policy, rather than leaving the Hatch CLI repo unprotected by contrast. The PRD's Context notes this is "a solo project — no team, no collaborators to coordinate with," which is why review approval is deliberately not part of the gate: the risk being managed is unreviewed agent output, not the lack of a second opinion.

## Alternatives Considered

- **GitFlow or a release-branch model.** Not chosen: no team to coordinate release branches with, and the added ceremony has no payoff for a solo project — consistent with the catalog's own note that "simpler is almost always better for an MVP."
- **No branch protection; direct pushes to `main` allowed.** This was the initial default proposed in the architecture conversation. Not chosen: explicitly rejected by the developer, who pointed out that agent-driven implementation work specifically needs a required-checks gate as a safety net, not just a nice-to-have.

## Trade-offs Accepted

- **Prompt coherence:** high — one consistent rule ("PR plus passing CI, no direct push") for an agent to follow identically in both repos.
- **Failure surface:** a flaky or misconfigured required check can block all merges, including an urgent fix by the developer themself — accepted as the deliberate trade for catching agent-introduced regressions before they land on `main`.
- **Reversibility:** branch protection is a GitHub repo setting, trivially adjusted later if it proves too strict or too loose.
- **Operational simplicity:** omitting a required-review count keeps this usable solo — the only added step versus a direct push is opening a PR and waiting for CI, not waiting for a second person.

## Consequences

- Both repos need branch protection configured on `main`: require a pull request before merging, require the applicable CI status check(s) to pass, require zero approving reviews, disallow direct pushes.
- The developer's own workflow changes from direct-push-to-main to always opening a PR, even for solo, self-authored changes.

## Agent Rules

- MUST open a pull request for any change to `main` in either repo; MUST NOT push directly to `main`.
- MUST require the repo's applicable CI status check(s) from [0007-github-actions-deployment](0007-github-actions-deployment.md) to pass before a PR is eligible to merge.
- MUST NOT require approving code review on `main`'s branch protection in this MVP.

## Invariants

None. Branch/PR/review process is internal engineering governance, invisible to any external consumer of either published artifact (the npm package or the registry content) — freely revisable at any time regardless of who depends on the outputs.

## Machine Check

- **context:** live-github
- **reason:** branch protection is live repository configuration, present in no checkout, and reading it requires an Administration-scoped token — materially broader than the Contents-read credential this project's CI is limited to.

A reviewer establishes it by running, in each repository:

```text
gh api repos/:owner/:repo/branches/main/protection \
  --jq '.required_status_checks, .required_pull_request_reviews.required_approving_review_count'
```

`required_status_checks` must be non-null with at least one check configured, and `required_approving_review_count` must be `0` or the reviews requirement absent entirely.

The runner reports this record as unverified. Provisioning an Administration-scoped token to automate it was considered and declined: it buys automated verification of two records at the cost of a standing credential with write-adjacent reach over both repositories.

## Precedence

- Builds on [0004-github-vcs-platform](0004-github-vcs-platform.md); enforces the checks defined in [0007-github-actions-deployment](0007-github-actions-deployment.md).
- No known conflicting decision records.
