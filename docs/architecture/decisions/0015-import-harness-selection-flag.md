# Manifest bootstrap: a dedicated `hatch init` command owns initial harness selection

## Metadata

- **id:** 0015-import-harness-selection-flag
- **component:** manifest-bootstrap
- **status:** accepted
- **applies_to:** `hatch init`'s argument parsing and manifest creation, and `hatch import`'s manifest precondition, in the Hatch CLI
- **decision_record:** `docs/architecture/decisions/0015-import-harness-selection-flag.md`

## Decision

`hatch init --harness <name[,name...]>` is the one command that creates `hatch.manifest.json`. Its value is validated against the harness registry ([0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s `isKnownHarness`) before anything else happens — before authentication, before any registry request, before any filesystem change — and becomes the manifest's initial `harnesses` array. An absent, empty, or unrecognized selection aborts with nothing created.

Every other project-scoped command requires a manifest and never creates one. `hatch import` run against a project with no `hatch.manifest.json` fails, changes nothing, and names `hatch init` as the remedy. `hatch import` does not accept a `--harness` argument at all: once a manifest exists, placement is governed entirely by its recorded `harnesses` (UC-3's business rule), and adding a harness afterwards is `hatch import --add-harness <name>`, a distinct operation with its own semantics.

`hatch init` operates on a directory that already exists. It does not create the target directory, and it does not initialize a git repository — see [0026-git-optional-dependency](0026-git-optional-dependency.md).

## Context

UC-3's Preconditions state `hatch import` "works against any existing project", but its Business Rules also state "harness placement is governed by the project manifest's recorded harness(es), never by scanning the filesystem for which harness folders happen to exist." Neither UC-3 nor [0001-harness-suffix-convention](0001-harness-suffix-convention.md) specifies how a project with no manifest at all — Hatch's first-ever command run against it — supplies that initial harness selection. [0001](0001-harness-suffix-convention.md)'s own Consequences section explicitly deferred this: "Not yet covered by this record, and left open for a later decision if needed: ... how Hatch's own project-level manifest records which harness(es) a project uses, and how a new harness would be onboarded end-to-end."

The question is therefore *which* command owns manifest creation, and how that command gets a validated harness selection with no interactive terminal available — UC-3's primary actor includes "a cloud agent acting unattended on the developer's behalf", and the PRD's cloud-agent research (cited in [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md)'s Context) established that these sessions are often headless.

Putting bootstrap in its own command keeps every other command's contract unconditional: import and remove assert a manifest rather than branching on whether one happens to exist. A project's *first* command and its *hundredth* then differ by which command is run, not by which flags a given command needs that time.

## Alternatives Considered

- **A `--harness` flag on `hatch import`, required only when no manifest exists yet.** This was the project's earlier answer, and it is reversed here. It made `hatch import`'s contract conditional on project state: a first import required the flag, every later one had to omit it, and the flag's meaning had to be distinguished from `--add-harness`'s at parse time. That conditional bootstrap branch is exactly what a dedicated command removes. It was chosen originally because the only alternative on the table then — a heavyweight project-creation command — carried an objection that no longer applies (see the next item).
- **Require a bootstrap command first.** Originally rejected on the grounds that it contradicted UC-3's precondition that import works against any pre-existing project. That objection was specific to the bootstrap command being *project creation*: a command that created a directory at a chosen parent location could not be run against a project that already existed, so requiring it would have foreclosed adopting Hatch into one. `hatch init` runs in place, in any existing directory, so the objection does not carry over and this becomes the chosen option.
- **Interactive prompt asking the developer to pick harness(es) when no manifest is present.** Not chosen: fails for the unattended/cloud-agent actor UC-3 explicitly names as a primary actor — there is no terminal to prompt in that context.
- **Infer harness(es) by scanning the target project's filesystem for existing harness folders (`.claude/`, `.codex/`, etc.).** Not chosen: directly contradicts UC-3's own Business Rule that placement is governed by the manifest, "never by scanning the filesystem" — inferring the manifest's own initial content from the filesystem is the same violation one step earlier.

## Trade-offs Accepted

- **An extra step before a project's first import.** Adopting Hatch into an existing project is now `hatch init` then `hatch import`, rather than one import carrying a flag. Accepted: the cost falls once per project, and it buys an unconditional contract for every command that follows.
- **Prompt coherence:** high — one command creates the manifest, every other command requires it. There is no state-dependent flag for an agent to reason about.
- **Failure surface:** a developer who imports into an uninitialized project gets a clear pre-flight rejection naming the remedy (no token prompt, no fetch attempted), rather than a confusing later failure.
- **Reversibility:** high — this governs manifest bootstrap only. Once a manifest exists, harness selection is entirely manifest-driven.

## Consequences

- `hatch init` must accept `--harness <name[,name...]>`, validated via `isKnownHarness` from `src/harness-registry.ts`, and must reject an absent, empty, or unrecognized selection before authenticating or fetching anything.
- `hatch init` must write `hatch.manifest.json` at the current schema version (via `migrateManifest()`, per [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)).
- `hatch import` must not accept `--harness`; passing it is an unrecognized-option error.
- `hatch import` must detect a missing `hatch.manifest.json` and abort naming `hatch init`, changing nothing and fetching nothing. This applies to `--add-harness` as well.
- Once a manifest exists, `hatch import` must ignore filesystem state entirely and place content only into the manifest's recorded `harnesses`.
- Adding a harness to an already-initialized project is `hatch import --add-harness`; `hatch init` must not modify an existing manifest.

## Agent Rules

- MUST create `hatch.manifest.json` only from `hatch init`, and never from any other command.
- MUST validate `hatch init`'s `--harness` against the harness registry's `isKnownHarness`, rejecting before authenticating or fetching.
- MUST reject `--harness` on `hatch import` as an unrecognized option.
- MUST fail, changing nothing, when any project-scoped command runs against a project with no manifest, naming `hatch init` as the remedy.
- MUST NOT infer harness selection from the target project's filesystem contents under any circumstance.
- MUST govern placement entirely from the manifest's recorded `harnesses` once a manifest exists.

## Invariants

None. This governs bootstrap behavior only; once a manifest exists, placement is entirely manifest-driven. Nothing here locks in registry state or a published name — it's ordinary CLI behavior, revisable by shipping a new CLI version without invalidating anything an external dependent already has.

## Machine Check

- **context:** cli-repo

```bash
grep -q "isKnownHarness" src/commands/init.ts || { echo "hatch init does not validate --harness via isKnownHarness"; exit 1; }
grep -q "hatch init" src/commands/import.ts || { echo "hatch import does not name hatch init in its no-manifest error paths"; exit 1; }
grep -q -- '"--harness"' src/commands/import.ts && { echo "VIOLATION: hatch import still parses --harness"; exit 1; }
echo "harness selection confined to hatch init: correct"
```

Expected result: the confirmation line, exit 0 — `src/commands/init.ts` validates its `--harness` value via `isKnownHarness`; `src/commands/import.ts` names `hatch init` in its no-manifest error paths; and `hatch import` no longer parses that option. Any other outcome indicates this record isn't implemented as decided.

## Precedence

- Resolves the open item [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s own Consequences section deferred: "how Hatch's own project-level manifest records which harness(es) a project uses." [0001](0001-harness-suffix-convention.md) cross-references this record.
- Builds on [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) (manifest read/migrate-before-use).
- Pairs with [0026-git-optional-dependency](0026-git-optional-dependency.md), which governs what `hatch init` deliberately does *not* do: create a repository.
- Does not decide `hatch import --add-harness`'s backfill semantics (UC-3 AF-5), which govern adding a harness to an already-initialized project.
- No known conflicting decision records.
