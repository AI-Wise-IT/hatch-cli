## Context

See [proposal.md](proposal.md) — Why. The design-relevant current state:

- `src/commands/new.ts` (251 lines) already contains everything `hatch init` needs — harness validation, authentication, registry fetch, per-harness placement, manifest write, commit — wrapped around two behaviors being dropped (`mkdirSync` of the target, `git.init()`). It imports no placement helper; the logic is inline.
- Manifest bootstrap lives inside `src/commands/import.ts` as a conditional branch ([import.ts:364-418](../../../src/commands/import.ts:364)), governed by [ADR-0015](../../../docs/architecture/decisions/0015-import-harness-selection-flag.md).
- Git touches five sites across two commands: auto-init at [import.ts:428](../../../src/commands/import.ts:428) and [import.ts:1050](../../../src/commands/import.ts:1050); commits at [import.ts:769](../../../src/commands/import.ts:769), [:923](../../../src/commands/import.ts:923), [:1287](../../../src/commands/import.ts:1287) and [remove.ts:334](../../../src/commands/remove.ts:334), [:509](../../../src/commands/remove.ts:509).
- The two commands' failure paths are asymmetric. `hatch import` already restores state itself — it tracks `writtenFiles` and `rmSync`s them, then restores or deletes the manifest directly ([import.ts:924-936](../../../src/commands/import.ts:924)), with no git involvement. `hatch remove` deletes content first and leans on `git reset --hard HEAD` to bring it back ([remove.ts:335-342](../../../src/commands/remove.ts:335)), with only the manifest restored directly.

## Goals / Non-Goals

**Goals:**
- One command owns manifest creation; every other command asserts a manifest and never creates one.
- Git participation is decided in exactly one place, not re-derived at each of five call sites.
- The "nothing was changed" contract becomes structurally independent of git rather than incidentally dependent on it.
- `hatch init` is demonstrably `new.ts` minus project creation — a subtraction, not a rewrite, so existing behavior carries over rather than being reimplemented.

**Non-Goals:**
- Reworking import/remove content resolution, placement, pinning, or local-edit detection. Untouched beyond the commit and rollback seams.
- A general project-creation capability. That leaves the CLI entirely.
- Reorganizing harness management onto a `hatch harness` command surface.
- Migrating `docs/use-cases/` into OpenSpec specs.

## Decisions

### `hatch init` as its own command, superseding ADR-0015's answer

`hatch init` owns manifest creation; `hatch import` asserts one.

*Alternatives considered:*
- **`hatch import --init`.** Rejected: preserves the conditional bootstrap branch that motivates this change, just renamed.
- **Status quo (bootstrap inside import).** Rejected per the proposal.

ADR-0015 explicitly rejected "require a bootstrap command first" because it contradicted UC-3's precondition that import works against any pre-existing project. That objection was specific to `hatch new` being heavyweight — it created a directory at a chosen parent location, so requiring it foreclosed adopting Hatch into an existing project. `hatch init` runs in place, in any directory, so the objection does not carry over.

**ADR handling:** edit 0015 in place rather than superseding it with a new record. Its component (`manifest-bootstrap`) is still exactly the question being answered — only the answer changes. Its "Alternatives considered" section absorbs the reversal, recording that `--harness`-on-import was the prior answer and why it no longer holds. Chosen over a supersession chain because the project has no superseded ADR yet and pre-launch in-place editing is sanctioned; a two-record chain would cost more to read than it conveys.

### Version control is recognized only at the project root

Detection stays `checkIsRepo(IS_REPO_ROOT)` — the check import already uses. A project inside an enclosing repository's work tree is treated as not version-controlled.

*Alternative considered:* `IS_INSIDE_WORK_TREE`, so a monorepo subfolder commits into its enclosing repository. Rejected — Hatch would write commits into a repository whose root it does not own, mixing its changes with whatever unrelated edits happen to be staged there. The cost is accepted: a monorepo-nested project warns on every invocation about missing version control even though its files are in fact tracked.

This is a behavior change either way, because today that same case silently receives a nested `.git` of its own from import's auto-init.

### A single version-control gate, warning at entry

