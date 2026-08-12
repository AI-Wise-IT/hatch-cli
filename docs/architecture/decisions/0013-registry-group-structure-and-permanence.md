# Skill-content registry: group structure, pointers, and name permanence

## Metadata

- **id:** 0013-registry-group-structure-and-permanence
- **component:** skill-registry-group-structure
- **status:** accepted
- **applies_to:** every group folder in the skill-content repo (hatch-skills); `hatch import`'s group-unpacking, pointer-resolution, and pinned-version-conflict logic; the skill-content repo's CI (new name-permanence check)
- **decision_record:** `docs/architecture/decisions/0013-registry-group-structure-and-permanence.md`

## Decision

Groups are top-level registry folders, in the same flat namespace as skills ([0001-harness-suffix-convention](0001-harness-suffix-convention.md)), each carrying its own `skill.json`/version ([0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md)).

A group's manifest lists its members. Each member is either:
- physically nested inside the group's own folder (exists only as part of that group), or
- a named pointer to a skill, or to another group, living elsewhere in the registry's own top-level namespace — avoiding content duplication for anything usable both standalone and inside one or more groups.

A pointer may optionally pin an exact skill version, using the `<name>@<version>` git tag mechanism from [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md). Group-to-group pointers are allowed, at arbitrary depth.

Unpacking a group's member graph dedupes via a visited set keyed by skill name: once a name is resolved via one path, any later encounter of that same name via any other path — including a path that leads back to an ancestor — is skipped, not re-placed or re-fetched. No separate cycle detection is implemented; the visited set alone terminates safely on any graph shape.

Deployment always unpacks a group into its individual member skills as flat, top-level entries in the target project's harness skill directory. A group is never copied into a target project as one nested folder.

When one `hatch import` operation's unpacked member graph reaches the same skill name via two or more pointers pinned to different versions:
- if the conflicting pins share the same MAJOR version, resolve to the highest pinned version and surface a warning naming every conflicting pin and which one was used; the import proceeds and succeeds.
- if the conflicting pins differ in MAJOR version, block: abort the whole import — nothing placed, no manifest change, no commit — reporting the skill name and the conflicting pinned versions.

A skill or group's top-level registry folder name is permanent once published: it is never deleted and never renamed. "Removed" (as used in `hatch import`'s deprecation-check flow) means the folder's own metadata is flagged removed/deprecated — the folder and its name continue to exist. The skill-content repo's CI enforces this as a required status check: any PR that causes a previously-existing top-level folder name to disappear or change is blocked.

## Context

[0001-harness-suffix-convention](0001-harness-suffix-convention.md) fixed skill-folder layout and harness-suffix resolution, but its own Consequences section left group internal structure and any rename/delete policy unaddressed — neither was in scope at the time.

This surfaced while sequencing UC-5's build batch: UC-5's destination-path-collision check needs a fully, deterministically specified namespace to check against, which exposed that "how are groups structured" and "can a published name ever be reused" were both still open questions blocking that batch.

