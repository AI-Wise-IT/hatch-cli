# Local-edit detection for re-import: a stored per-skill `contentHash` in the manifest

## Metadata

- **id:** 0018-manifest-content-hash-local-edit-detection
- **component:** data-migrations
- **status:** accepted
- **applies_to:** `hatch.manifest.json`'s schema and migration logic (`src/manifest-migrations/index.ts`) in the Hatch CLI; `hatch import`'s re-import decision logic (`src/commands/import.ts`)
- **decision_record:** `docs/architecture/decisions/0018-manifest-content-hash-local-edit-detection.md`

## Decision

`hatch.manifest.json` moves to schema version 3, via a registered migration function (`src/manifest-migrations/index.ts`, keyed `2` per [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)'s "keyed by the version a migration migrates *from*" convention), adding a `contentHash` field to every skill/group entry in `skills`.

`contentHash` is a SHA-256 hash, computed at the moment `hatch import` places a skill's content, over the sorted `(relativePath, content)` pairs of the files Hatch actually wrote for that skill — excluding `skill.json` (registry metadata, never deployed) and excluding any file that hit AF-6 (destination occupied) skip-or-suffix handling, since a skipped or suffixed file was never placed as Hatch's own content in the first place. The hash is computed from the *primary* declared harness's placed content only — the same first-alphabetical harness `src/commands/import.ts` already uses today to derive the recorded `version` field (see `primaryFolder` in the standalone-import path) — not from every harness's placement separately.

At re-import time, `hatch import` recomputes this same hash from what is currently on disk at that primary harness's skill directory and compares it against the stored `contentHash`:
- **Match:** the placed content is exactly what Hatch last wrote — eligible for AF-1 (already up to date) or AF-2 (update available, no local edits).
- **Mismatch:** the developer (or something else) changed the placed content since import — AF-3 (local edits present) fires: the content is left untouched, and the skill is reported as having local edits, regardless of whether a newer compatible version exists.

## Context

UC-3's AF-3 ("Re-import — local edits present") requires knowing whether placed content still matches what Hatch itself placed, but neither the use case nor any existing ADR defines a mechanism for that comparison — a genuine implementation gap flagged directly in this batch's planning (see `docs/build-plan.md`'s Batch 7 entry: "the concrete mechanism... is undecided and load-bearing"). This gates whether AF-2 (auto-update) or AF-3 (protect local edits) fires on every re-import, so it had to be settled before `hatch import`'s re-import logic could be written.

[0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) already establishes the versioned migration-chain mechanism this record's v2->v3 migration is the second real exercise of, following [0017-manifest-schema-v2-group-membership](0017-manifest-schema-v2-group-membership.md)'s v1->v2 precedent. [0017](0017-manifest-schema-v2-group-membership.md) also set the precedent this record follows for *where* a new per-skill fact lives: as an additional field on the existing `skills[name]` manifest entry, not a new file or a separate index.

Surfaced directly to the developer rather than guessed, mirroring the standing precedent from [0015](0015-import-harness-selection-flag.md), [0016](0016-group-member-manifest-format.md), and [0017](0017-manifest-schema-v2-group-membership.md) for a genuine, undecided design gap with no existing record to derive it from. Confirmed by the developer in conversation (this session, Batch 7): store a hash, not re-fetch-and-diff.

## Alternatives Considered

- **Re-fetch the original (import-time) version's content at every re-import and diff it byte-for-byte against what's on disk.** Not chosen: requires an extra network fetch of the *old* version on every single re-import just to perform a comparison a locally-stored value makes free — real cost (network round-trip, registry load) for no accuracy benefit over a hash, since a SHA-256 collision is not a practical concern here.
- **Per-file hashes, stored as a nested structure under each skill's manifest entry, instead of one hash per skill.** Not chosen: this project's existing manifest granularity for everything else about a skill — `version`, `group` ([0017](0017-manifest-schema-v2-group-membership.md)) — is already per-skill, not per-file; a nested per-file structure would be the only field at a different granularity, for marginal benefit (naming which specific file was edited isn't something any current use case asks for — AF-3 only needs a yes/no).
- **Hash every declared harness's placed content separately, not just the primary harness.** Not chosen for this record, for the same reason `version` is already derived from only the primary harness today: today's registry content is harness-neutral, so every harness resolves to identical content, making a per-harness hash redundant in practice. Accepted as a known limitation, same as the existing `version` field's.

## Trade-offs Accepted

- **Prompt coherence:** high — "a skill's manifest entry records a hash of what Hatch placed; re-import compares it to what's on disk" is a short, stateable rule, consistent with how `version` and `group` already work.
- **Failure surface:** a skill edited only in a non-primary harness's folder (a scenario not yet reachable in practice, since all current registry content is harness-neutral) would go undetected by this mechanism — an accepted limitation identical in shape to the existing `version`-from-primary-harness limitation, not a new risk this record introduces.
- **Reversibility:** high — `contentHash` is a purely additive field; the v2->v3 migration touches no existing field, and a bug in hash computation is recoverable via the target project's own git history, per [0010](0010-manifest-schema-migrations.md)'s existing accepted trade-off for migrations in general.
- **Operational simplicity:** high — no new file, no new network call at re-import time (the comparison is entirely local, against content already read from disk), reuses Node's built-in `crypto` module and the already-established migration-chain mechanism.

## Consequences

- `src/manifest-migrations/index.ts`'s `CURRENT_SCHEMA_VERSION` becomes `3`; a migration function keyed `2` is registered, adding no data (an identity transform on existing fields, bumping only `schemaVersion`) — pre-existing v2 entries have no way to retroactively know what Hatch originally placed, so `contentHash` is left absent on migration and populated going forward only by a command that actually places content.
- `hatch import`'s placement path must compute and write `contentHash` on every skill/group entry it places or updates (standalone and group-member entries alike; a group's own top-level entry, which has no placed files of its own, carries no `contentHash`).
- `hatch import`'s re-import decision logic must recompute the hash from on-disk content at the primary harness's skill directory and compare it against the stored value before deciding between AF-1/AF-2 (hash matches) and AF-3 (hash mismatches).
- A skill imported by a pre-Batch-7 CLI version (schema v1 or v2, no `contentHash`) has no baseline to compare against on its first post-upgrade re-import; `hatch import` must treat an absent `contentHash` as "no baseline available" rather than crashing — the concrete fallback (treat as AF-2-eligible vs. AF-3-cautious) is an implementation detail of this batch, not fixed by this record beyond requiring it not crash.

## Agent Rules

- MUST register the v2->v3 migration in `src/manifest-migrations/index.ts` keyed by `2` (the version it migrates *from*), per [0010](0010-manifest-schema-migrations.md)'s existing convention.
- MUST compute `contentHash` as a SHA-256 hash over the sorted `(relativePath, content)` pairs of the files actually placed for a skill, excluding `skill.json` and excluding any AF-6 skipped/suffixed file.
- MUST compute `contentHash` from the primary (first-alphabetical) declared harness's placed content only — MUST NOT compute or store a separate hash per harness in this MVP.
- MUST write `contentHash` on every standalone and group-member skill manifest entry `hatch import` places or updates — MUST NOT write it on a group's own top-level manifest entry.
- MUST recompute the hash from current on-disk content and compare against the stored `contentHash` before choosing between AF-1/AF-2 and AF-3 on any re-import.
- MUST NOT re-fetch registry content solely to perform the local-edit comparison — the comparison MUST be local only.

## Machine Check

```bash
grep -n '"contentHash"' hatch.manifest.json
```

Expected result: any `hatch.manifest.json` written by a post-Batch-7 `hatch import` shows a `contentHash` field on each standalone/group-member skill entry in `skills`, absent on any group's own top-level entry.

## Precedence

- Resolves the open item `docs/build-plan.md`'s Batch 7 entry flagged without settling: the concrete local-edit-detection mechanism gating UC-3 AF-2 vs. AF-3.
- Builds on [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) (the versioned migration-chain mechanism) and follows the field-placement precedent [0017-manifest-schema-v2-group-membership](0017-manifest-schema-v2-group-membership.md) set (an additive field on the existing `skills[name]` entry, not a new file).
- Sequenced alongside [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md) and [0020-standalone-version-pin-manifest-and-parsing](0020-standalone-version-pin-manifest-and-parsing.md), both also Batch 7 gaps resolved in the same developer conversation; this record's v2->v3 migration and 0020's pin field are the same migration (see 0020's Precedence).
- No known conflicting decision records.
