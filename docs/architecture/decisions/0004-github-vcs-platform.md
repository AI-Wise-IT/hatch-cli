# Version control platform: GitHub for both repos

## Metadata

- **id:** 0004-github-vcs-platform
- **component:** version-control
- **status:** accepted
- **applies_to:** hosting of the skill-content repo and the Hatch CLI repo
- **decision_record:** `docs/architecture/decisions/0004-github-vcs-platform.md`

## Decision

Both the skill-content registry repo and the Hatch CLI repo are hosted on GitHub, as private repositories.

## Context

For the skill-content repo, this is not a genuinely open choice: [0001-harness-suffix-convention](0001-harness-suffix-convention.md) confirmed by direct inspection that Tessl.io — the PRD's named grading registry, held firmly rather than as a suggestion — indexes and grades GitHub-hosted repos. [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) also settled on GitHub's tarball/contents API as the fetch mechanism, which only applies to a GitHub-hosted repo. For the Hatch CLI repo, the PRD's Context states this is "a solo project — no team, no collaborators to coordinate with," and names no requirement that would pull the CLI repo onto a different platform.

## Alternatives Considered

- **GitLab, Bitbucket, or a self-hosted platform (e.g. Gitea) for the skill-content repo.** Not chosen: Tessl.io's grading mechanism is confirmed to index GitHub-hosted repos, and the fetch mechanism in 0003 is GitHub-API-specific — neither is a genuine option for this repo.
- **A different platform for the Hatch CLI repo than the skill-content repo.** Not chosen: nothing external requires it, and keeping both repos on one platform avoids doubling the PAT scopes and tooling surface a solo developer has to reason about, for no offsetting benefit.

## Trade-offs Accepted

- **Prompt coherence:** high — GitHub tooling and conventions are ubiquitous and already familiar to any agent operating this CLI.
- **Failure surface:** both repos now share a single-vendor dependency; an outage or account compromise affects both together. Accepted because the skill-content repo has no real alternative regardless, and splitting the CLI repo onto a second platform would not reduce this risk, only add a second platform to secure.
- **Reversibility:** the skill-content repo is effectively locked to GitHub by the pre-existing Tessl dependency, not by this decision. The Hatch CLI repo remains independently movable later via a normal git-remote migration if a reason ever arises.
- **Operational simplicity:** one platform, one credential model, one PAT scope to reason about across both repos.

## Consequences

- The GitHub personal access token used for registry auth (see [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) and the upcoming Authentication cluster) can plausibly be scoped to cover both repos if that proves convenient — an implementation detail for that later decision, not fixed here.
- No self-hosted git infrastructure exists or needs maintaining.

## Agent Rules

- MUST host the skill-content repo and the Hatch CLI repo on GitHub.
- MUST NOT introduce a second VCS platform for either repo without superseding this record.

## Machine Check

```bash
git remote get-url origin | grep -q "github.com"
```

Expected result: run inside each repo's checkout; the origin remote URL contains `github.com` in both.

## Precedence

- Grounded by [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (Tessl/GitHub indexing finding) and [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) (GitHub-API-specific fetch mechanism).
- No known conflicting decision records.
