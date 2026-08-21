> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

[ADR-0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md) settles trunk-based development: `main` is the only long-lived branch, feature branches are short-lived, every change lands through a pull request, and the merge gate is CI passing rather than human review. It was written for a workload where the only cost of a pull request is the CI minutes it burns.

[adopt-greptile-invariant-review](../adopt-greptile-invariant-review/proposal.md) changes that arithmetic. Greptile bills per developer per month with an included credit allowance and per-review overage, and the review is the unit that costs. The project's real workload is agent-authored branches — many of them, often small, frequently pushed — and one review per pull request maps a cost onto a rhythm that was chosen when review was free. Reviewing thirty small pull requests in a day is both more expensive and *less useful* than reviewing the day's accumulated change once, because the reviewer's strength is whole-repository context and a one-file diff gives it the least to work with.

The shape that fits: changes stage together on a long-lived branch, and a release from that branch is what gets reviewed and deployed — roughly one a day rather than one per merge.

That is a change to the branching strategy, not to the reviewer, which is why it is here rather than in the adoption change.

## What Changes

Sketch only — none of this is settled.

- A long-lived staging branch where merged changes accumulate between releases.
- Feature branches merge into staging; staging merges into `main` on a release cadence of roughly one a day.
- Greptile reviews the staging-to-`main` release rather than every feature pull request, so one review covers a day's work with the whole batch in context.
- The deterministic gates — CI, and the `decision-records` job — keep running on every pull request, because they are free and their value is catching a break at the moment it is introduced.
- [ADR-0007](../../../docs/architecture/decisions/0007-github-actions-deployment.md)'s deployment trigger and the tag-driven release workflow are revisited against the new cadence.

## Superseding, not editing

[ADR-0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md)'s `## Decision` states that `main` is the only long-lived branch in both repositories. That is a frozen section of an accepted record, so introducing a staging branch is **a superseding record**, never an edit — the contract in [`docs/architecture/decisions/README.md`](../../../docs/architecture/decisions/README.md) admits no other route. Whatever this change becomes, it carries a new record that supersedes 0008 and states the branching strategy afresh, with 0008 keeping its frozen sections byte-for-byte and naming its replacement.

## Capabilities

Provisional. Branching and release cadence are development process rather than product behavior, so this may warrant no spec at all — but the deployment trigger is real behavior and may. Worth deciding during scoping rather than assuming.

### New Capabilities

- None assumed.

### Modified Capabilities

- None assumed.

## Open Questions

- **What a batched review actually catches, versus per-pull-request review.** The premise is that a day's accumulated diff gives the reviewer more context and costs one credit instead of thirty. The risk is the opposite: a large batch produces a long review whose findings are harder to attribute to the change that caused them, and which arrives after the author has moved on. This trades review latency for review cost and quality, and which way it nets out is the question the whole change turns on.
- **Whether a failing batch review can be acted on cheaply.** If a release review finds a real problem, the fix has to be traced back through the staged changes. A per-pull-request review localises that automatically. Whatever staging looks like needs an answer for this.
- **Whether both repositories need the same cadence.** `hatch-cli` publishes to npm on a tag; `hatch-skills` is a registry whose content changes independently of any release. They may not want the same branching strategy at all, and [ADR-0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md) currently binds both.
- **What branch protection looks like on two long-lived branches.** Which checks are required where, and whether staging is protected at all, is live GitHub configuration — the same class [ADR-0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md) already declares no checkout can verify.
- **Whether the trial answers the cost question before the cadence question needs answering.** Greptile runs on a trial during the adoption work. Real usage numbers from that period are better evidence than an estimate, and may show that per-pull-request review is affordable after all — in which case this change is worth less than it looks.
