# Group member-list format: a `members` array on the group's own `skill.json`

## Metadata

- **id:** 0016-group-member-manifest-format
- **component:** skill-registry-group-structure
- **status:** accepted
- **applies_to:** every group folder's `skill.json` in the skill-content repo (hatch-skills); `hatch import`'s group-parsing and member-resolution logic in the Hatch CLI
- **decision_record:** `docs/architecture/decisions/0016-group-member-manifest-format.md`

## Decision

A group's member list is a `members` array field on the group's own `skill.json` — the same per-folder metadata file [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) already mandates for the folder's `version`, and [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) already mandates every group folder carries. No new file type is introduced.

Each entry in `members` is one of two shapes, distinguished by a `kind` field:

- `{ "kind": "nested", "name": "<skill-name>" }` — the member's content physically lives at `<group-folder>/<name>/` inside the group's own registry folder.
- `{ "kind": "pointer", "name": "<skill-or-group-name>", "version"?: "<exact-semver>" }` — the member is a named pointer to a top-level skill or group living elsewhere in the registry's flat namespace ([0001-harness-suffix-convention](0001-harness-suffix-convention.md)). `version` is optional: omitted means resolve to latest (`ref=main`, per [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md)'s ref-parameterized fetch); present means an exact pin, resolved via the `<name>@<version>` git tag mechanism ([0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md)).

A pointer's `name` may itself refer to another group, at arbitrary depth, per [0013](0013-registry-group-structure-and-permanence.md)'s group-to-group pointer allowance.

## Context

[0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) settled the *semantics* of a group's member list — physically-nested vs. named pointer, optional version pin, group-to-group pointers allowed, visited-set dedup — but explicitly left the concrete on-disk format unfixed, noting only that "a group's manifest lists its members." Batch 6 (Import: groups & pointers) cannot implement group-fetch/parse logic, and the `hatch-skills` registry cannot publish a real group, without that format actually being fixed.

Surfaced directly to the developer rather than guessed, mirroring the precedent [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md) set for a comparable gap in Batch 5: a genuine format decision with no existing record to derive it from was raised as an explicit choice before any code or registry content was written against it. Confirmed by the developer in conversation (this session, Batch 6).

## Alternatives Considered

- **A separate dedicated `group-members.json` file alongside `skill.json`.** Not chosen: splits a group's metadata across two files with no real benefit over one additional field on the file [0013](0013-registry-group-structure-and-permanence.md) already requires every group folder to carry.

## Trade-offs Accepted

- **Prompt coherence:** high — an agent inspecting a group folder finds both its version and its full member list in the one file it already knows to look at (`skill.json`), rather than needing to know a second, group-specific filename exists.
- **Failure surface:** a malformed `members` entry (missing `kind`, missing `name`, invalid `version`) fails at parse time inside a single well-defined module rather than being ambiguous across two files that could disagree.
- **Reversibility:** high — `members` is an additive field; nothing about `skill.json`'s existing `version` field or a plain skill's (non-group) `skill.json` shape changes.
- **Operational simplicity:** highest of the options considered — no new file to create, document, or keep in sync; the registry's existing per-folder `skill.json` convention is reused as-is.

## Consequences

- `hatch import`'s group-fetch/parse logic (a new module) must read `members` off a fetched group's `skill.json`, validating each entry's `kind` (`"nested"` or `"pointer"`), `name`, and optional `version`.
- A `"nested"` member's content is resolved directly from the already-fetched group subtree at `<name>/`; a `"pointer"` member requires a separate registry fetch/existence-check of the pointed-to top-level folder, optionally at a pinned `<name>@<version>` ref.
- The real group content being added to `hatch-skills` for this batch's end-to-end verification is authored in this `members` shape.
- A plain (non-group) skill's `skill.json` is unaffected — it carries no `members` field, and its absence is exactly how `hatch import` distinguishes "this named folder is a plain skill" from "this named folder is a group" when resolving the initial `hatch import <name>` target.

## Agent Rules

- MUST express a group's member list as a `members` array field on that group's own `skill.json` — MUST NOT introduce a separate group-membership file.
- MUST distinguish nested from pointer members via each entry's `kind` field (`"nested"` | `"pointer"`) — MUST NOT infer the kind from any other signal (e.g. whether a matching subfolder happens to exist).
- MUST treat a pointer member's `version` field as an exact pin when present, resolved via the `<name>@<version>` tag mechanism, and as "latest" (`ref=main`) when absent.
- MUST allow a pointer member's `name` to reference another group, at arbitrary depth, consistent with [0013](0013-registry-group-structure-and-permanence.md).

## Invariants

- **The `members` array's `{kind, name, version?}` shape on a group's `skill.json`.** Becomes irreversible once: any real group has been published using this shape and the CLI's parser depends on it exactly — changing the shape without a compatible migration path would break every already-published group's machine-readability. Enforcement mechanism: none — unlike the project-level manifest ([0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)), a group's own `skill.json` carries no `schemaVersion` field of its own. Current mode: not-yet-built. This is a real gap: registry-content schema has no equivalent to the project-manifest's migration chain, so an incompatible future change here would have no fallback path once real groups are published.

## Machine Check

```bash
grep -n '"members"' <group-folder>/skill.json
```

Expected result: any registry folder that is a group (as opposed to a plain skill) has a `members` array in its `skill.json`, each entry carrying a `kind` of `"nested"` or `"pointer"` and a `name`. A plain skill's `skill.json` has no `members` field at all.

## Precedence

- Resolves the open item [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) left deferred: "this record establishes the mechanism [for group members]; the use-case document does not yet reflect it" — this record fixes the concrete file format `hatch import` and the registry both need, without contradicting 0013's settled semantics.
- Builds on [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) (per-folder `skill.json`, the `<name>@<version>` tag mechanism) and [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) (ref-parameterized fetch).
- No known conflicting decision records.
