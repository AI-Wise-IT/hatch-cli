## 1. Constraint grammar

- [x] 1.1 Add a version-constraint parser to `src/registry/semver.ts` that classifies a string as an exact version (`X.Y.Z`), a caret constraint (`^X.Y.Z`), or invalid, and verify `src/registry/semver.test.ts` covers `1.2.0`, `^1.2.0`, `^10.0.0`, and the rejected forms `1`, `1.0`, `^1`, `^1.2`, `~1.2.0`, `1.x`, `v1.2.0`, and the empty string
- [x] 1.2 Apply the parser in `parseMemberSpec` in `src/registry/group-resolve.ts` so a pointer's `version` is classified at parse time and an unrecognized value raises `invalid-members` naming the group and the entry index, and verify `group-resolve.test.ts` asserts the message and that no fetch is attempted
- [x] 1.3 Reject a version constraint declared on a `nested` member with the same `invalid-members` error, and verify a test covers it
- [x] 1.4 Confirm existing published group manifests still parse unchanged by running `npm test` and checking the fixture-backed group tests pass

## 2. Version discovery

- [x] 2.1 Add a prefix-matching tag query to `src/registry/fetch.ts` that returns every published version for one skill name, and verify `fetch.test.ts` covers a name with several versions, a name with none, and an unreachable registry
- [x] 2.2 Memoize the query per name for the duration of one resolution run so a name reached by several pointer paths triggers one request, and verify a test asserts the call count
- [x] 2.3 Verify the query tolerates a paginated response and returns the complete set, covered by a test with a response exceeding one page

## 3. Resolution and reconciliation

- [x] 3.1 Resolve a caret constraint to the highest published version sharing its MAJOR and not below its floor, and verify tests cover `1.0.0`/`1.1.0`/`1.1.4` under `^1.0.0` resolving to `1.1.4`, and `1.4.0`/`2.0.0` under `^1.0.0` resolving to `1.4.0`
- [x] 3.2 Abort with a clear message when a caret constraint matches no published version — no version in that MAJOR at all, or none at or above the floor — and verify tests cover both cases and assert the message names the member and the constraint
- [x] 3.3 Reduce every constraint on a name to a concrete version before the existing reconciliation pass runs, leaving unconstrained paths absent from the set, and verify existing exact-pin reconciliation tests still pass unchanged
- [x] 3.4 Verify mixed-constraint reconciliation through tests: constrained plus unconstrained resolves to the constraint with no warning; a caret constraint and an exact pin inside one MAJOR resolve to the highest with a warning naming both; constraints across different MAJORs abort with nothing placed
- [x] 3.5 Verify a group-to-group pointer path carrying a caret constraint resolves correctly at depth, covered by a nested-group test

## 4. Import surface

- [x] 4.1 Surface the new abort and warning text through `src/commands/import.ts` so the resolved version and any conflicting constraints appear in the import summary, and verify the command-level test asserts the output
- [x] 4.2 Verify an aborted resolution leaves the target project untouched — no content placed, no manifest write, no commit — covered by an integration test
- [x] 4.3 Verify a group's caret constraint is resolved fresh on re-import and is never written to the project manifest as a sticky pin, covered by a re-import test

## 5. Decisions and documentation

- [x] 5.1 Write the ADR recording the extended pointer semantics via `capture-adrs`, marking ADR-0016 superseded, and verify the decisions index and 0016's metadata are updated consistently
- [x] 5.2 Update `docs/use-cases/import-content.md` — AF-9 and the pinned-pointer business rules — to state all three constraint forms and the reconciliation outcomes, and verify the file no longer describes `version` present as meaning an exact pin
- [x] 5.3 Correct AF-12's claim that an unpinned standalone import resolves to "latest compatible version, same MAJOR", which the code does not do on a first import, and verify the corrected text matches `isNewerCompatible`'s actual gate against the manifest's recorded version
- [x] 5.4 Run the repository's own decision-record checks and verify the new ADR's machine check passes

## 6. Release and registry adoption

- [x] 6.1 Run `npm run lint`, `npm run typecheck` and `npm test` and verify all three pass clean — repo content is clean on all three; `npm run lint` additionally reports stale local `.claude/worktrees/` copies, which are git-excluded and absent from CI
- [ ] 6.2 Release the CLI with constraint support before any registry content adopts it, and verify the published version resolves `^1.0.0` against the live registry
- [ ] 6.3 In `hatch-skills`, change the `prime-expert-context` pointer to a caret constraint in `gather-brand-material`, `gather-content-material` and `gather-legal-material`, bump each group's own version, and verify `hatch import gather-brand-material` places the expected `prime-expert-context` version in a scratch project
