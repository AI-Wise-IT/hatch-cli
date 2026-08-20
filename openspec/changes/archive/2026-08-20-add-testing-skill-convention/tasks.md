## 1. CLI: classification and manifest opt-in

- [x] 1.1 Create `src/registry/testing-skill.ts` exposing an I/O-free predicate over a top-level registry name, a declaration check over a parsed `skill.json`, and a shared refusal message; verify unit tests cover a `_`-prefixed name, an ordinary name, a harness-suffixed testing name (`_harness-suffix-fixture-cld`), a `"testing": true` declaration on an unprefixed name, and that an absent or non-boolean `testing` field reads as ordinary content rather than raising.
- [x] 1.2 Parse `testing` in `src/registry/group-resolve.ts`'s `GroupSkillJson` alongside `removed`; verify a unit test asserts it is read for a plain skill and a group, and that a `skill.json` without the field parses unchanged.
- [x] 1.3 Add the v3 → v4 identity migration and bump `CURRENT_SCHEMA_VERSION` to 4 in `src/manifest-migrations/index.ts`; verify the existing chain tests still pass and a new test asserts a v3 manifest migrates to v4 with every recorded skill, version, pin, harness and `contentHash` value byte-identical.
- [x] 1.4 Add a `testProject` reader used by every command that needs the gate, resolving through `migrateManifest`; verify unit tests assert `true` only for an explicit `testProject: true`, and ordinary-project treatment for absent, `false`, and non-boolean values.
- [x] 1.5 Add `--test-project` to `hatch init`, writing `testProject: true` into the manifest it creates; verify tests assert the field is present with the flag, absent without it, and that the flag changes nothing else about initialization (harness recording, skill placement, commit behavior).
- [x] 1.6 Warn, without changing the exit code, when `--test-project` is given for an already-initialized project that does not already record the opt-in; verify tests cover the no-op branch, the undeclared-harness branch, an already-opted-in project (no warning), and an invocation without the flag (no warning), each asserting the manifest is byte-identical.

## 2. CLI: import refusals

- [x] 2.1 Fail a testing-skill primary target in an ordinary project after `authenticate()`, at the point resolution reports a missing name, reusing the shared not-found helpers; verify a test asserts the message is byte-identical (but for the name) to the one a nonexistent name produces, plus a non-zero exit, an unchanged manifest, no placed content, and no commit.
- [x] 2.2 Verify a test asserts the failure message says nothing about testing content in any wording, and never mentions `testProject` or `--test-project`; and that a separate test asserts authentication happened before the failure.
- [x] 2.3 Fail a fetched target declaring `"testing": true` whatever its name, at the classify fetch, with the same not-found message and the same atomic guarantees; verify a test asserts it for an unprefixed name whose fetched `skill.json` declares it, and that a fetched `skill.json` with no `testing` field imports normally rather than erroring.
- [x] 2.4 Allow the same import in a project recording `testProject: true`; verify a test asserts the import completes with normal placement, manifest recording, version resolution and commit behavior — including the pinned form `_reimport-fixture@1.0.0`.
- [x] 2.5 Fail a pointer member that names or resolves to testing content as an ordinary missing pointer target, reusing the existing atomic abort path; verify tests cover both markers, assert the message matches a dangling pointer's and mentions nothing about testing, and assert nothing is placed, the manifest is unchanged, no commit is made, and the exit is non-zero.
- [x] 2.6 Verify a test asserts the same group imports normally in a `testProject: true` project, with every member placed.
- [x] 2.7 Verify `--add-harness` and `hatch remove` are unaffected for a testing skill already recorded in a test project's manifest, by asserting a backfill and a removal each behave exactly as for ordinary content.
- [x] 2.8 Verify `check-collisions` needs no change, by asserting the collision check still reports a collision between a testing-skill source and another source in a fixture registry tree.

## 3. Registry: declare every folder (`hatch-skills` PR 1)

- [x] 3.1 Add `"testing": true` to the `skill.json` of all twelve `_`-prefixed folders and `"testing": false` to `hatch-usage`, `prd-elicitation` and `architecture-decisions`, each with a PATCH `version` bump; verify the blocking `version-check` job passes on the PR and that no folder was missed, by listing every top-level directory containing a `skill.json` against the diff.
- [ ] 3.2 Verify the newly published `<name>@<version>` tags are additive, by confirming the tags the pin fixtures depend on (`_group-fixture-versioned` v1.0.0/v2.0.0, `_reimport-fixture` v1.0.0/v1.1.0, `_harness-suffix-fixture-cld`) still resolve after merge.

## 4. Registry: enforcement (`hatch-skills` PR 2)

