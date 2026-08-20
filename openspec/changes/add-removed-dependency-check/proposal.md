> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

Flagging a skill `removed` in the registry does nothing to the groups that still point at it. Their `members` lists keep naming it, their current published versions keep resolving through it, and nothing in `hatch-skills` notices.

The consequence lands on projects, late and weakly. `hatch import` warns about a removed group member only once a project has already imported the group — a member is its own manifest entry, checked like any other name ([AF-4](../../../docs/use-cases/import-content.md), [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md)). [ADR-0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md) deliberately declined to make this block: a first-time import of a removed *target* is refused, but a group whose *member* is removed still imports, because the CLI cannot tell a real breaking loss from functionality that was non-breakingly absorbed elsewhere. That reasoning is sound and it leaves the gap unaddressed rather than closed.

The developer's own framing when this was raised, during the Batch 7 review that produced ADR-0021: *"we can't enforce what a breaking change is and whatnot, but we can detect which groups depend on a removal once we actually remove a skill."* Detection is registry-side work — the same category as the collision check ([ADR-0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md), [ADR-0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md)) and the name-permanence check, both of which catch at publish time what no project-side check can catch early enough.

## What Changes

Sketch only — none of this is settled.

- A registry CI check detecting that a group's current published version still lists a member flagged `removed`.
- Reported at the point the flag is set, so the person removing a skill sees which groups depend on it while they are still deciding.
- The natural remediation is a version bump on each dependent group moving off the member — MAJOR if the loss is breaking, MINOR or PATCH if the functionality moved elsewhere — but the check detects, it does not judge which.

## Capabilities

Provisional. Registry-side content rules currently live only in `testing-skill-convention`, which is scoped to one classification. Where a dependency check belongs is a scoping decision, and it may share a home with [`add-skill-content-requirements`](../add-skill-content-requirements/proposal.md).

### New Capabilities

- None assumed.

### Modified Capabilities

- None assumed.

## Open Questions

- **What "depends on" means precisely.** A group's *current* member list at HEAD, per [ADR-0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md) — nested members, pointer members, or both. Pointers to other groups make this a graph walk rather than a lookup, and whether the check follows the graph transitively or only one level changes what it catches.
- **Whether it blocks or warns.** Blocking the PR that sets the flag forces the dependent groups to be dealt with first, which may mean a single removal cascades into several coordinated version bumps. Warning is the posture `name-permanence-check` ran in before the hardening cutover, and would let a removal land with the dependency recorded rather than resolved.
- **What it does about already-published versions.** A group version published while the member was live still points at it forever, and pins keep it reachable. The check can only govern what HEAD looks like — a historical version's dependency is not fixable, only knowable.
- **Whether the same mechanism catches a dangling pointer.** A pointer at a name that does not exist at all is a strictly worse case than one at a removed name, and there is currently no check for it either. Likely the same detection with a different verdict.
- **How it interacts with testing content.** [ADR-0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md) already forbids a non-testing group from listing a testing member and enforces it in CI. A removed-dependency check is the same shape of walk over the same data, and the two may be one check rather than two.
- **Whether the CLI surfaces anything new.** ADR-0021's warn-only treatment of a removed group member stays correct regardless — this is detection at publish time, not a change to import behavior. A [group details view](../add-group-details-command/proposal.md) is the more likely place for it to become visible to a developer before they import.
