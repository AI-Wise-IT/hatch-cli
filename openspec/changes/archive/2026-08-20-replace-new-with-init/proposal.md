## Why

Hatch currently owns two jobs that don't belong together: managing skills in a project, and creating projects. `hatch new` mkdirs a folder at a chosen location, runs `git init`, and scaffolds a manifest — none of which is about skills. Project creation is being moved out of the CLI entirely (into a separate project-creation skill), which leaves Hatch free to do one thing: initialize and manage skills in a project that already exists.

Removing `hatch new` exposes a second entanglement. Manifest bootstrap currently lives inside `hatch import` as a conditional branch ([ADR-0015](../../../docs/architecture/decisions/0015-import-harness-selection-flag.md)) — a project's *first* import must pass `--harness`, every later one must not. A dedicated `hatch init` collapses that: one command creates the manifest, every other command requires it. `hatch import` loses a flag and a branch.

Doing this before launch is deliberate — nothing external depends on the CLI's command surface yet, so removing commands and flags costs nothing now and stops being free later.

## What Changes

- **BREAKING — `hatch new` is removed.** Project creation (folder creation, `git init`) moves out of Hatch entirely.
- **New `hatch init` command.** Initializes an existing directory: writes `hatch.manifest.json` with the selected harness(es), and places the fixed `hatch-usage` self-documentation skill. It does *not* create a directory and does *not* run `git init`. Refuses (or no-ops) against an already-initialized project. Placing `hatch-usage` is mandatory — no opt-out, carrying UC-1's existing rule forward.
- **BREAKING — `hatch import` no longer accepts `--harness`** and no longer bootstraps a manifest. Against a project with no manifest it fails, directing the caller to `hatch init`. Initial harness selection belongs to `hatch init`; subsequent changes belong to `hatch import --add-harness` / `hatch remove --harness`.
- **BREAKING — no command runs `git init` any more.** `hatch import`'s auto-init is removed.
- **Git becomes optional.** Every command warns — on every invocation, not once — when the project isn't a git repository, and skips its commit rather than failing. `hatch init` itself commits when git is present and skips when it isn't, on the same rule.
- **`hatch remove` gains git-independent rollback.** Its failure path currently restores deleted content via `git reset --hard HEAD`; without a repository that recovery is unavailable, so it must snapshot and restore directly, as `hatch import` already does.

Unaffected: `hatch login`, `hatch check-collisions`, and all of `hatch import` / `hatch remove`'s content resolution, placement, versioning, pinning, and local-edit behavior.

## Capabilities

`openspec/specs/` is empty — this change seeds it. Both capabilities below are therefore new specs, scoped to the behavior this change introduces or alters. Behavior it leaves untouched (import resolution, group unpacking, pinning, removal semantics) remains documented in `docs/use-cases/` until that set is migrated separately.

### New Capabilities

- `project-initialization`: `hatch init` — its inputs, what it creates, harness validation, the mandatory `hatch-usage` placement, its already-initialized and failure behavior, and the resulting rule that every project-scoped command requires an existing manifest rather than creating one.
- `version-control-integration`: how every Hatch command relates to git — never initializing a repository, committing exactly once per operation when one is present, warning and skipping the commit when it isn't, and guaranteeing "nothing changed on failure" without depending on git.

### Modified Capabilities

None — no specs exist yet to modify.

## Impact

**Code**
- `src/commands/new.ts`, `src/commands/new.test.ts` — deleted.
- `src/commands/init.ts` (+ tests) — new; reuses `new.ts`'s harness validation, manifest write, and skill placement.
- `src/index.ts` — `new` removed, `init` registered.
- `src/commands/import.ts` — `--harness` parsing and the manifest-bootstrap branch removed; git auto-init removed at both call sites; commits made conditional.
- `src/commands/remove.ts` — commits made conditional; `git reset --hard HEAD` recovery replaced with direct snapshot/restore.

**Architecture decisions** (edited in place — pre-launch, no external dependents)
- [0015-import-harness-selection-flag](../../../docs/architecture/decisions/0015-import-harness-selection-flag.md) — superseded; `hatch init` owns manifest bootstrap. Its rejected "require a bootstrap command first" option becomes the chosen one, because `hatch init` is in-place and so doesn't carry the objection that `hatch new` did.
- [0002-cli-runtime-nodejs](../../../docs/architecture/decisions/0002-cli-runtime-nodejs.md) — its stated git behavior ("auto-init if missing, exactly one commit per operation, and rollback-to-last-commit on partial failure") is wrong on all three points after this change.
- New ADR — git as an optional dependency; nothing covers this today.
- [0001](../../../docs/architecture/decisions/0001-harness-suffix-convention.md), [0003](../../../docs/architecture/decisions/0003-registry-github-tarball-fetch.md), [0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md), [0017](../../../docs/architecture/decisions/0017-manifest-schema-v2-group-membership.md) — incidental `hatch new` references.

**Documentation**
- `README.md` — implemented-command list.
- `docs/use-cases/bootstrap-new-project.md` — updated to describe `hatch init`; this set is slated for deprecation once OpenSpec specs take over.

**Cross-repo** (`AI-Wise-IT/hatch-skills`)
- `hatch-usage/SKILL.md` — documents `new <name> --harness <list>` and `import`'s `--harness` rule; both change. A version bump is required (`version-check` is a blocking status check).

**Consequence worth stating**: in a git-less project, the per-operation commit that today makes destructive operations recoverable is absent, so `hatch remove --force-all` becomes unrecoverable. The always-on warning is the mitigation.

**Out of scope**: a `hatch harness add` / `hatch harness remove` command surface (harness management stays on `import --add-harness` / `remove --harness`), and registry discovery (`search`/`list`).
