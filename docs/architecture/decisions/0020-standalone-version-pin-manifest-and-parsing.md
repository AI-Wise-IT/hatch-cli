# Standalone version pinning: manifest `pin` field and `<name>@<spec>` argument parsing

## Metadata

- **id:** 0020-standalone-version-pin-manifest-and-parsing
- **component:** data-migrations
- **status:** accepted
- **applies_to:** `hatch.manifest.json`'s schema and migration logic (`src/manifest-migrations/index.ts`) in the Hatch CLI; `hatch import`'s argument parsing and re-import decision logic (`src/commands/import.ts`)
- **decision_record:** `docs/architecture/decisions/0020-standalone-version-pin-manifest-and-parsing.md`

## Decision

`hatch.manifest.json`'s schema version 3 (the same v2->v3 migration [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md) introduces — one migration function keyed `2`, not two competing ones) adds an optional `pin` field to every skill/group entry in `skills`:

```
"pin"?: { "type": "exact" | "range", "value": "<semver-string>" }
```

Absent means unpinned — normal AF-2 auto-update tracking applies. `type: "exact"` records a sticky pin (AF-10/AF-11): a later bare `hatch import <name>` (no `@spec`) for that entry skips the update check entirely, leaves placed content untouched, and reports the pinned version. `type: "range"` (AF-12) records a floor for visibility only — it does not change fetch or update resolution; a range-pinned entry continues to auto-update on every re-import exactly like an unpinned one.

`hatch import <name>[@<spec>]` argument parsing splits on the **last** `@` in the positional argument (registry names contain no `@` of their own, so this is unambiguous). The optional `<spec>` is classified as:
- **`latest`** (the literal string) — explicit unpin: clears any stored `pin` field on that entry and resumes normal AF-2 auto-update tracking on this and every future re-import.
- **`^<semver>`** — range/floor pin: records `{ type: "range", value: "<semver>" }`; resolves and fetches exactly as an unpinned import would (latest compatible, same MAJOR, per [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md)).
- **anything else** — exact pin: records `{ type: "exact", value: "<spec>" }`; fetched via the existing `<name>@<version>` git-tag ref mechanism ([0009](0009-skill-versioning-semver-tags.md)). No semver-format validation is performed beyond what that existing tag-ref fetch already requires — an invalid or nonexistent tag simply fails not-found, reusing that existing error path rather than adding a second validation layer.

## Context

`intake/rescope-0001-standalone-version-pinning.md` pulled AF-10/AF-11/AF-12 into this batch's scope and resolved the *behavioral* question the original PRD left open (how a sticky exact pin reconciles with AF-2's auto-update Must), but its own Consequences section explicitly left two things to this batch's implementation: "the manifest's pin-state field shape" and "the version-string parsing rules." Both needed settling before `hatch import`'s argument parser or re-import logic could be written against them.

[0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) establishes the versioned migration-chain mechanism this record's contribution to the v2->v3 migration extends, alongside [0018](0018-manifest-content-hash-local-edit-detection.md)'s `contentHash` field — both are genuinely separate facts about a skill entry, but per [0010](0010-manifest-schema-migrations.md)'s own chain design, a single schema-version bump carries however many additive fields are ready to ship together, rather than one migration per field. [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) already establishes the `<name>@<version>` git-tag ref mechanism this record's exact-pin fetch reuses directly, and the MAJOR/MINOR-PATCH "compatible" definition AF-2's (and, by extension, a range pin's) auto-update resolution already relies on.

Surfaced directly to the developer rather than guessed, mirroring the standing precedent [0015](0015-import-harness-selection-flag.md), [0016](0016-group-member-manifest-format.md), and [0017](0017-manifest-schema-v2-group-membership.md) set for this exact kind of gap — explicitly called out as needed by `rescope-0001-standalone-version-pinning.md` itself. Confirmed by the developer in conversation (this session, Batch 7): the `pin: {type, value}` shape and the `latest` / `^<semver>` / bare-literal parsing rules, exactly as proposed.

## Alternatives Considered

