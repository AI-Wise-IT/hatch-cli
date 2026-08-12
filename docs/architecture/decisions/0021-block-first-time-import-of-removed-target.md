# Block a first-time import of a removed skill/group; keep every other removed-flag encounter warn-only

## Metadata

- **id:** 0021-block-first-time-import-of-removed-target
- **component:** skill-registry-group-structure
- **status:** accepted
- **applies_to:** `hatch import`'s primary-target resolution logic (`src/commands/import.ts`); the `removed` flag defined by [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md)
- **decision_record:** `docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md`

## Decision

`hatch import <name>` refuses outright — exit failure, nothing placed, no manifest change, no commit — when `<name>` is being imported for the first time (no existing manifest entry for it) and its own current `skill.json` carries `"removed": true`. This applies to the exact primary target named on the command line, whether a standalone skill or a group's own entry; it does not distinguish an unpinned request from an exact/range pin, since a pin is still a deliberate act of newly depending on that name.

Every other encounter with a `removed` flag remains exactly as [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md) already specifies — warn, never block:

- Re-importing something already recorded in the manifest, which has since been flagged removed (AF-4's original case) — still a warning alongside whatever the run's primary operation was doing, never a block. A project already depending on something is not newly choosing to depend on it.
- A group's own entry is fine, but one of its *members* (nested or pointer) is independently flagged removed — still warn-only, unchanged by this record. Blocking here was considered and explicitly deferred (see Alternatives Considered) pending a registry-side mechanism this record does not attempt to design.

## Context

[0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md) settled `removed` as read-only status metadata that "changes nothing about resolution, fetch, or placement" and its Agent Rules state plainly: "MUST NOT block, fail, or alter the primary operation because of a flagged entry." That rule was written and verified entirely in the context of UC-3 AF-4 — checking *already-imported* skills/groups on every invocation, regardless of what's being explicitly imported.

Reviewing Batch 7's shipped behavior surfaced a gap that rule never actually addressed: nothing stops a *brand-new* `hatch import some-removed-thing` from succeeding silently. AF-4's own wording ("system checks all *already-imported* skills/groups") never covered the primary target itself. Flagged directly by the developer during post-batch review: a fresh import should not be able to start depending on something already known to be deprecated — that is a materially different situation from a project that already depends on it and is merely being told so.

The same review also raised whether a *group* with a removed *member* should block. The developer's own reasoning: the durable fix belongs on the registry side — when a skill is marked removed, its dependent groups' current versions should move off it (naturally as a MAJOR bump if the loss is breaking, or a non-breaking MINOR/PATCH evolution if the functionality was absorbed elsewhere) — and "we can't enforce what a breaking change is... but we can detect which groups depend on a removal once we actually remove a skill." That detection, at the registry-CI level (proactively, across every group in `hatch-skills`, before any project ever imports one), is out of scope for this record and is logged as a backlog item rather than designed here. Note that a *narrower* form of the same detection already exists today: AF-4's existing check already covers a group member once a project has imported it (a member is its own manifest entry with a `group` field, checked like any other name) — what's actually missing is the proactive, registry-wide version, not project-level detection.

## Alternatives Considered

- **Block a group import whenever any resolved member is removed, not just the group's own entry.** Not chosen for this record: without the registry-side mechanism described above, there is no way to distinguish "this dependency loss is a real problem" from the developer's own counter-example — two skills merged into one, with the removed one's functionality fully absorbed, a non-breaking evolution of the group. Blocking indiscriminately would produce false positives in exactly that legitimate case. Left as today's warn-only behavior, pending that separate design.
- **Warn instead of block on a first-time import of a removed primary target**, consistent with every other `removed` encounter. Not chosen: explicitly rejected by the developer — a fresh import has no existing investment to protect and no reason to proceed once the registry itself says the target is deprecated; warning and proceeding anyway would just create instant, avoidable technical debt.
- **Apply the block to re-imports too** (i.e., stop honoring AF-2 auto-update for something that becomes removed after it was imported). Not chosen: that would silently strand an existing project's re-import/update flow the moment anything it depends on is deprecated, contradicting the PRD's own constraint that a project must never become stuck because something it depends on moved forward. AF-4's warn-and-continue behavior for this case is unchanged.

## Trade-offs Accepted

- **Prompt coherence:** high — "removed blocks starting something new, warns about something you already have" is a short, stateable rule that an agent can apply without needing to reason about registry internals.
- **Failure surface:** a group whose *member* depends on something removed is not caught until the registry-side mechanism exists — an accepted, explicitly-scoped gap, not silently dropped (see Context and the logged backlog item).
- **Reversibility:** high — this is a narrow refinement of [0019](0019-registry-removed-metadata-flag.md)'s existing Agent Rules, not a reversal; the underlying `removed` flag semantics are untouched.
- **Operational simplicity:** no new fetch — the classify fetch `hatch import` already makes to determine group-vs-standalone already returns the target's own `skill.json`, from which `removed` is read directly.

## Consequences

- `src/registry/group-resolve.ts`'s `GroupSkillJson` gains an optional `removed` field, populated by `parseGroupSkillJson` from the same `skill.json` payload it already parses for `version`/`members`.
- `hatch import` checks `!existingEntry && meta.removed` immediately after classifying the primary target, before branching into the group or standalone resolution path — covering both uniformly through the one classify fetch already made.
- An exact-pinned import of a *historical* version that predates removal is unaffected: the pinned tag's `skill.json`, fetched via `ref=<name>@<version>`, reflects whatever `removed` state existed at that historical version — flipping `removed: true` requires its own version bump per the existing version-check CI ([0009](0009-skill-versioning-semver-tags.md)), so an old tag naturally still reads `removed: false`/absent.
- `docs/use-cases/import-content.md` (UC-3) needs a new alternative flow distinguishing this block from AF-4's warning, and a Business Rule stating the distinction plainly.
- Two related, still-unbuilt capabilities are logged rather than designed here: a registry-side CI check that a group's *current* version doesn't depend on a removed skill, and a `hatch clean`/sync-everything project-level command — see the intake backlog note this record's Precedence section points at.

## Agent Rules

- MUST block (`exit 1`, nothing placed, no manifest change, no commit) a `hatch import <name>` where `<name>` has no existing manifest entry and its own current `skill.json` (at whatever ref this run resolves — latest or an explicit pin) carries `"removed": true`.
- MUST NOT apply this block to a re-import of a name already recorded in the manifest — that case remains AF-4's warn-only path, unchanged.
- MUST NOT apply this block merely because a *member* of an otherwise-fine group is removed — that remains warn-only pending the registry-side dependency-detection mechanism logged as a backlog item.
- MUST perform this check using the classify fetch `hatch import` already makes to determine group-vs-standalone — MUST NOT issue a separate fetch solely for this check.

## Invariants

- **MUST block (exit 1) a first-time import of a removed target.** Becomes irreversible-to-relax once: real automation depends on this exit-code contract — e.g. a script or CI pipeline that treats "import fails" as "this dependency is unavailable, stop here." Enforcement mechanism: the code path in `hatch import`, covered by automated tests asserting current behavior — nothing asserts this behavior stays stable release-over-release. Current mode: not-yet-built as a hardening-relevant mechanism; flagged for completeness rather than urgency, since no real automation exists yet to depend on it.

## Machine Check

```bash
# From a project that has never imported "_removed-fixture":
node dist/index.js import _removed-fixture
echo "exit=$?"
```

Expected result: exit `1`, output naming `_removed-fixture` as removed and stating nothing was changed; no `.claude/skills/_removed-fixture` (or equivalent harness folder) created; `hatch.manifest.json` unchanged (or not created, on a first-ever import).

## Precedence

- Narrows [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md)'s Agent Rule "MUST NOT block, fail, or alter the primary operation because of a flagged entry" — that rule continues to govern every case *except* a first-time import of the exact named primary target, which this record carves out. [0019](0019-registry-removed-metadata-flag.md)'s own status remains `accepted`; the two records together, read in order, state the full rule.
- Builds on [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) (a removed folder's content and name remain fully fetchable — this record blocks *newly choosing* to depend on it, not the fetch itself) and [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) (the version-bump discipline that keeps a historical pinned tag's `removed` state accurate).
- The registry-side "does a group's current version depend on a removed skill" check and the `hatch clean` project-level command are both explicitly out of scope for this record — logged, not designed, in the intake backlog note this decision's review surfaced.
- No known conflicting decision records.
