## 1. Registry access

- [x] 1.1 Add a root-listing call to `src/registry/fetch.ts` returning every top-level entry's name and type from one non-recursive Contents call, with a result shape distinguishing success, unreachable, and a root `404`; verify unit tests cover a populated root, an empty root, a network error, a non-200 status, and that a root `404` surfaces as its own reason rather than the shared `not-found` used for a named folder.
- [x] 1.2 Create `src/registry/description.ts` extracting a `description` from a `SKILL.md`'s leading `---` frontmatter block without a YAML dependency; verify unit tests cover a plain one-line scalar, a quoted value, a folded value spanning several lines terminated by the next key, a file with no frontmatter, frontmatter with no `description` key, an empty or whitespace-only value, and an unterminated fence — each of the unreadable cases yielding no description rather than raising.
- [x] 1.3 Parse `description` onto `GroupSkillJson` in `src/registry/group-resolve.ts` alongside `removed` and `testing`; verify unit tests assert it is read for a group, that an absent field reads as no description, that an empty or non-string value reads as no description, and that every existing `skill.json` parse test still passes unchanged.

## 2. `hatch list`

- [x] 2.1 Create `src/commands/list.ts` parsing an optional single filter argument and rejecting a second positional argument with usage output and a non-zero exit; verify tests cover no argument, one argument, and two arguments.
- [x] 2.2 Authenticate before reading the registry, reusing `hatch import`'s existing session resolution and inline prompt; verify tests assert a listing succeeds with a session already present, that authentication is attempted when none is, and that an invalid password aborts before any registry read.
- [x] 2.3 Resolve the test-project opt-in from the manifest of the directory the command runs in, treating a directory with no manifest as an ordinary project; verify tests cover an initialized ordinary project, a project recording `testProject: true`, and a directory with no manifest — the last asserting no missing-manifest error and no mention of `hatch init`.
- [x] 2.4 Fold the root listing into candidate names — dropping non-directory entries and any folder without a `skill.json`, collapsing `<base>-<code>` into `<base>` only when the plain `<base>` folder also exists, and leaving every other name literal; verify unit tests cover a family with a variant, a family with several variants, a lone suffix-shaped folder with no plain sibling, and a name ending in a reserved code that is an ordinary skill.
- [x] 2.5 Apply the name filter and the `_`-prefix testing exclusion to candidate names before any per-entry fetch; verify tests assert a case-insensitive substring match, that a filter matching a description but not a name yields nothing, that testing names are excluded for an ordinary project and retained for a test project, and — by counting fetches — that a filtered run fetches metadata only for surviving candidates.
- [x] 2.6 Fetch each surviving candidate's `skill.json` through a bounded concurrency pool, classifying kind from `members`, reading `version`, and dropping entries declaring `removed: true` or `testing: true` in an ordinary project; verify tests cover a plain skill, a group, a removed entry omitted even when named exactly by the filter, and an unprefixed folder declaring `"testing": true` excluded from an ordinary project's listing.
- [x] 2.7 Fetch `SKILL.md` for each surviving plain skill and take its description from the frontmatter, taking a group's from its `skill.json`; verify tests assert a skill's description comes from frontmatter and never from `skill.json`, that a group's comes from `skill.json` and contains no member's description, and that a group's `SKILL.md` is never fetched.
- [x] 2.8 Render the listing sorted ascending by name, one entry per line showing name, kind, version and description, with an absent description shown as absent; verify tests assert alphabetical ordering independent of the registry's own return order, the four fields per row, and a readable row for an entry with no description.
- [x] 2.9 Report an empty result — an empty registry, or a filter matching nothing — with an explicit no-matches message and a zero exit; verify tests assert the exit code and that the wording for a filter matching a hidden testing skill is identical to one matching nothing at all.
- [x] 2.10 Handle registry failures: an unreachable registry and a root `404` each abort with a distinct message and a non-zero exit printing no entries, while a per-entry read failure prints every readable entry, names the unreadable ones, and exits non-zero; verify tests cover all three, asserting the root-`404` message reports a credential problem and never describes the result as a name that was not found.
- [x] 2.11 Verify `hatch list` writes nothing, by asserting in a test against an initialized, version-controlled project that no file changed and no commit was created.
- [x] 2.12 Wire `list` into `src/index.ts` and add it to the implemented-commands line in `README.md`; verify the built CLI runs `hatch list` and that an unknown-command error is no longer produced for it.

## 3. Existing behavior unaffected

