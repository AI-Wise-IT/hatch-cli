# Version control platform: GitHub for both repos

## Metadata

- **id:** 0004-github-vcs-platform
- **component:** version-control
- **status:** accepted
- **applies_to:** hosting of the skill-content repo and the Hatch CLI repo
- **decision_record:** `docs/architecture/decisions/0004-github-vcs-platform.md`

## Decision

Both the skill-content registry repo and the Hatch CLI repo are hosted on GitHub — but not with the same visibility. The **skill-content repo is private**: it gates real access-controlled content behind `hatch login`/PAT auth (UC-2; [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md), [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md)), so its privacy is load-bearing. The **Hatch CLI repo is public** — see "Visibility correction" below.

### Visibility correction (post-acceptance)

Both repos were originally recorded as private. During `build-infrastructure-batch`'s scaffolding of the Hatch CLI repo (`AI-Wise-IT/hatch-cli`, on the org's Free plan), applying [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) failed: both the classic branch-protection API and the newer Rulesets API returned `403 Upgrade to GitHub Pro or make this repository public` — GitHub restricts branch protection on private repos to paid plans. The developer was offered three ways to resolve the conflict between this record and ADR-0008 — upgrade the org to a paid plan, make the Hatch CLI repo public, or skip branch protection — and chose to make the Hatch CLI repo public.

This is safe specifically for the CLI repo because [0006-npm-public-distribution](0006-npm-public-distribution.md) already established that its source contains no secrets and no private skill content, and ships publicly via npm regardless of the GitHub repo's own visibility — the CLI repo's visibility was never a security boundary, only an initial default that turned out to be unnecessary and, on this plan, actively blocking. The skill-content repo has no equivalent reasoning and remains private.

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
- The Hatch CLI repo's public visibility is what makes [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) usable on the org's current (Free) GitHub plan; the skill-content repo, if it also needs branch protection, will hit the same plan constraint while it stays private and needs its own resolution when that batch is built.

## Agent Rules

- MUST host the skill-content repo and the Hatch CLI repo on GitHub.
- MUST NOT introduce a second VCS platform for either repo without superseding this record.
- MUST keep the skill-content repo private.
- MUST keep the Hatch CLI repo public.
- MUST NOT make the skill-content repo public, and MUST NOT make the Hatch CLI repo private again, without superseding this record.

## Invariants

None in the sense this section usually means. The skill-content repo's privacy is a standing security requirement independent of whether real dependents exist yet — reversing it (making it public) would be a security incident regardless of launch state, not something that only becomes costly once users show up. Nothing in this record is "safe to relax pre-launch, then lock down" — it's binding from day one.

## Machine Check

```bash
git remote get-url origin | grep -q "github.com"
```

Expected result: run inside each repo's checkout; the origin remote URL contains `github.com` in both.

## Precedence

- Grounded by [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (Tessl/GitHub indexing finding) and [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) (GitHub-API-specific fetch mechanism).
- No known conflicting decision records.
