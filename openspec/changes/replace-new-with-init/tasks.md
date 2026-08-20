## 1. Version-control gate and test-fixture groundwork

- [x] 1.1 Create `src/project/version-control.ts` exposing the repo-root check, a commit-if-version-controlled helper, and the missing-version-control warning; verify unit tests cover all three detection cases from the spec — project is a repo root, project inside an enclosing repo's work tree, no repo at or above the project.
- [x] 1.2 Audit every existing fixture in `src/commands/import.test.ts` and `src/commands/remove.test.ts` for reliance on `hatch import`'s auto-init to create its git repository; verify by producing the list of affected fixtures before any behavior changes — this must precede tasks 3.2 and 4.x so no assertion silently starts exercising the non-git path.
- [x] 1.3 Update every fixture identified in 1.2 to initialize git explicitly in setup; verify the full suite still passes and that each "exactly one commit" assertion is running against a project that is a git repository root.

## 2. `hatch init`

- [x] 2.1 Create `src/commands/init.ts` from `src/commands/new.ts` with the target-directory creation and `git.init()` removed, retaining harness validation, authentication, registry fetch, per-harness placement and manifest write; verify a test asserts the manifest and self-documentation skill appear for a single declared harness in an existing directory.
- [x] 2.2 Reject a non-existent target directory instead of creating it; verify a test asserts the "target project does not exist" error, non-zero exit, and that no directory was created.
- [x] 2.3 Require and validate `--harness` before authentication; verify tests cover the omitted flag, an unrecognized harness, and that an unrecognized harness is reported without any credential prompt or registry request.
- [x] 2.4 Place the self-documentation skill for every declared harness with no opt-out path; verify tests assert identical content under two harnesses, a single manifest entry recording its version, and that a skip-style argument is rejected as unrecognized.
- [x] 2.5 Implement atomic failure: on any failure remove all placed content and leave no manifest; verify tests cover registry-unreachable, authentication failure, and a failure partway through placing into the second of two harnesses.
- [x] 2.6 Implement already-initialized handling — report and exit `0` when every requested harness is already declared, exit non-zero naming `hatch import --add-harness` when the request names an undeclared harness; verify tests assert an unchanged manifest, no registry fetch, and the correct exit code in both cases.
- [x] 2.7 Route `hatch init`'s commit through the gate from 1.1; verify tests assert exactly one commit containing both manifest and placed skill in a git project, and successful completion with no commit attempt in a non-git project.
- [x] 2.8 Register `init` in `src/index.ts`, remove the `new` branch, and delete `src/commands/new.ts` and `src/commands/new.test.ts`; verify `hatch new` reports an unknown command, `hatch init` runs, and no source file references `commands/new.js`.

## 3. `hatch import` — drop manifest bootstrap and git auto-init

- [x] 3.1 Remove `--harness` from argument parsing and delete the manifest-bootstrap branch; verify tests assert `--harness` is rejected as unrecognized and that importing into a project with no manifest fails naming `hatch init`, changing nothing and fetching nothing.
- [x] 3.2 Update the `--add-harness` no-manifest error to name `hatch init` as the remedy; verify a test asserts the new message and a non-zero exit.
- [x] 3.3 Remove git auto-init at both call sites; verify a test asserts no `.git` directory is created when importing into an initialized non-git project, and that the content and manifest are still written.
- [x] 3.4 Route all three commit sites through the gate from 1.1; verify tests assert exactly one commit per import in a git project and a clean exit-`0` import with no commit attempt in a non-git project.

## 4. `hatch remove` — git-independent rollback

- [x] 4.1 Snapshot every target file's contents in memory, keyed by project-relative path, before any deletion; verify a unit test asserts the snapshot captures nested `references/`/`assets/` content, including non-text files, for a group member.
- [x] 4.2 Replace the `git reset --hard HEAD` recovery with restore-from-snapshot and delete the git-based path entirely; verify a test asserts that a failure partway through removal in a **non-git** project restores every deleted file byte-for-byte and leaves the manifest byte-identical.
- [x] 4.3 Verify the same mid-failure guarantee holds in a **git** project — every file restored, manifest byte-identical, and no new commit created.
- [x] 4.4 Route both commit sites through the gate from 1.1; verify tests assert exactly one commit per removal in a git project, and a clean exit-`0` removal with no commit attempt in a non-git project.
- [x] 4.5 Verify a test asserts the missing-version-control warning is emitted before a `--force-all` removal proceeds in a non-git project.

## 5. Cross-cutting verification

- [x] 5.1 Verify the warning is emitted at command entry rather than at commit time, by asserting it appears on a command that fails before reaching its commit.
- [x] 5.2 Verify the warning is emitted on every invocation, by asserting two successive imports in a non-git project each produce it, and that its presence does not change a successful command's exit code.
- [x] 5.3 Run lint, typecheck, the full test suite, and the build; verify all pass with no skipped or silently-passing tests among those touched by 1.2.
- [x] 5.4 Run a manual acceptance-test walkthrough (`cli-acceptance-testing`) against the built CLI covering `init` main flow, re-init both ways, import and remove in both a git and a non-git project, and a deliberate mid-operation failure in a non-git project; verify every effect by direct observation before opening the PR.

## 6. Architecture decisions and documentation

- [x] 6.1 Edit [ADR-0015](../../../docs/architecture/decisions/0015-import-harness-selection-flag.md) in place so `hatch init` owns manifest bootstrap, recording in Alternatives considered that `--harness`-on-import was the prior answer and why it was reversed; verify its Machine Check no longer references `src/commands/new.ts` and is runnable as written.
- [x] 6.2 Write a new ADR for git as an optional dependency — never initializing a repository, repo-root-only recognition, warn-and-skip, and rollback independent of git — via the `write-architecture-decision` skill; verify the decisions index lists it and its Machine Check passes against the built code.
- [x] 6.3 Correct [ADR-0002](../../../docs/architecture/decisions/0002-cli-runtime-nodejs.md)'s git claims ("auto-init if missing, exactly one commit per operation, and rollback-to-last-commit on partial failure"), all three of which are now wrong; verify no remaining sentence describes behavior the CLI no longer has.
- [x] 6.4 Update incidental `hatch new` references in ADRs [0001](../../../docs/architecture/decisions/0001-harness-suffix-convention.md), [0003](../../../docs/architecture/decisions/0003-registry-github-tarball-fetch.md), [0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md), [0017](../../../docs/architecture/decisions/0017-manifest-schema-v2-group-membership.md); verify a repo-wide search for `hatch new` returns only intentional historical references in `docs/build-plan.md`.
- [x] 6.5 Update `README.md`'s implemented-command list and `docs/use-cases/bootstrap-new-project.md` to describe `hatch init`; verify neither documents a command that no longer exists.

## 7. Cross-repo: registry self-documentation

- [x] 7.1 Update `hatch-usage/SKILL.md` in `AI-Wise-IT/hatch-skills` — replace the `new` entry with `init`, correct `import`'s `--harness` rule, and describe the git-optional behavior — with a `skill.json` version bump; verify the blocking `version-check` status check passes on the PR.
- [x] 7.2 Merge the `hatch-skills` PR only after the CLI change has landed and been released; verify a fresh `hatch init` in a scratch project places a self-documentation skill whose command list matches the shipped CLI.