- [x] 3.1 Verify `hatch import`'s not-found wording is unchanged, by asserting its existing tests for a missing name, a missing pinned ref, and a testing-skill refusal all still pass byte-identically.
- [x] 3.2 Verify a removed entry's treatment elsewhere is unaffected, by asserting `hatch import` still warns for a manifest-recorded removed entry and still refuses a first-time import of one.

## 4. Registry content (`hatch-skills` PR 1)

- [x] 4.1 Add a non-empty `description` to every group folder's `skill.json`, each with the PATCH `version` bump the blocking `version-check` job requires; verify the job passes on the PR and that no group was missed, by listing every top-level folder whose `skill.json` carries a `members` array against the diff.
- [x] 4.2 Add a `description` to the frontmatter of any plain skill folder's `SKILL.md` that lacks one, with the same PATCH bump; verify by listing every top-level plain-skill folder and confirming each `SKILL.md` frontmatter carries a non-empty `description`.
- [x] 4.3 Verify the newly published `<name>@<version>` tags are additive, by confirming the tags the pin fixtures depend on still resolve after merge.

## 5. Registry enforcement (`hatch-skills` PR 2)

- [x] 5.1 Add a content check requiring a non-empty string `description` on every group folder's `skill.json`, evaluated across the whole registry rather than only the diff; verify it exits non-zero for an omitted field, an empty string and a non-string value, and zero against the registry's real state once task 4.1 has landed.
- [x] 5.2 Extend the same check to require a non-empty `description` in every plain skill folder's `SKILL.md` frontmatter; verify it exits non-zero for a folder missing the key and zero against the registry's real state once task 4.2 has landed.
- [ ] 5.3 Wire the check into `.github/workflows/ci.yml` as a blocking job and add it to `main`'s required status checks; verify via `gh api repos/AI-Wise-IT/hatch-skills/branches/main/protection` that the new context is listed.
- [x] 5.4 Document the group `description` field and the skill frontmatter requirement in the registry `README.md`; verify every rule the check now enforces is described, with no rule enforced but undocumented.

## 6. Architecture decisions and documentation

- [x] 6.1 Write the discovery-mechanism ADR via the `write-architecture-decision` skill, recording the live walk over a CI-maintained index (with the index named as the escape hatch), the per-kind description sourcing and the new group `description` field, the fold-only-when-the-plain-folder-exists rule, and the root-`404`-is-a-credential-failure reading; verify the decisions index lists it and its Machine Check runs as written.
- [x] 6.2 Write `docs/use-cases/discover-registry-content.md` as UC-6, covering the main flow and the alternative flows for a filter matching nothing, an empty registry, an unreachable registry, credentials without registry access, and a partially readable registry; verify its business rules match the delta spec's requirements with no rule stated in one and absent from the other.
- [x] 6.3 Note in UC-3 (`docs/use-cases/import-content.md`) that the target name can be discovered via UC-6, since its preconditions currently assume the caller already knows it; verify no other UC-3 behavior statement changed.
- [x] 6.4 Nothing is written back into `intake/`. The `intake/backlog-*` records are deprecated in favour of unfinished OpenSpec proposals and are being deleted, so there is no record to mark picked up; and `intake/mvp-scope.md` is a point-in-time scoping record that a later re-scope never rewrites (`intake/rescope-0001-standalone-version-pinning.md` is the precedent — it records a scope change as a new record and leaves `mvp-scope.md` unedited). This change is itself the record that the deferred "Nice — list/browse" item was taken up.

## 7. Verification

- [x] 7.1 Run lint, typecheck, the full test suite and the build; verify all pass with no skipped tests among those touched.
- [x] 7.2 Run a manual acceptance-test walkthrough (`cli-acceptance-testing`) against the built CLI: a bare `hatch list`, a filter narrowing to one name, a filter matching nothing, `hatch list` from a directory with no manifest, a run in a `--test-project` project showing fixtures, the same run in an ordinary project not showing them, and a run with credentials lacking registry access; verify every effect by direct observation before opening the PR.
- [x] 7.3 Verify the command solves the failure that prompted it, by confirming `hatch list prd-elicit` returns `prd-elicitation` against the real registry — the exact name the cloud agent guessed wrong.
- [ ] 7.4 Update `hatch-usage/SKILL.md` in `hatch-skills` to direct agents to `hatch list` in place of the current instruction that no discovery mechanism exists, once a released CLI carries the command; verify the skill no longer describes the gap anywhere and that its guidance names the released version the command first shipped in.
