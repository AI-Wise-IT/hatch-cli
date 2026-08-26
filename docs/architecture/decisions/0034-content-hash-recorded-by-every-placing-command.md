# Manifest `contentHash` for local-edit detection, recorded by every command that places content

## Metadata

- **id:** 0034-content-hash-recorded-by-every-placing-command
- **component:** data-migrations
- **status:** accepted
- **applies_to:** `hatch.manifest.json`'s schema and migration logic (`src/manifest-migrations/index.ts`) in the Hatch CLI; `hatch import`'s placement and re-import decision logic (`src/commands/import.ts`); `hatch init`'s placement of the self-documentation skill (`src/commands/init.ts`); `hatch remove`'s local-edit classification (`src/commands/remove.ts`)
- **decision_record:** `docs/architecture/decisions/0034-content-hash-recorded-by-every-placing-command.md`
- **supersedes:** `0018-manifest-content-hash-local-edit-detection`

## Decision

`hatch.manifest.json` carries a `contentHash` field on every skill/group entry in `skills`, introduced at schema version 3 via a registered migration function (`src/manifest-migrations/index.ts`, keyed `2` per [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)'s "keyed by the version a migration migrates *from*" convention).

`contentHash` is a SHA-256 hash over the sorted `(relativePath, content)` pairs of the files Hatch actually placed for that skill — excluding `skill.json` and every other registry-only file (registry metadata, never deployed), and excluding any file that hit AF-6 (destination occupied) skip-or-suffix handling, since a skipped or suffixed file was never placed as Hatch's own content. The hash is computed from the *primary* declared harness's placed content only — the first-alphabetical harness the recorded `version` field is already derived from — not from every harness's placement separately.

**The hash is recorded by every command that places content, not only by `hatch import`.** A command that writes skill content into a project and records a manifest entry for it MUST record that entry's `contentHash` in the same operation. Today that is `hatch import` and `hatch init`; it binds any future placing command on the same terms.

Whatever a placing command computes the hash *from*, the value it records MUST describe the primary harness's skill directory as that command leaves it. The comparison side reads the directory, not a file list, so a baseline that omits something the command left on disk reports an untouched placement as edited.

For `hatch init` that is the directory itself, hashed after placement. Initialization performs a single registry fetch of the fixed self-documentation skill and writes it verbatim into every declared harness, with no harness-suffix resolution and no destination-occupied handling, so which harness is primary does not change the value — only where it is read from. It writes into the destination without clearing it, so a file already sitting there is left in place and belongs in the baseline; deriving the hash from the fetched files would leave it out.

At re-import time, `hatch import` recomputes this same hash from what is currently on disk at the primary harness's skill directory and compares it against the stored `contentHash`:
- **Match:** the placed content is exactly what Hatch last wrote — eligible for AF-1 (already up to date) or AF-2 (update available, no local edits).
- **Mismatch:** the developer (or something else) changed the placed content since it was placed — AF-3 (local edits present) fires: the content is left untouched, and the skill is reported as having local edits, regardless of whether a newer compatible version exists.

An **absent** `contentHash` means "no baseline available" and is grandfathered as unedited by both `hatch import` and `hatch remove`. That fallback exists for manifest entries written before the field did. It is not a state a current command may create: a placing command that omits the hash produces an entry that is permanently exempt from local-edit detection, and reports as unedited however it is later changed.

## Context

[0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md) established the field, the algorithm, and the comparison, and its `## Decision` describes the hash as "computed at the moment `hatch import` places a skill's content". That framing was accurate when written — `hatch import` was then the only command that placed anything.

It has not been accurate since `hatch init` began placing the self-documentation skill. Init writes real, editable content into every declared harness and records a manifest entry for it, but recorded only a `version`. The consequence reached both other commands, because each reads an absent hash as an absence of history rather than as an absence of care:

- `src/commands/remove.ts`'s `itemStatus` returns `"clean"` for an entry with no hash, so `hatch remove hatch-usage` deleted local edits without the AF-3 warning the same edit would trigger on any imported skill.
- `src/commands/import.ts`'s re-import check is guarded on `existingEntry?.contentHash`, so an update to `hatch-usage` overwrote local edits silently.

`remove.ts`'s own comment names the assumption that made this invisible — it describes an absent hash as "a pre-Batch-7 manifest entry never re-placed since". That premise stopped holding once init shipped: hash-less entries were being created fresh, on the current schema, by the current CLI, and the grandfathering clause written for legacy data was silently absorbing them.

The fix is one field at one call site. This record exists because the *rule* needed restating rather than the algorithm: 0018's Decision is frozen and names one command, so binding the obligation to placement itself — rather than to `hatch import` specifically — cannot be done by editing it.

## Alternatives Considered

- **Leave 0018 as-is and treat init's omission as an implementation bug.** Not chosen: the record is what an agent reads before touching this code, and it currently says the hash belongs to `hatch import`. An agent adding a third placing command later would read 0018 and correctly conclude the obligation did not apply to it. The next occurrence of this bug is cheaper to prevent than to find.
- **Backfill `contentHash` into existing projects' manifests on the next command that touches them.** Not chosen here: it would have a command silently rewrite a baseline from content it did not place, which is precisely what 0018's identity migration refuses to do for pre-v3 entries — an entry whose content was edited before the backfill would have the edit recorded as the baseline, permanently laundering it into "clean". Existing projects re-record their hash the next time something is actually placed. A deliberate backfill remains available as its own decision.
- **Have `hatch init` delegate its placement to `hatch import`'s code path.** Not chosen: import's path carries suffix resolution, destination-occupied handling, pin parsing and group resolution that initialization has no use for, and init's atomicity contract (nothing persists on any failure, including the manifest) differs from import's. Sharing the hash function is the part worth sharing, and that is what this does.
- **Treat an absent `contentHash` as "edited" rather than "clean".** Not chosen: it would make every genuinely pre-v3 entry report a local edit it never had, which is the false-positive 0018's identity migration was written to avoid. The asymmetry is deliberate — the fallback stays permissive, and correctness comes from never creating a hash-less entry in the first place.

## Trade-offs Accepted

- **Prompt coherence:** high — "a command that places content records a hash of what it placed" is shorter and more general than the rule it replaces, and removes the need to remember which commands are in scope.
- **Failure surface:** projects initialized before this record keep a hash-less `hatch-usage` entry and stay unprotected until something is placed for that name again. Accepted rather than backfilled, for the laundering reason above; the population is small and the exposure is confined to one known skill.
- **Reversibility:** high — the field is additive and already present in the schema; this changes which call sites populate it, not what it means or how it is computed.
- **Operational simplicity:** high — one shared hash function, no new file, no new network call, and no schema change (the field and its migration already exist at v3).

## Consequences

- `src/commands/init.ts` computes `contentHash` over the primary harness's placed directory once placement is done, and records it on the self-documentation skill's manifest entry.
- `src/commands/import.ts` is unchanged: its placement path already computes and writes the hash, and its re-import check already compares against it.
- `src/commands/remove.ts` is unchanged: its `"clean"` fallback for an absent hash remains correct for genuinely legacy entries, and stops receiving freshly-created ones.
- A project initialized by a CLI carrying this record has local-edit protection on its self-documentation skill from the moment it is created, rather than from its first re-import.

## Agent Rules

- MUST register the v2->v3 migration in `src/manifest-migrations/index.ts` keyed by `2` (the version it migrates *from*), per [0010](0010-manifest-schema-migrations.md)'s existing convention.
- MUST compute `contentHash` as a SHA-256 hash over the sorted `(relativePath, content)` pairs of the files actually placed for a skill, excluding registry-only files and excluding any AF-6 skipped/suffixed file.
- MUST record a value describing the primary harness's skill directory as the command leaves it — a command that writes into a destination it does not clear MUST hash that destination rather than its own file list.
- MUST compute `contentHash` from the primary (first-alphabetical) declared harness's placed content only — MUST NOT compute or store a separate hash per harness in this MVP.
- MUST record `contentHash` on every skill manifest entry written by any command that places that skill's content — `hatch import` and `hatch init` today, and any placing command added later — MUST NOT write it on a group's own top-level manifest entry, which has no placed files of its own.
- MUST NOT introduce a manifest entry for placed content without its `contentHash`; an absent hash is reserved for entries predating the field.
- MUST recompute the hash from current on-disk content and compare against the stored `contentHash` before choosing between AF-1/AF-2 and AF-3 on any re-import.
- MUST NOT re-fetch registry content solely to perform the local-edit comparison — the comparison MUST be local only.

## Invariants

- **The `contentHash` computation algorithm** (SHA-256 over sorted `(relativePath, content)` pairs, excluding registry-only files and any AF-6 skip/suffix outcome, primary-harness-only). Becomes irreversible once: any real project has a stored `contentHash` computed this way — changing the algorithm later would make every existing stored hash mismatch on the next re-import, falsely triggering AF-3 (local edits present) project-wide even though nothing was actually edited. Enforcement mechanism: none — the algorithm carries no version tag of its own, so a future change would have no way to distinguish an "old-algorithm hash" from a "new-algorithm hash" on an existing entry. Current mode: not-yet-built. No new invariant beyond [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)'s general rule for this record's own migration function (keyed `2`, shared with [0020-standalone-version-pin-manifest-and-parsing](0020-standalone-version-pin-manifest-and-parsing.md)).

## Machine Check

- **context:** cli-repo

Run from the `hatch-cli` checkout. The checkable fact is the registered migration and the hash's own construction — not a manifest's contents, since no `hatch.manifest.json` lives in either repo.

```bash
grep -qE "^[[:space:]]+2: \(manifest\) => manifest,$" src/manifest-migrations/index.ts && echo "v2->v3 registered as an identity transform"
grep -ran "createHash(\"sha256\")" src/ --include=*.ts | grep -v "\.test\.ts"
```

Expected result: the confirmation line, plus at least one non-test module computing a SHA-256 hash. The identity transform is what "`contentHash` is left absent on migration" means mechanically — a pre-existing v2 entry has no way to know what Hatch originally placed, so inventing a value here would fabricate a baseline and make the next re-import lie about local edits.

## Precedence

- Supersedes [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md), carrying forward its field, algorithm, comparison semantics, migration and machine check unchanged, and binding the obligation to record the hash to placement itself rather than to `hatch import` alone.
- Builds on [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) (the versioned migration-chain mechanism) and follows the field-placement precedent [0017-manifest-schema-v2-group-membership](0017-manifest-schema-v2-group-membership.md) set (an additive field on the existing `skills[name]` entry, not a new file).
- Constrains [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md)'s rule that manifest creation belongs exclusively to `hatch init`: the command that creates the manifest is also a placing command, and is bound by the recording obligation above.
- No known conflicting decision records.
