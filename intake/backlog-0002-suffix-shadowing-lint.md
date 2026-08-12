# Backlog 0002: registry-side lint for harness-code-suffix-shaped skill names

## Metadata

- **id:** backlog-0002-suffix-shadowing-lint
- **status:** logged, not scoped, not built
- **decision_record:** `intake/backlog-0002-suffix-shadowing-lint.md`

This is not a rescope record. Nothing here has been decided into or out of the MVP — it is a durable note that a real gap was raised and deliberately deferred, so a future scoping conversation starts from an accurate record instead of rediscovering it from scratch.

## What was raised

Surfaced while designing Batch 10's destination-path collision check (UC-5, [0014-registry-collision-detection](../docs/architecture/decisions/0014-registry-collision-detection.md)), in the same conversation that produced [0024-registry-collision-predicate](../docs/architecture/decisions/0024-registry-collision-predicate.md).

[0001-harness-suffix-convention](../docs/architecture/decisions/0001-harness-suffix-convention.md)'s own Consequences section names a second, narrower checking need: "The registry's 'no duplicate destination path' publish lint must be extended to flag any skill name ending in a code from the harness registry's reserved set, for human review before publishing, whether or not it's an intentional variant." No such lint has ever been built — `hatch-skills`' CI has only ever gained `version-check`, `name-permanence-check`, and (as of Batch 10) the collision-detection check.

This is a genuinely different risk from a literal destination-path collision:

- A top-level skill literally named e.g. `git-hooks-cdx`, published with no intent of being a harness variant of anything, can be silently swallowed by `resolveSkillFolderName` whenever some other family `git-hooks` is later resolved for the Codex harness — the resolver has no way to distinguish "an intentional variant" from "a coincidentally-suffixed, unrelated skill."
- Traced through the math in [0024](../docs/architecture/decisions/0024-registry-collision-predicate.md): this never produces two sources claiming the *same* destination string (the shadowed family and the shadowing skill still deploy under two different names), so it is invisible to the hard-blocking collision check Batch 10 builds. It's a silent misresolution risk, not a collision.
- ADR-1's own wording treats it as advisory ("for human review before publishing"), not a hard block — a different enforcement posture than UC-5's check, which is why it doesn't belong folded into the same mechanism per [0024](../docs/architecture/decisions/0024-registry-collision-predicate.md).

## Why deferred rather than designed here

Batch 10's own scope (`docs/build-plan.md`) is UC-5/[0014](../docs/architecture/decisions/0014-registry-collision-detection.md) only — a hard-blocking check on literal destination-path collisions. This is a different mechanism (an advisory lint on name *shape*, independent of whether any actual collision exists today), with its own open design questions: what "for human review" means mechanically (a PR comment? a required-but-non-blocking status check, like `name-permanence-check`'s current warn-only mode? something else), and whether it should also cover the case where a suffix-shaped name is later shadowed by a *newly reserved* harness code (mirroring [0014](../docs/architecture/decisions/0014-registry-collision-detection.md)'s CLI-side retroactive-collision check).

## What picking this up later requires

A design conversation (`design-architecture-decision`), most naturally as its own small ADR extending [0001-harness-suffix-convention](../docs/architecture/decisions/0001-harness-suffix-convention.md) — deciding the lint's trigger (every PR touching a top-level folder name? a periodic full-registry scan?), its enforcement mode (advisory vs. blocking, and whether it defaults to warn-only the way `name-permanence-check` did pre-launch), and its report format, before any code is written against it.

## Consequences

- Batch 10 (`docs/build-plan.md`) is unaffected — it proceeds exactly as scoped, building only the hard-blocking literal-collision check ([0014](../docs/architecture/decisions/0014-registry-collision-detection.md), [0024](../docs/architecture/decisions/0024-registry-collision-predicate.md)).
- No files, commands, or CI jobs exist yet for this lint — this record's only effect is making sure it isn't lost.
