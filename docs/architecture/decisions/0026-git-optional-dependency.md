# Git is an optional dependency: Hatch commits when a repository is there, and works without one

## Metadata

- **id:** 0026-git-optional-dependency
- **component:** version-control-integration
- **status:** accepted
- **applies_to:** every project-scoped Hatch CLI command — `src/project/version-control.ts`, `src/project/file-snapshot.ts`, `src/commands/init.ts`, `src/commands/import.ts`, `src/commands/remove.ts`
- **decision_record:** `docs/architecture/decisions/0026-git-optional-dependency.md`

## Decision

Git is optional. Four rules govern every command's relationship to it:

1. **Hatch never creates a repository.** No command runs `git init`. Whether a project is under version control is the developer's decision, made outside Hatch.
2. **Version control is recognized only at the project root.** A project counts as version-controlled if and only if the project directory is itself a git repository root (`checkIsRepo(CheckRepoActions.IS_REPO_ROOT)`). A project directory that merely sits inside an enclosing repository's work tree counts as **not** version-controlled: Hatch does not commit into a repository whose root it does not own.
3. **Without version control, commands warn and skip the commit.** Every command completes its work normally in a project that is not a repository root, skipping only the commit. Absence of version control never causes a command to fail, refuse, or partially apply its effect. The warning is emitted **at command entry** — once the target project is resolved, before any mutation — on **every** invocation, never suppressed after a first occurrence and never conditional on the operation being destructive.
4. **The unchanged-on-failure guarantee is independent of git.** Every command restores content it placed or deleted from its own in-memory record of what it changed, never by relying on a version-control operation to recover it. `hatch import` tracks the files it wrote so it can remove them; `hatch remove` snapshots the files it is about to delete, as raw bytes keyed by project-relative path, so it can write them back.

Detection, the warning, and the commit live in one module (`src/project/version-control.ts`). Every command resolves it once at entry and commits through it; no command talks to git directly.

## Context

The CLI previously auto-initialized a repository inside `hatch import` whenever the target project was not already one, and `hatch remove` recovered from a mid-operation failure with `git reset --hard HEAD`. Neither behavior was recorded in a decision record, and both became untenable once project creation left the CLI ([0015-import-harness-selection-flag](0015-import-harness-selection-flag.md)): `hatch init` adopts a directory in place, so the CLI can no longer assume it owns that directory's version-control story.

Auto-init was also quietly wrong in the nested case. A project inside a monorepo would receive a *nested* `.git` of its own, created by Hatch, inside a repository the developer already had — a repository Hatch neither created nor owns.

The recovery asymmetry mattered more. `hatch import` already restored state from its own `writtenFiles` bookkeeping with no git involvement, while `hatch remove` deleted content first and leaned on `git reset --hard HEAD` to bring it back. Once a repository is no longer guaranteed, that recovery path exists only sometimes — and a guarantee that holds only sometimes is worse than one contract that always holds. `hatch remove`'s failure mode is manifest and disk diverging, which is precisely the state [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md)'s drift detection is built to distrust, so it fails quietly rather than loudly.

This record was settled with the developer as part of the `replace-new-with-init` change; its reasoning is recorded in that change's design notes.

## Alternatives Considered

- **Recognize an enclosing repository's work tree (`IS_INSIDE_WORK_TREE`) and commit into it.** Not chosen: Hatch would write commits into a repository whose root it does not own, mixing its changes with whatever unrelated edits happen to be staged there. A developer running `hatch import` in one package of a monorepo would get a commit spanning their own in-progress work.
- **Keep auto-initializing a repository when one is absent.** Not chosen: creating a repository is a project-lifecycle decision, not a skill-management one, and in the nested case it plants a `.git` inside an existing repository — the worst of the available outcomes.
- **Fail outright when the project is not a repository.** Not chosen: it would make git a hard prerequisite for managing skills, which nothing about the task actually requires, and would block adoption in any directory the developer has deliberately not put under version control.
- **Keep `git reset --hard HEAD` as a fallback when a repository happens to exist.** Not chosen: two recovery paths, one of which only sometimes exists, is harder to reason about and harder to test than a single path that always holds. It would also let the weaker path's bugs hide behind the stronger one.
- **Move the target tree aside to a temp directory instead of snapshotting it in memory, deleting on success and renaming back on failure.** Not chosen: cheaper for large trees (a rename, not a copy), but it leaves stray state on disk if the process is killed mid-operation, and introduces a directory every other Hatch command would need to know to ignore. In-memory has a bounded, self-cleaning failure mode.
- **Emit the missing-version-control warning at commit time rather than at command entry.** Not chosen: a command that fails before reaching its commit would then emit no warning at all — exactly the case where knowing there is no recovery point matters most.

## Trade-offs Accepted

