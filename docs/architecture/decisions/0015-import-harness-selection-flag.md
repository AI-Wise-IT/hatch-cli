# Harness selection for `hatch import` against a manifest-less project: an explicit `--harness` flag

## Metadata

- **id:** 0015-import-harness-selection-flag
- **component:** manifest-bootstrap
- **status:** accepted
- **applies_to:** `hatch import`'s argument parsing and manifest-bootstrap logic in the Hatch CLI
- **decision_record:** `docs/architecture/decisions/0015-import-harness-selection-flag.md`

## Decision

`hatch import <skill-or-group-name>` accepts an optional `--harness <name[,name...]>` flag.

When `hatch import` runs against a target project that has no `hatch.manifest.json` yet (no prior `hatch new` or `hatch import` in that project), `--harness` is required: its value is validated against the harness registry ([0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s `isKnownHarness`) exactly as `hatch new` already validates its own `--harness` flag, and becomes the manifest's initial `harnesses` array. Omitting `--harness` in this case is an error — nothing is created, per the same "nothing changed on failure" contract every other `hatch import` failure path already follows.

When a manifest already exists, placement is governed entirely by the manifest's recorded `harnesses` (UC-3's existing business rule) and `--harness` is not needed for an ordinary import. This record does not decide what happens if `--harness` is passed anyway once a manifest exists — that is Batch 9's `--add-harness` backfill flow (UC-3 AF-5), a distinct mechanism with its own semantics, left to that batch's own implementation.

## Context

UC-3's Preconditions state `hatch import` "works against any existing project, not only ones originally created by `hatch new`," but its Business Rules also state "harness placement is governed by the project manifest's recorded harness(es), never by scanning the filesystem for which harness folders happen to exist." Neither UC-3 nor [0001-harness-suffix-convention](0001-harness-suffix-convention.md) specifies how a project with no manifest at all — Hatch's first-ever command run against it — supplies that initial harness selection. [0001](0001-harness-suffix-convention.md)'s own Consequences section explicitly deferred this: "Not yet covered by this record, and left open for a later decision if needed: ... how Hatch's own project-level manifest records which harness(es) a project uses, and how a new harness would be onboarded end-to-end."

This gap surfaced directly while building Batch 5 (`hatch import`, first-time standalone skill) — the batch cannot implement harness resolution without an answer, and guessing silently would risk exactly the kind of undocumented behavior this project's ADR process exists to prevent (see `docs/build-plan.md`'s Batch 1 notes for the standing precedent of surfacing this kind of gap rather than assuming past it).

`hatch new` already established the precedent this record extends: an explicit, validated `--harness <name[,name...]>` flag (`src/commands/new.ts`), checked against the same harness registry, with unrecognized harnesses rejected before anything is created. UC-3's primary actor includes "a cloud agent acting unattended on the developer's behalf" — any resolution mechanism must work identically with no interactive terminal available.

## Alternatives Considered

- **Refuse `hatch import` and require `hatch new` first for a manifest-less project.** Not chosen: directly contradicts UC-3's own stated precondition that import "works against any existing project, not only ones originally created by `hatch new`" — would require correcting UC-3's wording to narrow that precondition, not just an implementation choice.
- **Interactive prompt asking the developer to pick harness(es) on first run, when no manifest and no flag are present.** Not chosen: fails for the unattended/cloud-agent actor UC-3 explicitly names as a primary actor — there is no terminal to prompt in that context, and the PRD's cloud-agent research (cited in [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md)'s Context) already established these sessions are often headless.
- **Infer harness(es) by scanning the target project's filesystem for existing harness folders (`.claude/`, `.codex/`, etc.).** Not chosen: directly contradicts UC-3's own Business Rule that placement is governed by the manifest, "never by scanning the filesystem" — inferring the manifest's own initial content from the filesystem is the same violation one step earlier.

## Trade-offs Accepted

- **Prompt coherence:** high — the exact same flag, same validation function, same rejection message shape as `hatch new`'s existing `--harness` handling; nothing new for an agent to learn.
- **Failure surface:** a developer who forgets `--harness` on a truly first-ever `hatch import` in a project gets a clear, pre-flight rejection (no token prompt, no fetch attempted) rather than a confusing later failure — consistent with `hatch new`'s AF-3 (invalid harness selection) validating before authentication.
- **Reversibility:** high — this only governs manifest bootstrap; once a manifest exists, harness selection is entirely manifest-driven and this flag becomes irrelevant to that project going forward.
- **Operational simplicity:** highest of the options considered — no new prompt flow, no filesystem-scanning heuristic to maintain, reuses `hatch new`'s validation path as-is.

## Consequences

- `hatch import`'s argument parser must accept `--harness <name[,name...]>`, validated via `isKnownHarness` from `src/harness-registry.ts`, using the same "unrecognized harness(es)" rejection shape `hatch new` already uses.
- `hatch import` must detect whether `hatch.manifest.json` exists (after migrating it through `migrateManifest()` if present, per [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)) before deciding whether `--harness` is required.
- If no manifest exists and `--harness` is omitted, `hatch import` must reject before authenticating or fetching anything — nothing is created, matching every other `hatch import` failure path's "nothing changed" contract.
- If a manifest exists, `hatch import` must ignore filesystem state entirely and place content only into the manifest's recorded `harnesses`.
- Batch 9 (`hatch import --add-harness`) must define its own semantics for `--harness`/`--add-harness` when a manifest already exists; this record does not constrain that decision.

## Agent Rules

- MUST accept `--harness <name[,name...]>` on `hatch import`, validated against the harness registry's `isKnownHarness`, using the same rejection behavior as `hatch new`'s `--harness` handling.
- MUST require `--harness` and reject before authenticating or fetching when `hatch import` runs against a project with no `hatch.manifest.json`.
- MUST NOT infer harness selection from the target project's filesystem contents under any circumstance.
- MUST govern placement entirely from the manifest's recorded `harnesses` once a manifest exists, ignoring any `--harness` value for ordinary (non-backfill) import behavior.

## Invariants

None. This governs first-import bootstrap behavior only; once a manifest exists, placement is entirely manifest-driven regardless of this flag. Nothing here locks in registry state or a published name — it's ordinary CLI behavior, revisable by shipping a new CLI version without invalidating anything an external dependent already has.

## Machine Check

```bash
grep -n "harness" src/commands/import.ts
```

Expected result: `hatch import`'s argument parsing shows a `--harness` option validated via `isKnownHarness` (mirroring `src/commands/new.ts`), and the manifest-bootstrap path shows a check for `hatch.manifest.json`'s existence gating whether `--harness` is required. Absence indicates this record isn't implemented as decided.

## Precedence

- Resolves the open item [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s own Consequences section deferred: "how Hatch's own project-level manifest records which harness(es) a project uses." [0001](0001-harness-suffix-convention.md) has been updated to cross-reference this record.
- Builds on [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) (manifest read/migrate-before-use) and reuses `hatch new`'s established `--harness` validation pattern rather than introducing a second one.
- Does not decide Batch 9's `--add-harness` backfill semantics (UC-3 AF-5) — left to that batch.
- No known conflicting decision records.