- [x] 4.1 Exempt marked folders from `scripts/check-name-permanence.mjs`, reading a deleted folder's classification from its state at the base commit; verify by running the script by hand against a synthetic repository for both a marked and an unmarked deletion.
- [x] 4.2 Add the reclassification rule to the same script — a top-level folder that existed at the base commit may not flip its declaration from `false` to `true` — gated on the same `NAME_PERMANENCE_ENFORCEMENT` mode as the permanence rule itself; verify a synthetic case exits non-zero in block mode and warns in warn mode.
- [x] 4.3 Add a declaration check requiring a boolean `testing` on every top-level folder's `skill.json`, evaluated across the whole registry rather than only the diff; verify it exits non-zero for an omitted field, for a non-boolean value, and for a newly added folder that omits it, and exits zero against the registry's real state once task 3.1 has landed.
- [x] 4.4 Extend the same check to reject disagreeing markers — a `_`-prefixed folder declaring `false`, and a non-prefixed folder declaring `true`; verify it exits non-zero for each direction and zero against the registry's real state.
- [x] 4.5 Add the group-membership check rejecting a non-testing group that lists a testing skill as a nested or pointer member; verify it exits non-zero for a synthetic offending group, and zero against the registry's real state — including `_group-fixture-combo`, a testing group that legitimately points at the real `prd-elicitation`.
- [x] 4.6 Write `node --test` coverage for `check-name-permanence.mjs` against throwaway git repositories in a temp directory; verify three cases assert real exit codes — unmarked deletion blocks in block mode, marked deletion passes in block mode, unmarked deletion warns and exits zero in warn mode.
- [ ] 4.7 Wire the new checks and the script test into `.github/workflows/ci.yml` as blocking jobs, and add them to `main`'s required status checks; verify via `gh api repos/AI-Wise-IT/hatch-skills/branches/main/protection` that the new contexts are listed, and confirm the permanence job's own mode is still `warn` — this change must not perform the hardening cutover.

## 5. Registry: cleanup and documentation (`hatch-skills` PR 3)

- [x] 5.1 Delete `_registry-integrity-fixture/`; verify the name-permanence job reports no violation and the PR merges through ordinary review, which is itself the end-to-end proof of the exemption.
- [x] 5.2 Document the convention in the registry `README.md` — the mandatory `testing` declaration on every folder, the dual marker, the reserved `_` prefix, the permanence exemption, non-importability, and that testing skills are still collision-checked and still version-bumped; verify the README describes each rule the CI now enforces, with no rule enforced but undocumented, and that its authoring guidance shows `"testing": false` in the shape a new real skill's `skill.json` is expected to take.

## 6. Architecture decisions

- [x] 6.1 Write the new testing-skill-convention ADR via the `write-architecture-decision` skill, recording the mandatory declaration on every folder, the dual marker, the exemption, non-importability with the manifest opt-in, the CLI's tolerance of pre-convention versions, and — explicitly — that the declaration, consistency and group-membership checks are blocking from day one while the reclassification rule follows the permanence mode; verify the decisions index lists it and its Machine Check runs as written.
- [x] 6.2 Fold the exemption into [ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) — its Decision, Agent Rules, both Invariants and its Machine Check all currently state the rule without exception; verify the Machine Check's command reflects the exemption and returns the expected result against the registry's real history.
- [x] 6.3 Record the v4 entry in [ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md)'s chain; verify the ADR's description of the current schema version matches `CURRENT_SCHEMA_VERSION`.

## 7. Verification

- [x] 7.1 Run lint, typecheck, the full test suite and the build in `hatch-cli`; verify all pass with no skipped tests among those touched.
- [ ] 7.2 Run a manual acceptance-test walkthrough (`cli-acceptance-testing`) against the built CLI: refusing `hatch import _reimport-fixture` in an ordinary project with no credentials present, the same import succeeding in a `--test-project` project, a group refusal, an ordinary import unaffected, and a pinned import of a version published before the declaration existed; verify every effect by direct observation before opening the PR.
- [x] 7.3 Verify the un-advertised surface stays un-advertised, by confirming `--test-project` and `testProject` appear nowhere in `README.md` or in any command's usage output, while remaining documented in the spec and ADR.

## Open items and why they are still open

The three unchecked tasks above each need something outside this session's reach:

- **3.2** verifies tag behavior *after merge*. The six tags the pin fixtures depend on were confirmed to resolve, and nothing in the change deletes or moves a tag, but the new `<name>@<version>` tags are only created when `tag-versions` runs on merge to `main`.
- **4.7** is half done: both jobs are wired into `.github/workflows/ci.yml` and verified green locally. Adding them to `main`'s required status checks is a branch-protection change the developer makes deliberately.
- **7.2** is a manual walkthrough in the developer's own terminal, against real registry credentials, and the declaration-backstop step needs PR 1 merged first.
