> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

Every architecture decision record in `docs/architecture/decisions/` ends with an **Agent Rules** section — plain-English `MUST` / `MUST NOT` statements — and most carry an **Invariants** section naming what becomes irreversible, how it is enforced, and in what mode. Read together they are a substantial, precise standards document.

The `decision-records` CI job enforces the executable slice of it. Each record declares one machine check and the context it runs in; the job executes every check on every pull request in both repositories and blocks a failure. Twenty-one of the twenty-eight records are covered that way.

Two kinds of rule are left over, and this proposal is about them.

**The seven records no command can establish.** Five turn on judgment about what code *means* rather than a fact a command can read: [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md) (is a workflow job actually wired to the check it names), [0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md) (does a first-time import of a removed target really refuse, end to end), [0023](../../../docs/architecture/decisions/0023-remove-harness-drop-unconditional.md) (which *branch* of `hatch remove` the drift gating lies in), [0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md) (is the collision predicate comparing physical sources or name shape), [0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md) (does no check anywhere implement shadowing detection under some other name). Two are live GitHub configuration invisible to any checkout: [0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md)'s repository visibility and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md)'s branch protection. All seven declare themselves as needing review, and the runner reports them as unverified with their reason rather than passing them — visible, and unchecked.

**The rules no record's check reaches.** A record carries one check, and a record's Agent Rules are many. A green run means every record's *declared* check passed, not that every `MUST` in the corpus holds. [0026](../../../docs/architecture/decisions/0026-git-optional-dependency.md)'s check confirms git is reached through one module and never initialized; it says nothing about whether every command warns before a destructive removal in a project without a repository. That gap is the larger half of what is still unenforced, and it is the half a diff-aware reviewer is actually good at.

[Greptile](https://www.greptile.com/) reviews pull requests against a graph index of the repository, and takes custom rules as *standards written in plain English*. That is the same shape as an ADR's Agent Rules — no translation into a query language, no second formalism to maintain. Continuous review on every PR is also the right cadence for rules whose whole purpose is to catch a change before it lands, rather than to describe the world after it has already drifted.

## What Changes

Sketch only — none of this is settled.

- Greptile adopted on `hatch-cli` and `hatch-skills`, reviewing every pull request.
- The Agent Rules that no machine check asserts become the custom rules it enforces, so a PR violating a recorded decision is flagged where the change is made.
- The five judgment-type records get a reviewer that can read what the code means, rather than staying permanently unverified.
- The two live-configuration records stay outside a diff-based reviewer's reach entirely — see the open questions.

## Capabilities

Provisional, and possibly none. This is development tooling rather than product behavior, so it may warrant no spec at all — `openspec validate` accepts a change with `skip_specs: true` for exactly this case. Worth deciding during scoping rather than assuming.

### New Capabilities

- None assumed.

### Modified Capabilities

- None assumed.

## Open Questions

- **What covers the two live-configuration records.** [0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md)'s repository visibility and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md)'s branch protection are organisation state, invisible to a code review and to a checkout alike. Automating them needs an Administration-scoped token, declined so far as too broad a standing credential for the risk. A scheduled job with a narrower credential, or a periodic manual pass, are the alternatives. This is the one part of the deleted `docs/pre-launch-audit.md` that nothing has replaced.
- **Whether the rules can read the ADRs directly.** Greptile can be pointed at repo-specific context. If it reads `docs/architecture/decisions/` as the source, there is one copy of every rule and it cannot drift. If the rules must be restated in its own configuration, that is a second artifact that has to agree with the ADRs — the exact failure mode [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) each rejected an index for. This question probably decides whether the idea is worth doing at all.
- **Sending private content to a third party.** `hatch-skills` is private, and `intake/product-requirements.md`'s own open questions record that the security posture is *"accepted as a starting point, not vetted"* where client or business data may be involved. Indexing that repository with an external service is a decision about the registry's confidentiality, not a procurement detail. Greptile offers self-hosted deployment, which may be the answer, and changes the cost question entirely.
- **Blocking or advisory.** A review comment that can be dismissed is a different thing from a required status check. The project's own precedent is that a rule protecting registry integrity blocks from day one ([ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md)'s `version-check`, and the `decision-records` job itself) while a rule protecting a pre-launch window stays advisory until a named cutover ([ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md)'s `name-permanence-check`). Both postures probably apply here, to different rules. A reviewer whose judgment can be wrong is also a weaker candidate for blocking than a command whose exit status cannot.
- **What it does to the pre-launch hardening cutover.** The `pre-launch-harden` process expects a current audit as its input. The `decision-records` job already reports every record's enforcement state continuously; what remains for a cutover pass is the live enforcement modes and branch protection the job cannot see, and something still has to produce that.
- **Cost, and whether it earns its place on a solo project.** Two repositories, one maintainer, and a review load that is mostly agent-authored PRs — now against a smaller residue than before, since the executable checks no longer need a reviewer at all.
