# Manifest schema v2: record group membership per skill, and the group itself, in `hatch.manifest.json`

## Metadata

- **id:** 0017-manifest-schema-v2-group-membership
- **component:** data-migrations
- **status:** accepted
- **applies_to:** `hatch.manifest.json`'s schema and migration logic (`src/manifest-migrations/index.ts`) in the Hatch CLI; `hatch import`'s group-unpack path (`src/commands/import.ts`)
- **decision_record:** `docs/architecture/decisions/0017-manifest-schema-v2-group-membership.md`

## Decision

`hatch.manifest.json` moves to schema version 2, via a registered migration function (`src/manifest-migrations/index.ts`, keyed `1` per [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)'s "keyed by the version a migration migrates *from*" convention), adding group-membership tracking:

- Every entry in `skills` may carry an optional `group` field: the name of the group that placed it, when that skill was placed as part of unpacking a group. Absent when the skill was imported standalone, exactly as every entry behaves today.
- A group itself is also recorded as its own top-level entry in `skills`, keyed by the group's own name, with its own `version` (the group's version, from its `skill.json`) — the same way a standalone skill's entry already works. This entry carries no `group` field (a group is never itself a member of another group's *manifest* entry, even though ADR-0013 allows group-to-group *pointers* inside the registry).

The v1->v2 migration itself is a no-op transform on existing data (no field is renamed or removed — `group` is purely additive and simply absent on every pre-existing v1 entry) but is implemented as a real migration function through the same versioned chain every other manifest shape change goes through, not as an unversioned additive change.

## Context

[0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)'s Consequences section flagged, without resolving, that the manifest needs to know which skills belong to which group: Batch 8 (UC-4 AF-4) must refuse removing a single skill that belongs to a group, naming the group instead — which requires the manifest to already record that membership by the time Batch 8 runs.

[0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) already establishes that any real shape change to `hatch.manifest.json` goes through a registered, versioned migration function, transparently applied on every read — this record supplies the first actual migration exercising that chain (schema version 1, written by `hatch new`/Batch 4-5's `hatch import`, has been the only shape to exist until now).

Surfaced directly to the developer as a genuine open decision — whether to add this tracking now (Batch 6) or defer it to Batch 8 when it's actually consumed — rather than guessed past, mirroring the same surfacing precedent [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md) set. Confirmed by the developer in conversation (this session, Batch 6): add it now, so Batch 8 reads a manifest shape that has already been real and exercised for two batches rather than retrofitting the migration under pressure once AF-4 is actually being built.

## Alternatives Considered

- **Defer to Batch 8: keep schema at v1, record only flat `skills[name] = {version}` entries for group members (identical to a standalone import) with no group linkage.** Not chosen: the developer preferred settling the shape now, closer to when the group-unpacking code that will populate it is already being written, over letting Batch 8 both design and migrate to v2 under the pressure of also needing to implement AF-4's removal-refusal logic in the same batch.

## Trade-offs Accepted

- **Prompt coherence:** high — "a skill's manifest entry names the group that placed it, if any; a group has its own entry like any skill" is a short, uniform rule, consistent with how a standalone skill's entry already looks.
- **Failure surface:** low — the migration is purely additive (no rename/removal), so it carries none of the real migration risk [0010](0010-manifest-schema-migrations.md)'s Trade-offs section already accepted for migrations in general; a bug here would only be a missing/wrong `group` value, not data loss.
- **Reversibility:** high, per [0010](0010-manifest-schema-migrations.md)'s own accepted trade-off — every manifest state remains recoverable via the target project's own git history, since every Hatch operation is already its own commit.
- **Operational simplicity:** this record adds one small migration function and two new fields to an already-established mechanism; no new file, command, or manual step.

## Consequences

- `src/manifest-migrations/index.ts`'s `CURRENT_SCHEMA_VERSION` becomes `2`; a migration function keyed `1` is registered, adding no data (an identity transform on existing fields) beyond bumping `schemaVersion` — new `group` fields and group-name entries are populated going forward by whatever command writes them (Batch 6's group-unpack path), not backfilled onto pre-existing v1 data with no way to know it.
- `hatch import`'s group-unpack path (Batch 6) must write a `group` field on every member skill's manifest entry it places, and must write the group's own name as a top-level `skills` entry with the group's version.
- A standalone (non-group) `hatch import` continues to write a `skills[name] = {version}` entry with no `group` field, unchanged from today.
- Batch 8 (UC-4 AF-4) can read `skills[name].group` directly to determine whether a removal target belongs to a group, and name that group in its refusal — no new manifest work required in that batch.
- `docs/build-plan.md`'s Batch 6 entry and `hatch import`'s manifest-write logic must reflect schema v2 from this batch forward.

## Agent Rules

- MUST register the v1->v2 migration in `src/manifest-migrations/index.ts` keyed by `1` (the version it migrates *from*), per [0010](0010-manifest-schema-migrations.md)'s existing convention.
- MUST write an optional `group` field on a member skill's `skills[name]` manifest entry whenever that skill is placed as part of unpacking a group, naming that group.
- MUST NOT write a `group` field on a skill's manifest entry when that skill was imported standalone.
- MUST record an imported group itself as its own top-level entry in `skills`, keyed by the group's name, with the group's own version, and no `group` field of its own.
- MUST NOT backfill or guess a `group` value for any pre-existing v1 manifest entry during migration — the v1->v2 migration only bumps `schemaVersion`.

## Machine Check

```bash
grep -n '"schemaVersion": 2' hatch.manifest.json
grep -n '"group"' hatch.manifest.json
```

Expected result: any `hatch.manifest.json` written after this record's implementation carries `schemaVersion: 2`; a project with at least one group import shows a `group` field on that group's member entries and a top-level `skills` entry keyed by the group's own name.

## Precedence

- Resolves the open item [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)'s Consequences section flagged without settling: how the manifest records group membership for Batch 8's benefit.
- Builds on [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) (the versioned migration-chain mechanism this record's v1->v2 migration is the first real exercise of).
- Depended on by Batch 8 (UC-4 AF-4, `docs/build-plan.md`) — that batch's group-membership removal-refusal logic reads the `group` field this record establishes.
- No known conflicting decision records.