Direct research into current harness skill-discovery behavior, not assumption, forced the deployment shape: Claude Code does not reliably discover a `SKILL.md` nested more than one level under `.claude/skills/` (open issues [anthropics/claude-code#28266](https://github.com/anthropics/claude-code/issues/28266), [#39787](https://github.com/anthropics/claude-code/issues/39787), [#40640](https://github.com/anthropics/claude-code/issues/40640)), while Cursor's own documentation ([cursor.com/docs/skills](https://cursor.com/docs/skills)) confirms it recursively walks its skills root and discovers arbitrarily nested `SKILL.md` files. Codex's behavior on this specific point was not confirmed either way. Flat-unpack-always is the only deployment shape confirmed safe across every currently-supported harness.

UC-3 AF-4 ("deprecated or removed skill/group detected") already assumed "removed" was a possible registry-side event without specifying what it meant on disk; this record supplies that meaning now that name permanence is settled. UC-4 AF-4 ("target is a skill that belongs to a group... the whole group must be removed instead") already implied individually-addressable, individually-tracked group members, consistent with the flat-unpack model this record settles rather than an opaque nested-folder-per-group model.

[0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) already established the MAJOR/MINOR-PATCH compatibility boundary; this record reuses that definition directly for pinned-pointer conflict resolution rather than inventing a second one.

## Alternatives Considered

- **Groups always physically contain a full copy of every member skill (no pointers).** Not chosen: forces content duplication, and drift risk, for any skill used both standalone and inside a group.
- **Distinguish "diamond" pointer convergence from a true ancestor-cycle, with a separate lint warning for real cycles.** Not chosen for this MVP: the visited-set dedup is already safe for both shapes; the extra bookkeeping wasn't judged worth its complexity yet.
- **A delete/rename mechanism with some kind of redirect or alias.** Never seriously proposed once [0014-registry-collision-detection](0014-registry-collision-detection.md)'s collision guarantee was traced through — permanent names is the only option that keeps that guarantee sound.
- **Copy a group's folder wholesale into the target project instead of unpacking to flat entries.** Ruled out directly by Claude Code's confirmed inability to reliably discover nested `SKILL.md` files more than one level deep.

## Trade-offs Accepted

- **Prompt coherence:** high — "a name, once published, is permanent; a group member either lives inside the group or points elsewhere" is a short, stateable rule set with no per-harness or per-case branching for an agent to track.
- **Failure surface:** a badly-named skill can never be cleanly renamed, only superseded by a new, differently-named skill while the old one sits deprecated-in-place forever — the same trade most package registries make (npm has no true unpublish/rename either); accepted because the alternative would make [0014-registry-collision-detection](0014-registry-collision-detection.md)'s guarantee unsound.
- **Reversibility:** low for anything already published — a name is permanent from the moment it exists — but the mechanism itself (pointers, visited-set dedup) is ordinary metadata and traversal logic, trivially adjusted for anything not yet published.
- **Operational simplicity:** the flat-unpack-always deployment rule removes any need for per-harness-specific group-placement logic; visited-set dedup requires no separate cycle-detection code path.

## Consequences

- `hatch import`'s group-fetch logic must resolve a group's manifest recursively — physically-nested members directly, pointer members (including group-to-group) by following the reference — deduping by skill name via a visited set scoped to one import operation.
- `hatch import` must implement the pinned-version-conflict rule as a distinct code path, including the atomic abort-on-MAJOR-conflict case (no placement, no manifest change, no commit).
- The skill-content repo needs a new required CI check enforcing name permanence, alongside the existing version-bump-check ([0009](0009-skill-versioning-semver-tags.md)) and the new collision-detection check ([0014](0014-registry-collision-detection.md)).
- `docs/use-cases/import-content.md` (UC-3) needs a new alternative flow describing the pinned-pointer version-conflict behavior — this record establishes the mechanism; the use-case document does not yet reflect it.
- The concrete on-disk format for a group's member list, left open here, is settled by [0016-group-member-manifest-format](0016-group-member-manifest-format.md). Whether/how the project manifest records group membership, also left open here, is settled by [0017-manifest-schema-v2-group-membership](0017-manifest-schema-v2-group-membership.md).
- UC-3 AF-4's "deprecated or removed" wording should be read, from this record forward, as "removed" meaning metadata-flagged, never an actual folder deletion.
- [0014-registry-collision-detection](0014-registry-collision-detection.md)'s collision guarantee depends directly on this record's name-permanence rule.

## Agent Rules

- MUST treat every skill and group folder name in the registry as permanent once published — MUST NOT delete or rename a top-level registry folder under any circumstance.
- MUST implement "removed" (UC-3 AF-4) as a metadata flag on the existing folder, never as folder deletion.
- MUST resolve a group's members by following physically-nested content directly and named pointers (to a skill or another group) recursively, deduping by skill name via a visited set — MUST NOT re-place or re-fetch a name already resolved earlier in the same traversal.
- MUST unpack every group into flat, individual top-level entries in the target harness's skill directory on deployment — MUST NOT copy a group as one nested folder.
- MUST resolve a same-MAJOR pinned-pointer version conflict by selecting the highest pinned version and surfacing a warning naming every conflicting pin.
- MUST abort the entire `hatch import` operation — no placement, no manifest change, no commit — when a pinned-pointer version conflict spans different MAJOR versions, reporting the skill name and the conflicting versions.
- MUST enforce name permanence in the skill-content repo's CI as a required status check, diffing each PR against `main`.

## Invariants

- **MUST NOT delete or rename a top-level registry folder once published.** Becomes irreversible once: a real project has imported (or could import) that name — deleting or renaming it would break any future re-import and retroactively invalidate [0014-registry-collision-detection](0014-registry-collision-detection.md)'s collision guarantee. Enforcement mechanism: `hatch-skills`' CI `name-permanence-check` job (required status check). Current mode: **advisory** (`NAME_PERMANENCE_ENFORCEMENT=warn`) as of 2026-08-12 (hatch-skills PR #15) — the check had been accidentally blocking since Batch 2, closing the pre-launch cleanup window before any real cutover was named; downgraded to warn-only on discovery so dev/test-fixture cleanup stays possible, per `docs/build-plan.md`. Move back to blocking at the actual pre-launch hardening cutover.
- **MUST implement "removed" as a metadata flag, never a folder deletion.** Becomes irreversible once: the same trigger as above — this is the release valve that makes the permanence rule survivable (a mistaken or deprecated publish gets flagged, not deleted). Enforcement mechanism: the same `name-permanence-check` job — a `removed: true` folder that got deleted instead of flagged would itself be caught by that check. Current mode: advisory, same as above.

## Machine Check

```bash
git log --diff-filter=D --name-only --pretty=format: -- '*/skill.json' | sort -u
```

Expected result: empty — no `skill.json` file (i.e. no top-level skill/group folder) has ever been deleted in the skill-content repo's history. Any output names a folder whose deletion violated this record.

## Precedence

- Builds on and extends [0001-harness-suffix-convention](0001-harness-suffix-convention.md) — that record fixed skill-folder layout and harness-suffix resolution but explicitly left group internal structure and name-permanence policy open; this record settles both without contradicting it.
- Builds on [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) — reuses its MAJOR/MINOR-PATCH compatibility definition for pinned-pointer conflict resolution, and its `<name>@<version>` tag mechanism for pinning a pointer.
- [0014-registry-collision-detection](0014-registry-collision-detection.md)'s soundness depends on this record's name-permanence rule.
- [0016-group-member-manifest-format](0016-group-member-manifest-format.md) resolves this record's own deferred open item: the concrete file format for a group's member list.
- [0017-manifest-schema-v2-group-membership](0017-manifest-schema-v2-group-membership.md) resolves this record's own deferred open item: how the project manifest records group membership.
- No known conflicting decision records.
