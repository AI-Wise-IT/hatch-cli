> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

Every architecture decision record in `docs/architecture/decisions/` ends with an **Agent Rules** section — plain-English `MUST` / `MUST NOT` statements — and most carry an **Invariants** section naming what becomes irreversible, how it is enforced, and in what mode. Read together they are a substantial, precise standards document.

Almost none of it is enforced. The Invariants sections say so themselves, repeatedly: *"Enforcement mechanism: none dedicated; covered only by ordinary registry-content review"*, *"Pure code discipline; no regression test asserts..."*, *"Current mode: not-yet-built."* The rules exist, they are written down well, and nothing checks that a change respects them.

The one attempt to check them was a manual audit — a single pass over every ADR, cross-referenced against both repos' real state, written to `docs/pre-launch-audit.md` on 2026-08-12. It worked, and then it rotted. Within weeks it was asserting that the collision check was `not-yet-built` while that check was live and required on both repos, and its artifact classification had been superseded by [ADR-0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md). A hand-run audit is a photograph of a moving thing, and it was removed for that reason.

[Greptile](https://www.greptile.com/) reviews pull requests against a graph index of the repository, and takes custom rules as *standards written in plain English*. That is the same shape as an ADR's Agent Rules — no translation into a query language, no second formalism to maintain. Continuous review on every PR is also the right cadence for rules whose whole purpose is to catch a change before it lands, rather than to describe the world after it has already drifted.

## What Changes

Sketch only — none of this is settled.

- Greptile adopted on `hatch-cli` and `hatch-skills`, reviewing every pull request.
- The ADRs' Agent Rules become the custom rules it enforces, so a PR that violates a recorded decision is flagged where the change is made.
- The invariants that need live infrastructure state rather than a code diff stay a deliberate, occasional pass — see the open questions.

## Capabilities

Provisional, and possibly none. This is development tooling rather than product behavior, so it may warrant no spec at all — `openspec validate` accepts a change with `skip_specs: true` for exactly this case. Worth deciding during scoping rather than assuming.

### New Capabilities

- None assumed.

### Modified Capabilities

- None assumed.

## Open Questions

- **Which invariants are reviewable from a diff, and which are not.** Greptile reviews changes against an indexed repository. A rule like *"MUST NOT rely on frontmatter to declare a skill's target harness"* is visible in a diff. *"`NAME_PERMANENCE_ENFORCEMENT` is still `warn`"* or *"`collision-check` is a required status check on `main`"* are live GitHub configuration, invisible to a code review. The deleted audit verified those by `gh api` query. Splitting the invariant set along that line is the first scoping task, and it decides how much of the audit this actually replaces.
- **Whether the rules can read the ADRs directly.** Greptile can be pointed at repo-specific context. If it reads `docs/architecture/decisions/` as the source, there is one copy of every rule and it cannot drift. If the rules must be restated in its own configuration, that is a second artifact that has to agree with the ADRs — the exact failure mode [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) each rejected an index for. This question probably decides whether the idea is worth doing at all.
- **Sending private content to a third party.** `hatch-skills` is private, and `intake/product-requirements.md`'s own open questions record that the security posture is *"accepted as a starting point, not vetted"* where client or business data may be involved. Indexing that repository with an external service is a decision about the registry's confidentiality, not a procurement detail. Greptile offers self-hosted deployment, which may be the answer, and changes the cost question entirely.
- **Blocking or advisory.** A review comment that can be dismissed is a different thing from a required status check. The project's own precedent is that a rule protecting registry integrity blocks from day one ([ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md)'s `version-check`) while a rule protecting a pre-launch window stays advisory until a named cutover ([ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md)'s `name-permanence-check`). Both postures probably apply here, to different rules.
- **What it does to the pre-launch hardening cutover.** The `pre-launch-harden` process expects a current audit as its input. If Greptile covers the diff-visible half continuously, the remaining pass is narrower — live enforcement modes and branch protection — but it does not disappear, and something still has to produce it.
- **Whether an ADR's Machine Check is the better hook.** Most ADRs already carry a `## Machine Check` section holding a real shell command and its expected result. Those are executable today and wired to nothing. A plain CI job running them may cover a useful slice of this at no cost and with no third party involved — worth measuring before adopting anything.
- **Cost, and whether it earns its place on a solo project.** Two repositories, one maintainer, and a review load that is mostly agent-authored PRs.
