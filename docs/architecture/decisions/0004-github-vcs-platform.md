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

Both repos were originally recorded as private. During `build-infrastructure-batch`'s scaffolding of the Hatch CLI repo (`AI-Wise-IT/hatch-cli`), applying [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) failed: on the org's plan at the time, both the classic branch-protection API and the newer Rulesets API returned `403 Upgrade to GitHub Pro or make this repository public`. The developer was offered three ways to resolve the conflict between this record and ADR-0008 — upgrade the org to a paid plan, make the Hatch CLI repo public, or skip branch protection — and chose to make the Hatch CLI repo public.

That constraint no longer binds: the org is on a paid plan, and a private skill-content repo now carries branch protection with its full set of required checks. The CLI repo stays public regardless, on the reasoning that outlives the billing question — [0006-npm-public-distribution](0006-npm-public-distribution.md) established that its source contains no secrets and no private skill content and ships publicly via npm whatever the GitHub repo's visibility, so that visibility is not a security boundary and never was. Public is now the deliberate position rather than a workaround: the package is world-readable either way, and a public repo can take issues and pull requests where a private one cannot. The skill-content repo has no equivalent reasoning and remains private, where its privacy *is* load-bearing.

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
- Both repos carry [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md)'s branch protection on `main`, and the org's paid plan is what allows the skill-content repo to do so while staying private. Its required checks are the registry-side ones the content records establish: `version-check` ([0009](0009-skill-versioning-semver-tags.md)), `name-permanence-check` ([0013](0013-registry-group-structure-and-permanence.md)), `collision-check` ([0014](0014-registry-collision-detection.md)), and the testing-declaration and description checks ([0027](0027-testing-skill-convention.md), [0028](0028-registry-discovery-live-walk.md)).
- Dropping to a plan without private-repo branch protection would reopen the choice this record's correction section describes, for the skill-content repo rather than the CLI one — its privacy is load-bearing, so making it public is not among the available answers.

## Agent Rules

- MUST host the skill-content repo and the Hatch CLI repo on GitHub.
- MUST NOT introduce a second VCS platform for either repo without superseding this record.
- MUST keep the skill-content repo private.
- MUST keep the Hatch CLI repo public.
- MUST NOT make the skill-content repo public, and MUST NOT make the Hatch CLI repo private again, without superseding this record.

## Invariants

None in the sense this section usually means. The skill-content repo's privacy is a standing security requirement independent of whether real dependents exist yet — reversing it (making it public) would be a security incident regardless of launch state, not something that only becomes costly once users show up. Nothing in this record is "safe to relax pre-launch, then lock down" — it's binding from day one.

## Machine Check

This record decides two things — that both repos are on GitHub, and that they have opposite visibility — so the check verifies both rather than the host alone.

```bash
git remote get-url origin | grep -q "github.com" && echo "hosted on GitHub: correct"
test "$(gh api repos/AI-Wise-IT/hatch-skills --jq '.private')" = "true" && echo "skill-content private: correct"
test "$(gh api repos/AI-Wise-IT/hatch-cli --jq '.private')" = "false" && echo "CLI repo public: correct"
```

Expected result: all three confirmation lines. Run the first inside each repo's checkout; the latter two from anywhere with an authenticated `gh`. A failure on the second line is a security incident rather than a drifted convention — the skill-content repo's privacy is what gates the registry's access-controlled content, and this record's Invariants section states it is binding from day one.

## Precedence

- Grounded by [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (Tessl/GitHub indexing finding) and [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) (GitHub-API-specific fetch mechanism).
- No known conflicting decision records.
