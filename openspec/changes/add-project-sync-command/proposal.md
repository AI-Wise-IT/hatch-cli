> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

Every command that maintains a project's content is single-target. `hatch import <name>` updates one entry; `hatch remove <name>` removes one ([UC-4](../../../docs/use-cases/remove-content.md)). Bringing a project up to date therefore means reading the manifest, and running `hatch import` once per entry recorded in it, by hand.

That is tedious in proportion to how well Hatch is working — the more skills a project has adopted, the worse it gets. It also produces one commit per entry, so a routine "update everything" reads in the history as a scatter of unrelated changes rather than one reviewable act of maintenance.

Pruning has no story at all. `hatch import` warns about every manifest-recorded skill the registry has flagged removed, on every invocation ([AF-4](../../../docs/use-cases/import-content.md), [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md)) — a warning it repeats forever, because acting on it means knowing to run `hatch remove` for each named entry. The command that tells you about the problem cannot fix it.

Raised by the developer during the Batch 7 review that produced [ADR-0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md), and deliberately deferred there rather than scoped mid-batch.

## What Changes

Sketch only — none of this is settled.

- One command that brings a whole project up to date: every manifest entry updated to its latest compatible version, and entries the registry has flagged removed pruned.
- The existing per-entry rules apply unchanged — an exact pin is honored ([AF-10](../../../docs/use-cases/import-content.md)), locally edited content is never overwritten ([AF-3](../../../docs/use-cases/import-content.md)), a range pin auto-updates like an unpinned entry.
- One commit for the whole operation, as `hatch import` already guarantees for an import however many files it touches.

## Capabilities

Provisional. Most likely a new capability, since neither an import nor a removal describes an operation whose target is the project itself.

### New Capabilities

- `project-synchronization` (provisional, name included): what a whole-project update-and-prune does, and how it composes the existing per-entry rules.

### Modified Capabilities

- None assumed.

## Open Questions

- **Whether update and prune are one command or two.** They are different risk profiles — updating adds newer content, pruning deletes placed content — and bundling them means a routine update can delete things. Whether one command with flags, two commands, or a preview-then-confirm flow is right is the first scoping decision.
- **What "prune" means for something flagged removed.** [ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) keeps a flagged folder's content fetchable forever, so a removed entry still works. Removing it is a judgment about wanting to stop depending on it, not a repair — which argues against doing it automatically.
- **Whether it is one commit or one per entry.** One commit matches `hatch import`'s existing guarantee and makes the operation reviewable as a whole; one per entry makes a single bad update revertable on its own. UC-3's business rule settles this for one import, not for a bulk one.
- **What happens when one entry fails partway.** `hatch import` is atomic per invocation — nothing placed, no manifest change, no commit. Whether a bulk operation is atomic across every entry, or completes what it can and reports the rest, is a real decision: atomicity means one unreachable member blocks the whole run.
- **How local edits are surfaced.** AF-3 protects them silently per entry today. Across twenty entries, "three were left alone because you edited them" is the useful output, and the current per-entry wording does not aggregate.
- **The command's name.** `hatch clean` was the working title when this was raised, and it describes the prune half only.