- **A one-shot pin** — governing only the moment of install, silently reverting to auto-update on the very next re-import. Not chosen; already rejected in `rescope-0001-standalone-version-pinning.md` itself ("doesn't actually deliver the PRD's own stated motivation, reproducible builds"), not re-litigated here — this record only needed to settle the *shape* of the sticky pin that rescope decision already committed to.
- **Validating a range pin's floor against the resolved version at fetch/update time** (e.g. refusing an import that would resolve below the recorded floor). Not chosen; explicitly out of scope per `rescope-0001-standalone-version-pinning.md`'s own Consequences section ("the range pin is descriptive only in this scope") — this record implements the pin as pure recorded metadata, no validation logic.
- **A separate top-level pin string** (e.g. `pinnedVersion: "1.2.0"`) instead of a `{type, value}` object, distinguishing exact-vs-range by a sigil convention re-parsed out of the stored string on every read. Not chosen: an explicit `type` field is unambiguous and self-describing at the point of use (`hatch import`'s re-import logic branches on `pin.type` directly), rather than re-deriving "was this a `^`-prefixed pin" from a stored string every time it's read.
- **Splitting `<name>@<spec>` on the *first* `@`** instead of the last. Not chosen: no registry name currently contains `@`, so the two approaches are behaviorally identical today, but splitting on the last `@` is the more defensible general rule (matches how npm's own `name@spec` parsing handles scoped package names, which do contain a leading `@`) and costs nothing to adopt now.

## Trade-offs Accepted

- **Prompt coherence:** high — "a pin is `{type, value}` on the manifest entry; `@<semver>` is exact, `@^<semver>` is range, `@latest` clears it" is a short, stateable rule set directly mirroring the well-known npm/pip conventions this capability was explicitly modeled on (`rescope-0001-standalone-version-pinning.md`).
- **Failure surface:** an exact pin naming a version that never existed, or that existed but whose tag was somehow removed, fails via the existing "not found" fetch error — no new failure mode is introduced, but the error message will name a git tag ref rather than a friendlier "no such version" phrasing unless `hatch import`'s error handling is specifically tuned for that case.
- **Reversibility:** high — `pin` is a purely additive field; clearing it (`@latest`) or changing it (re-pinning) are ordinary manifest writes, each still one commit per [0010](0010-manifest-schema-migrations.md) and UC-3's existing single-commit business rule.
- **Operational simplicity:** high — reuses the existing `<name>@<version>` tag-ref fetch mechanism as-is for exact pins; a range pin requires no new fetch behavior at all, only a metadata write.

## Consequences

- `src/manifest-migrations/index.ts`'s v2->v3 migration (keyed `2`, shared with [0018](0018-manifest-content-hash-local-edit-detection.md)) adds `pin` alongside `contentHash` — both purely additive, no existing field renamed or removed, nothing backfilled onto pre-existing v2 entries.
- `hatch import`'s argument parser must split the positional skill/group argument on its last `@` and classify the resulting spec (`latest` / `^<semver>` / bare literal) before any registry fetch is attempted.
- `hatch import`'s re-import decision logic must check `pin.type === "exact"` before running the AF-1/AF-2/AF-3 comparison at all — a standing exact pin short-circuits straight to AF-10, skipping the update-availability and local-edit checks entirely for that entry.
- A range pin (`pin.type === "range"`) has no effect on `hatch import`'s fetch or update logic anywhere — it is written and read only for display/reporting purposes.
- This standalone pin mechanism is entirely distinct from, and must not be confused with, a group's internal pointer-member version pin (AF-9, [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md), [0016-group-member-manifest-format](0016-group-member-manifest-format.md)) — a group member's pin is resolved fresh on every unpack and is never written to this `pin` field, per UC-3's own Business Rules section distinguishing the two mechanisms explicitly.

## Agent Rules

- MUST register `pin` as part of the same v2->v3 migration (keyed `2`) that adds `contentHash` ([0018](0018-manifest-content-hash-local-edit-detection.md)) — MUST NOT introduce a second, separate schema version for it.
- MUST parse `<name>@<spec>` by splitting on the last `@` in the positional argument.
- MUST treat `@latest` as clearing any stored `pin` field, resuming normal AF-2 auto-update tracking.
- MUST treat a `^`-prefixed spec as a range pin (`type: "range"`) that does not alter fetch or update resolution.
- MUST treat any other non-empty spec as an exact pin (`type: "exact"`), fetched via the `<name>@<version>` tag-ref mechanism ([0009](0009-skill-versioning-semver-tags.md)).
- MUST short-circuit a bare re-import (no `@spec`) of an entry with `pin.type === "exact"` to AF-10 (skip update check, report pinned) before evaluating AF-1/AF-2/AF-3.
- MUST NOT validate a range pin's floor against any resolved or fetched version in this MVP.
- MUST NOT write this standalone `pin` field from a group's internal pointer-member pin resolution (AF-9) — that mechanism remains entirely separate, per [0013](0013-registry-group-structure-and-permanence.md)/[0016](0016-group-member-manifest-format.md).

## Machine Check

```bash
grep -n '"pin"' hatch.manifest.json
```

Expected result: a `hatch.manifest.json` entry for a skill imported with `@<version>` shows `"pin": {"type": "exact", "value": "<version>"}`; one imported with `@^<version>` shows `"pin": {"type": "range", "value": "<version>"}`; an unpinned entry, or one cleared via `@latest`, has no `pin` field.

## Precedence

- Resolves the open items `intake/rescope-0001-standalone-version-pinning.md`'s own Consequences section left deferred: the pin-state manifest shape and the `@version`/`@^version`/`@latest` argument-parsing rules.
- Builds on [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) (the `<name>@<version>` tag-ref fetch mechanism and MAJOR/MINOR-PATCH compatibility definition this record reuses directly) and [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) (the versioned migration-chain mechanism).
- Shares its v2->v3 migration with [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md) — one migration function, two additive fields.
- Explicitly distinct from, and must not be conflated with, [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)/[0016-group-member-manifest-format](0016-group-member-manifest-format.md)'s group-internal pointer-member pin (AF-9) — see this record's Consequences section.
- No known conflicting decision records.
