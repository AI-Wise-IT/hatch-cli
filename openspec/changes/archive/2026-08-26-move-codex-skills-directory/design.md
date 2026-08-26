## Context

See [proposal.md](proposal.md) — Why.

Three properties of the current code shape this design:

- `src/harness-registry.json` is the only place a harness's directory is written down. Every consumer — `import`, `init`, `remove`, and the snapshot/rollback bookkeeping — reads `getHarnessDefinition(...).skillsDir`. There is no literal harness path anywhere in `src/` outside that file.
- [ADR-0001](../../../docs/architecture/decisions/0001-harness-suffix-convention.md)'s machine check greps `src/` for hardcoded harness codes and fails if one is found outside the registry module. Its spirit — consumers read the registry, never their own copy — applies to directories as much as to codes.
- `hatch import` is already atomic per invocation, with `createSnapshot`/`snapshotTree` bookkeeping and a single commit per operation. Reclamation is a set of deletes that has to join that existing machinery rather than run beside it.

The requirements this design implements are in [specs/harness-placement/spec.md](specs/harness-placement/spec.md).

## Goals / Non-Goals

**Goals:**
- Move the `codex` harness's directory with no change to its name, its reserved code, or any registry folder.
- Leave no project holding two copies of the same skill, and none holding a copy only where its harness no longer looks — without asking the developer to run anything by hand.
- Keep harness directory paths — current and historical — in the harness registry, not in command code.

**Non-Goals:**
- Refreshing `hatch-usage`, or any entry other than the import's named target, to a newer version. That is [add-project-sync-command](../add-project-sync-command/proposal.md)'s job; relocation moves content and reclamation deletes stale copies, but neither updates anything.
- A general harness-migration facility. This design records a previous directory per harness, which happens to generalize, but nothing here is built for a second move that has not been asked for.
- Any change to how a registry folder is resolved for a harness.

## Decisions

### The previous directory is recorded in the harness registry, not hardcoded in import

`src/harness-registry.json`'s `codex` entry gains a second field naming the directory the harness used to occupy (`.codex/skills`), alongside its new `skillsDir`. Reclamation reads that field for each declared harness and skips any harness that does not carry one.

**Why not a literal `.codex` check in `import.ts`:** it would be the only harness path in the codebase living outside the registry — precisely the arrangement ADR-0001's machine check exists to prevent, and the reason the `skillsDir` change itself is a one-line edit. A literal would also make the eventual removal of this behaviour a code change rather than a data change.

**Alternative considered — a one-shot manifest schema migration (v4 → v5).** Rejected: [ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md) defines migrations as pure functions over the manifest object. Giving one a filesystem side effect would break that contract for every future migration, to buy a self-retiring trigger this design does not need — the registry field can simply be deleted once no project holds legacy content.

**Alternative considered — leave it to the developer, documented in release notes.** Rejected on the strength of the failure mode rather than the effort: the stale copy is silently discovered by Codex, and `hatch remove` would report success while leaving it in place.

### Content is carried across before it is reclaimed

Reclamation alone only serves a project whose import *places* something: the new copy lands, the stale one goes. A project whose recorded items are all at their current version places nothing, so there is no new copy for reclamation to make redundant — deleting the legacy copy there would remove the only copy there is.

Import therefore performs a relocation pass before the staleness and local-edit checks. For each declared harness carrying a previous directory, each manifest-recorded item present in the previous directory and absent from the current one is **moved** on disk into the current directory. Items present in both are left for reclamation.

**Why a move rather than a re-fetch:** the content on disk is what the manifest's `contentHash` describes. Moving it carries the recorded version, pin, and hash across unchanged, needs no network, and preserves a local edit the developer made — which the local-edit check then reports correctly, because after relocation it is reading the directory the content actually lives in. Re-fetching would silently overwrite an edit and would turn a directory move into a version change.

**Why before the checks rather than after placement:** `hashDiskTree` on a missing directory returns the empty-tree hash, so an item still sitting in the previous directory reads as a local edit against an empty current directory. Running relocation first is what makes those checks see the truth; running it later would mean the checks had already returned.

**Consequence — an otherwise unchanged import now has something to commit.** The early-return paths (`already up to date`, `has local edits`, pin-only) previously changed nothing. When relocation or reclamation has done work, those paths must report it and commit it. The all-or-nothing guarantee is unchanged: the same snapshot covers the moves, and a failure restores the previous directory exactly.

**Alternative considered — leave the move to `add-project-sync-command`.** Rejected: that command's job is refreshing an item to a newer version, which is a change to *what* content a project holds. This is the same content in a different place, caused entirely by this change, and a project that never runs a sync would keep content its harness no longer looks at. The non-goal above still stands — nothing here updates an item to a newer version.

