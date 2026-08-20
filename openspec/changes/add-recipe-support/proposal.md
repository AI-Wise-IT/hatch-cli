> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

Recipes were in the original product concept and were cut wholesale during MVP scoping — not because they were judged unnecessary, but because they were judged unlikely to be needed soon *and* to need further design refinement before anything could be built against them. Seven scope items went with them in one pass: pre-flight validation that every named skill exists before anything is imported, rollback to the last successful commit on partial failure, strict step ordering, a cleanup policy for one-time-use skills, step-level version pinning, a manifest record of which recipe produced a project's state, and `hatch import`'s ability to take a recipe as its target at all.

The carve-out was explicitly reversible, waiting on recipe design being revisited. Nothing has revisited it, and the reason it was parked has not changed: the concrete schema is still unresolved. `intake/product-requirements.md`'s own open questions still list it — *"the concrete schema of a recipe-as-code (step shape, ordering/placement rules, and specifically how a recipe author marks a group of steps as one atomic commit vs. independently-committing steps)"* — unanswered since scoping.

Recording it here is what keeps the carve-out reversible. The whole surface currently survives as a handful of passing mentions in [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) and [ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md), neither of which says recipes were deliberately deferred rather than abandoned.

One piece has already come back on its own. Standalone version pinning was originally recipe-only scope; [rescope-0001](../../../intake/rescope-0001-standalone-version-pinning.md) pulled it out of the recipe cluster and into `hatch import` on its own merits, and [ADR-0020](../../../docs/architecture/decisions/0020-standalone-version-pin-manifest-and-parsing.md) settled it. That is the precedent for how a piece of this returns — individually, on its own reasoning, not by reviving the cluster wholesale.

## What Changes

Sketch only, and every item below was a scope entry rather than a design — none of it is settled.

- A recipe as a named, ordered sequence of imports, resolvable by `hatch import` given a recipe as its target.
- Pre-flight validation: every skill and group a recipe names is confirmed to exist before anything is placed.
- Rollback to the last successful commit — never further — when a recipe fails partway.
- Strict step ordering: each step completes fully before the next begins.
- A cleanup policy for skills a recipe places for one-time use, so residue does not outlive the run.
- The project manifest recording which recipe, and which CLI version, produced the current state.

## Capabilities

Provisional. Recipes are a product surface of their own, so at least one new capability — but the shape depends entirely on the schema question below, which is unanswered.

### New Capabilities

- None assumed.

### Modified Capabilities

- None assumed.

## Open Questions

- **The recipe schema.** The question that caused the deferral and still blocks everything else: step shape, ordering and placement rules, and specifically how an author marks a group of steps as one atomic commit versus independently-committing steps. Carried unanswered from the PRD.
- **Whether a recipe is just a group with ordering.** Groups already resolve a member graph, including pointers to other groups at arbitrary depth ([ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md), [ADR-0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md)), and unpack atomically into flat entries. If a recipe is a group plus step order plus commit boundaries, this is much smaller than it was when it was cut. If it is a different thing, the difference needs stating first.
- **Where recipes live.** Top-level registry folders like skills and groups, subject to the same name permanence and version-bump rules — or somewhere else entirely.
- **How step-level pinning reconciles with auto-update.** The PRD's own open question, and only half answered: [rescope-0001](../../../intake/rescope-0001-standalone-version-pinning.md) settled that a standalone exact pin is sticky and overrides re-import auto-update, but a recipe-step pin governing only the initial install is a different rule that would have to sit alongside it coherently.
- **Rollback when there is no git repository.** The rollback guarantee predates [ADR-0026](../../../docs/architecture/decisions/0026-git-optional-dependency.md), which made git optional — commands now do their work and report that nothing was committed. "Roll back to the last successful commit" has no meaning in a project without commits, so the guarantee needs restating for both cases.
- **Whether `hatch import <recipe>` stays the entry point.** A separate `hatch run` command is a standing No in `intake/product-requirements.md` — resolving a recipe was always meant to be an import with a recipe as target. Worth confirming that still holds rather than assuming it.
- **What the cleanup policy actually removes.** `hatch remove` protects locally edited content and refuses to remove a group member individually. A recipe cleaning up after itself has to compose with both rules rather than bypass them.