- **Prompt coherence:** high — one rule ("is this directory a repository root?") answers version-control participation for every command. There is no per-command variation for an agent to learn.
- **Failure surface:** a destructive `hatch remove --force-all` in a project with no repository is unrecoverable once it succeeds, because the per-operation commit that would have been the undo does not exist. The always-on entry-time warning is the mitigation, and it is deliberately emitted before the operation rather than after. A project nested in a monorepo warns on every invocation about content that is in fact tracked — accepted noise, in exchange for never committing into a repository Hatch does not own.
- **Reversibility:** high — nothing here writes persistent state in a new format. No project on disk records which CLI version touched it, so a change of policy is a change of code only.
- **Operational simplicity:** high for detection and commits (five former call sites collapse to one module). `hatch remove`'s in-memory snapshot costs peak memory proportional to the size of what is being removed; the realistic worst case is `hatch remove --harness <name>` on a project with many groups, where skill content is text plus modest `references/`/`assets/` payloads.

## Consequences

- No command may call `git init`, directly or through a helper.
- Every project-scoped command must resolve version control once, at entry, after the target project is known and before any mutation — and must commit only through that resolved handle.
- A command that mutates the project must record what it changed in a form sufficient to undo it without git, and must undo it from that record on any failure.
- `hatch remove` holds deleted file contents as raw bytes, not decoded text, so non-text payloads under a skill's `references/` or `assets/` survive a restore byte-for-byte.
- Tests must construct their own git fixtures explicitly. A fixture that relied on a Hatch command to create its repository would silently start exercising the no-version-control path.
- [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md)'s description of the CLI's git behavior is governed by this record.

## Agent Rules

- MUST NOT initialize a git repository in a target project, from any command, under any circumstance.
- MUST treat a project as version-controlled if and only if the project directory is itself a git repository root, using `checkIsRepo(CheckRepoActions.IS_REPO_ROOT)`.
- MUST NOT commit into a repository whose root is not the project directory.
- MUST emit the missing-version-control warning at command entry, after the target project is resolved and before any mutation, on every invocation.
- MUST complete the command's work and skip only the commit when the project is not version-controlled, exiting as it would have with a repository present.
- MUST record every mutation in a form that allows the command to undo it itself, and MUST restore from that record on failure.
- MUST NOT use any version-control operation (`git reset`, `git checkout`, `git stash`, or equivalent) as a recovery mechanism.
- MUST route all version-control detection and commits through `src/project/version-control.ts` rather than calling `simple-git` from a command module.

## Invariants

None of this record's rules are irreversibility-bearing. Every rule governs in-process CLI behavior against a directory the developer already owns: nothing here publishes a name, fixes a schema, or writes persistent state that an external dependent could come to rely on. `hatch.manifest.json`'s schema is untouched by this record, so a project on disk carries no trace of which version-control policy created it, and reversing any rule here is a matter of shipping a new CLI version.

The one consequence worth naming — that a destructive removal in a project without a repository cannot be undone — is a risk borne by the developer at the moment they run the command, not a constraint that becomes permanent once external dependents exist. It is mitigated by the entry-time warning, not by an enforcement mechanism.

## Machine Check

- **context:** cli-repo

```bash
inits=$(grep -rn "\.init()" src/ --include=*.ts | grep -v "\.test\.ts")
if [ -n "$inits" ]; then echo "$inits"; exit 1; fi
consumers=$(grep -rl "simple-git" src/ --include=*.ts | grep -v "\.test\.ts")
[ "$consumers" = "src/project/version-control.ts" ] || { echo "unexpected simple-git consumers:"; echo "$consumers"; exit 1; }
resets=$(grep -rn "reset(\[" src/ --include=*.ts)
if [ -n "$resets" ]; then echo "$resets"; exit 1; fi
echo "no initialization, one git module, no recovery: correct"
```

Expected result: the confirmation line, exit 0 — no production module calls `init()`; `src/project/version-control.ts` is the only non-test module reaching git, so every other module reaches git only through it; and no command recovers via `git reset`. Any other output indicates this record isn't implemented as decided.

## Precedence

- Governs the version-control behavior described in [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md), whose Consequences section cross-references this record for the detail.
- Pairs with [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md): that record decides which command creates the manifest, this one decides what that command deliberately does not do.
- Constrains, without changing, [0022-remove-force-flags-not-prompt](0022-remove-force-flags-not-prompt.md) and [0023-remove-harness-drop-unconditional](0023-remove-harness-drop-unconditional.md) — the force flags and the unconditional harness drop keep their semantics, but their rollback is now the command's own snapshot rather than a git operation.
- Relates to [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md): a rollback that left manifest and disk diverging would surface later as spurious local-edit drift, which is why the restore is byte-for-byte.
- No known conflicting decision records.