### Reclamation is gated on the legacy directory existing

The step begins with one `existsSync` on the legacy directory and returns immediately when it is absent. For every project that never used the old location — which, before long, is all of them — the cost is a single stat call per import, and the behaviour is indistinguishable from its not being there.

### Only manifest-recorded entries are removed

Reclamation deletes `<legacyDir>/<name>` for each name the manifest records, never the directory wholesale. The old location is an ordinary directory that a developer may have put other things in, and Hatch has no record of what it placed there beyond the manifest's own list.

The parent directories are removed only when emptied, so a legacy directory still holding something unrecorded survives with that content intact.

### Reclamation joins the import's existing atomicity rather than being best-effort

The deletes are snapshotted through the same `snapshotTree` bookkeeping the rest of import uses, run inside the same `try`, and are covered by the same rollback and the same single commit.

**Alternative considered — best-effort, warn on failure, never fail the import.** Rejected: a partial reclamation leaves a project in a state no one can reason about — some skills duplicated, some not — and the developer gets a warning for something they did not ask for and cannot easily finish by hand. A failed delete is a real filesystem problem, and import's existing contract for those is to change nothing and say so.

### The successor record restates ADR-0001 in full

ADR-0001's `## Decision`, `## Agent Rules`, and `## Invariants` are frozen, and it names `.codex/skills/` in the first of those. The successor carries forward everything still true — the flat suffixed-folder convention, the prefer-suffixed-then-plain resolution order, the deploy-time suffix strip, the reserved-set-only-grows invariant — with the example corrected, and adds what this change establishes: that a harness's directory is registry data, independent of its code.

It also carries forward ADR-0001's machine check verbatim. `scripts/adr/run.mjs` skips a superseded record's check, so a check left only on ADR-0001 would stop running the moment its status flips.

Citations to ADR-0001 elsewhere are deliberately left alone, including the seven inside frozen `## Decision` sections of other accepted records. A superseded record names its replacement, so those citations resolve transitively — which is what the supersession contract is for.

## Risks / Trade-offs

- **A developer's own content sits at `.codex/skills/<name>` under a name the manifest also records** → it is deleted. Judged acceptable: that path is where Hatch placed content under that exact name, so the overwhelmingly likely case is that it *is* Hatch's. Mitigated by the operation being one commit in a version-controlled project, and by snapshot rollback where it is not.
- **`.agents/skills/` is shared with other tooling, so name conflicts move from rare to routine** → import's destination-occupied handling already skips a file it did not place (or suffixes it, when interactive) and reports the outcome. No new mechanism; the accepted consequence is that the report matters more often now. Recorded in the successor decision record.
- **Reclamation is permanent code for a transient condition** → the registry field is the switch. Once no project holds legacy content, deleting the field disables the behaviour with no code change; the step then finds nothing to do for any harness.
- **A project that declared `codex`, then dropped the harness, keeps its legacy content forever** → reclamation only runs for declared harnesses. Accepted: dropping a harness already removes that harness's content at the time it is dropped, so this is confined to projects that dropped `codex` before this change ships. In the current testing phase, that set is empty or nearly so.
- **Local-edit protection does not cover pre-v3 manifest entries** → an entry recorded before `contentHash` existed has no baseline, so import overwrites it silently. This is existing behaviour, not introduced here. Relocation is safe for such an entry — a move preserves whatever is there — but reclamation deletes its legacy copy without a local-edit check when the entry is present in both directories. Called out so it is a known property rather than a surprise.
- **An import that reports "already up to date" can now commit** → a developer who expects a no-op sees a commit the first time they import into a project holding legacy content. Accepted: the alternative is leaving the project mid-migration, and the summary names every item moved and removed. It happens once per project.

## Migration Plan

1. Ship the `skillsDir` change and reclamation together. Neither is useful alone: the directory change without reclamation is what leaves the duplicate copies, and reclamation without the directory change has nothing to reclaim.
2. Correct `hatch-usage` in `hatch-skills` independently. It carries no ordering constraint — the skill describes where content lives, and a project sees the corrected text next time it imports that skill.
3. Rollback is reverting the `skillsDir` value. Projects that already reclaimed would need to re-import to repopulate `.codex/skills/`, which the manifest makes possible; nothing is lost that the registry cannot supply again.

## Open Questions

- When the registry field should be removed — that is, when the last project holding legacy content is known to have been imported into at least once. Safely deferred: leaving the field in place costs one stat call per import and changes nothing about the behaviour.
