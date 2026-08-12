# Backlog 0001: project-level clean/sync command; registry-side removed-dependency check

## Metadata

- **id:** backlog-0001-clean-command-and-removed-dependency-check
- **status:** logged, not scoped, not built
- **decision_record:** `intake/backlog-0001-clean-command-and-removed-dependency-check.md`

This is not a rescope record (compare [rescope-0001-standalone-version-pinning](rescope-0001-standalone-version-pinning.md), which pulled something *into* scope). Nothing here has been decided into or out of the MVP — it is a durable note that two real gaps were raised and deliberately deferred, so a future scoping conversation starts from an accurate record instead of rediscovering them from scratch.

## What was raised

Both surfaced from the developer during review of Batch 7 (re-import & staleness), in the same conversation that produced [0021-block-first-time-import-of-removed-target](../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md).

### 1. A project-level "clean" / sync-everything command

The developer asked whether there's a way to update every already-imported skill/group to its latest compatible version *and* prune anything removed from the project, in one operation — rather than having to run `hatch import <name>` by hand for every entry in the manifest.

Checked against everything currently scoped: [remove-content.md](../docs/use-cases/remove-content.md) (UC-4, Batch 8) is `hatch remove <one-name>` — single-target only, same shape as `hatch import`. Neither `mvp-scope.md` nor the original PRD mentions a bulk update/clean/sync/prune capability anywhere. **Confirmed: nothing like this exists in current scope, and Batch 8 does not cover it.**

Developer's own call: log it, don't scope it now — Batch 8 proceeds exactly as already planned (single-name `hatch remove`).

### 2. A registry-side check that a group's current version doesn't depend on a removed skill

Raised while discussing whether `hatch import` should block a group that has a removed *member*. The developer's reasoning: the durable fix isn't a `hatch import`-side block (which can't tell a real breaking loss from a member's functionality being non-breakingly absorbed elsewhere) — it's catching, at the registry's own CI, that a group's *current published version* still points at something just flagged removed, the same way `name-permanence-check` already catches a deleted folder name today.

Quoting the developer directly: "we can't enforce what a breaking change is and whatnot, but we can detect which groups depend on a removal once we actually remove a skill."

Note: a *narrower*, project-level form of this detection already ships in Batch 7 — `hatch import`'s AF-4 check already warns about a removed group member once a project has imported it (a member is its own manifest entry with a `group` field, checked like any other name). What's missing is the *registry-wide, proactive* version: flagging this in `hatch-skills`' own CI, before any project ever imports the group, the same category of check as [0014-registry-collision-detection](../docs/architecture/decisions/0014-registry-collision-detection.md).

## Why deferred rather than designed here

Neither item was a quick, narrow decision — both are genuinely new capabilities (a new CLI command; a new registry CI check with its own detection logic), not a format gap inside already-scoped work. Recording a real design decision for either belongs in the same structured process every other decision in this project has gone through, not an inline call made mid-batch-review.

## What picking either of these up later requires

- **The clean/sync command:** a proper scoping pass (`mvp-scoping`) — decide Must/Want/Nice, write it up as a use case, and only then design its implementation. It would need its own UC (working title: "Synchronize a project's skills/groups to latest and prune removed ones").
- **The registry-side removed-dependency check:** a design conversation (`design-architecture-decision`), most naturally alongside or extending [0014-registry-collision-detection](../docs/architecture/decisions/0014-registry-collision-detection.md)'s CI-check pattern — including working out what "depends on" means precisely (a group's *current* member list, at HEAD, per [0016-group-member-manifest-format](../docs/architecture/decisions/0016-group-member-manifest-format.md)) and what the check should do on a hit (block the PR that flags a skill removed while a live group still points at it? warn only, like `version-check`'s sibling jobs today?).

## Consequences

- Batch 8 (`docs/build-plan.md`) is unaffected — it proceeds as `hatch remove <name>`, single-target, exactly as already planned.
- `hatch import`'s AF-4/AF-13 behavior ([0019](../docs/architecture/decisions/0019-registry-removed-metadata-flag.md), [0021](../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md)) is unaffected — a group member being removed remains warn-only until item 2 above is designed and built.
- No files, commands, or CI jobs exist yet for either item — this record's only effect is making sure they aren't lost.