One module (`src/project/version-control.ts`) exposes the repo-root check, the commit, and the warning. All five existing call sites route through it.

The warning is emitted **at command entry, once the target project is resolved and before any mutation** — not at commit time. Commit-time emission would silently skip the warning on any command that fails before reaching its commit, which is exactly when a developer most needs to know there is no recovery point. This also satisfies the spec's every-invocation rule for commands that abort early.

*Alternative considered:* inline checks at each call site. Rejected — five sites, three of them in one file, is how the current git behavior drifted into being undocumented in the first place.

### `hatch remove` snapshots in memory before deleting

Before deleting any content, `remove` reads each target file into an in-memory map keyed by project-relative path, mirroring the `writtenFiles` pattern `import` already uses. On failure it rewrites them and restores the manifest; on success it discards the map. The `git reset --hard HEAD` recovery is deleted outright rather than kept as a fallback — a recovery path that only sometimes exists is worse than one contract that always holds.

*Alternative considered:* rename the target tree aside to a temp directory, delete on success, rename back on failure. Cheaper for large trees (a rename, not a copy) but leaves stray state if the process is killed mid-operation, and introduces a directory that other Hatch commands would need to know to ignore. In-memory has a bounded, self-cleaning failure mode and matches existing precedent.

*Trade-off accepted:* peak memory scales with the size of what is being removed. The realistic worst case is `hatch remove --harness <name>` on a project with many groups; skill content is text plus modest `references/`/`assets/` payloads, so this is well within reach.

### Already-initialized projects: no-op when identical, error when the request differs

Re-running `hatch init` with harnesses the project already declares reports and exits `0`. Requesting an undeclared harness exits non-zero and points at `hatch import --add-harness`.

The exit-`0` half follows the project's established treatment of already-in-desired-state requests (`--add-harness` on an added harness, `remove --harness` on an undeclared one). The error half exists because a plain no-op would silently discard an explicit `--harness codex` request — the caller asked for something and would be told nothing happened while believing it had.

## Risks / Trade-offs

- **Destructive removal becomes unrecoverable without git.** Today the per-operation commit is the undo for `hatch remove --force-all`. → Mitigated only by the every-invocation warning, deliberately emitted before the operation rather than after. Accepted as an edge case; the intended path is that the project-creation skill runs `git init`.
- **Monorepo-nested projects warn perpetually about tracked files.** → Accepted, per the decision above. Revisitable without a spec change to the other requirements if it proves annoying in practice.
- **Regression risk in `remove`'s new rollback path.** This is the only genuinely new logic; its failure mode (manifest and disk diverging) is the exact state `contentHash` drift detection is built to distrust, so a bug here is quiet rather than loud. → Tests must exercise mid-operation failure in both a git and a non-git project, asserting disk *and* manifest, not just exit code.
- **Test churn beyond the changed behavior.** Every existing import/remove test asserting "exactly one commit" runs in a git-initialized fixture that `import` created for itself. Once auto-init is gone, those fixtures must init git explicitly or they will silently start exercising the non-git path while still passing. → Audit fixture setup before changing assertions; a test that passes for the wrong reason is the main hazard here.
- **Cross-repo coupling.** `hatch-usage/SKILL.md` documents the command surface and lives in the private `hatch-skills` repo behind a blocking `version-check`. → Its update is a separate PR with a version bump, sequenced so the CLI change does not ship documentation that describes a removed command.

## Migration Plan

No data migration: `hatch.manifest.json`'s schema is unchanged, so existing projects are unaffected on disk and no `manifest-migrations` entry is needed.

Sequencing:
1. Land the CLI change (remove `new`, add `init`, strip bootstrap and auto-init from `import`, route all commits through the gate, rebuild `remove`'s rollback).
2. Update `hatch-usage/SKILL.md` in `hatch-skills` with a version bump.
3. Update ADRs and `README.md`.

Existing projects created by `hatch new` keep working — they already have a manifest and a git repository, which is precisely the state `hatch init` would have produced. No re-initialization is required of anyone.

**Rollback:** revert the CLI commit. Nothing here writes persistent state in a new format, so a revert is complete — no project on disk records which CLI version touched it.
