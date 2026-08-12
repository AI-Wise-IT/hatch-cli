# Registry "removed" metadata flag: a boolean `removed` field on `skill.json`

## Metadata

- **id:** 0019-registry-removed-metadata-flag
- **component:** skill-registry-group-structure
- **status:** accepted
- **applies_to:** every skill/group folder's `skill.json` in the skill-content repo (hatch-skills); `hatch import`'s deprecation-check logic (`src/commands/import.ts`) in the Hatch CLI
- **decision_record:** `docs/architecture/decisions/0019-registry-removed-metadata-flag.md`

## Decision

A skill or group's own `skill.json` may carry an optional boolean field: `"removed": true`. Absent, or present as `false`, means the skill/group is active/normal — the overwhelmingly common case, so no field is required on ordinary content. There is no separate "deprecated" state distinct from "removed" — UC-3 AF-4's "deprecated or removed skill/group detected" wording collapses to this one flag, since neither UC-3 nor [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) defines any behavior for "deprecated" that differs from "removed" (both mean: still fetchable, never blocks anything, surface a warning).

`hatch import` checks this flag on *every* invocation, for *every* skill/group already recorded in the target project's manifest (not only the name being explicitly imported this run) — per UC-3 AF-4's business rule that the deprecation check "runs on every invocation... covers all previously-imported skills/groups." For each manifest entry, it fetches that entry's own current `skill.json` from the registry and checks `removed`; any flagged `true` is surfaced as a warning alongside the primary operation's result, without blocking or altering that operation. Per [0013](0013-registry-group-structure-and-permanence.md), a flagged folder's name and content remain fully intact and fetchable — this flag changes nothing about resolution, fetch, or placement; it is read-only status metadata.

## Context

[0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) settled the *semantics* of "removed" — a metadata flag on the still-existing folder, never a deletion, explicitly stating "the flagged item's status changes" — but its own Consequences section left the concrete field name/shape unfixed, the same kind of gap [0016-group-member-manifest-format](0016-group-member-manifest-format.md) resolved for a group's `members` list. `docs/build-plan.md`'s Batch 7 entry flagged this directly: "You'll need real registry content to test against too, which means you'll need this format settled before you can publish a 'removed' fixture to `hatch-skills`."

Surfaced directly to the developer rather than guessed, mirroring the standing precedent [0015](0015-import-harness-selection-flag.md), [0016](0016-group-member-manifest-format.md), and [0017](0017-manifest-schema-v2-group-membership.md) set for this exact kind of gap. Confirmed by the developer in conversation (this session, Batch 7): a plain boolean, not a richer status string.

## Alternatives Considered

- **A richer status enum** (`"status": "active" | "deprecated" | "removed"`). Not chosen: neither UC-3 nor [0013](0013-registry-group-structure-and-permanence.md) ever defines distinct behavior for "deprecated" versus "removed" — both terms in UC-3 AF-4's own title mean exactly the same thing operationally (warn, don't block, content stays fetchable). An enum with a value nothing in this system's behavior ever branches on is unused optionality, not a real design need.
- **A separate registry-level index or manifest file listing removed names**, instead of a per-folder field. Not chosen, for the same reason [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) rejected a separate version-to-commit index: it is a second file that must always agree with the tree it describes, when the per-folder `skill.json` — already mandated by [0009](0009-skill-versioning-semver-tags.md) for `version` and [0016](0016-group-member-manifest-format.md) for `members`, and already fetched by `hatch import` for classification — is the natural, already-visited location for one more optional field.

## Trade-offs Accepted

- **Prompt coherence:** high — "a flagged folder carries `removed: true` in its own `skill.json`; everything else about it is unchanged" is a short, stateable rule with no second state to track.
- **Failure surface:** low — a missing or malformed `removed` field simply reads as `false` (active); this record adds no new way for `hatch import` to fail, only a new warning path that never blocks.
- **Reversibility:** high — `removed` is a plain additive optional field; flipping it back to `false`/absent (should the registry ever want to "un-flag" something) is a normal content edit, not a schema migration, and doesn't touch [0013](0013-registry-group-structure-and-permanence.md)'s permanent-name guarantee at all.
- **Operational simplicity:** highest of the options considered — no new file, no new CI check, reuses the exact fetch call (`fetchRegistryFile` on `<name>/skill.json`) `hatch import` already makes today to classify a target as a group vs. a plain skill.

## Consequences

- `hatch import` must, on every invocation, fetch every manifest-recorded skill/group's own current `skill.json` (a lightweight single-file fetch, reusing `fetchRegistryFile` from `src/registry/fetch.ts`) and check its `removed` field, independent of whatever the primary operation's target is.
- A warning naming every flagged entry is surfaced in the run's summary output, alongside whatever AF-1/AF-2/AF-3/main-flow result the primary operation produced — this check must never itself cause the primary operation to fail or abort.
- The `hatch-skills` registry needs at least one real fixture folder carrying `"removed": true` to exercise this end-to-end, added once this record settles the field's shape.
- A group's own top-level entry and every one of its member entries are each checked independently by this mechanism, since each is its own top-level registry folder with its own `skill.json` — flagging a group's member skill `removed` does not implicitly flag the group, and vice versa.

## Agent Rules

- MUST express "removed" as a boolean `removed` field on the flagged skill/group's own `skill.json` — MUST NOT introduce a separate status file or registry-level index.
- MUST treat an absent `removed` field, or `removed: false`, as active/normal — MUST NOT require the field to be present on ordinary content.
- MUST NOT implement a "deprecated" state distinct from "removed" in this MVP.
- MUST check every manifest-recorded skill/group's current `removed` status on every `hatch import` invocation, not only the name being explicitly acted on.
- MUST surface a flagged entry as a warning in the run's output — MUST NOT block, fail, or alter the primary operation because of a flagged entry.
- MUST NOT change fetch, resolution, or placement behavior for a flagged folder — its content remains fully fetchable per [0013](0013-registry-group-structure-and-permanence.md).

## Machine Check

```bash
grep -n '"removed"' <flagged-folder>/skill.json
```

Expected result: a registry folder intentionally flagged removed shows `"removed": true` in its own `skill.json`; an ordinary folder's `skill.json` has no `removed` field at all (or `false`).

## Precedence

- Resolves the open item [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)'s Consequences section left unsettled: "the flagged item's status changes" without fixing the concrete field.
- Builds on [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) and [0016-group-member-manifest-format](0016-group-member-manifest-format.md) (the per-folder `skill.json` convention this field is added to).
- Sequenced alongside [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md) and [0020-standalone-version-pin-manifest-and-parsing](0020-standalone-version-pin-manifest-and-parsing.md), both also Batch 7 gaps resolved in the same developer conversation.
- No known conflicting decision records.
