## 1. Move the harness directory

- [x] 1.1 Change the `codex` entry's `skillsDir` in `src/harness-registry.json` to `.agents/skills`, leaving its `code` (`cdx`) untouched, and verify `src/harness-registry.test.ts` asserts the new value
- [x] 1.2 Update the 36 hardcoded `.codex` literals to `.agents` across `src/commands/import.test.ts` (13), `src/commands/remove.test.ts` (13), `src/commands/init.test.ts` (6), `src/project/file-snapshot.test.ts` (3), and verify `npm run test` passes with no `.codex` literal remaining except in the reclamation tests added in group 2
- [x] 1.3 Verify placement end to end: `npm run test` covers a project declaring `codex` placing under `.agents/skills/<name>/`, a two-harness project getting both copies, and a `-cdx` variant deploying under its plain name

## 2. Reclaim the legacy directory

- [x] 2.1 Add a field to `src/harness-registry.json` naming each harness's previously occupied directory, set to `.codex/skills` for `codex` and absent for the others, extend `HarnessDefinition` in `src/harness-registry.ts` to expose it as optional, and verify the registry test covers a harness with and without the field
- [x] 2.2 Implement the reclamation step in `src/commands/import.ts`: for each declared harness carrying a previous directory that exists, remove `<previousDir>/<name>` for every manifest-recorded entry, then remove the previous directory and its parent only when emptied — and verify a test asserts unrecorded content in that directory survives and keeps the parents in place
- [x] 2.3 Route the reclamation deletes through import's existing `createSnapshot`/`snapshotTree` bookkeeping inside the same `try`, and verify a test asserts a failing import restores the reclaimed content, leaves the manifest unchanged, and makes no commit
- [x] 2.4 Verify by test that reclamation covers manifest entries other than the import's named target, runs only for declared harnesses, is a no-op leaving no directory behind when the previous directory is absent, and lands in the import's single commit
- [x] 2.5 Report what was reclaimed in the import summary, and verify a test asserts the removed entries are named in the output

## 3. Carry content across to the new directory

- [x] 3.1 Implement the relocation pass in `src/commands/import.ts`: for each declared harness carrying a previous directory that exists, move `<previousDir>/<name>` to `<currentDir>/<name>` on disk for every manifest-recorded entry present in the previous directory and absent from the current one, leaving entries present in both for reclamation — and verify a test asserts the moved content is byte-for-byte what was there and the manifest's version, pin, and content hash are unchanged
- [x] 3.2 Run the relocation pass ahead of the staleness and local-edit checks so those checks read the directory the content actually lives in, and verify a test asserts an already-current entry sitting only in the previous directory is not reported as having local edits and reports the already-up-to-date outcome instead
- [x] 3.3 Verify by test that a locally edited entry is moved with its edit intact and is then reported as having local edits, and that an entry present in both directories is left untouched in the current one and removed from the previous one
- [x] 3.4 Route the relocation moves through the same `createSnapshot`/`snapshotTree` bookkeeping and the same `try` as reclamation, and verify a test asserts a failing import puts the moved content back in the previous directory, leaves the manifest unchanged, and makes no commit
- [x] 3.5 Commit and report on every path that would otherwise return having changed nothing — the pinned-entry path and both `already up to date` paths and `has local edits` among them: when relocation or reclamation did work, report it and make exactly one commit containing it. A path that writes the manifest and commits anyway, such as the pin-only path, reports the migration and lets it ride that commit — and verify a test asserts each such path commits once and that an import doing no migration on those paths still makes no commit
- [x] 3.6 Report what was moved in the import summary alongside what was reclaimed, and verify a test asserts the moved entries are named in the output

## 4. Decision records

- [x] 4.1 Write `docs/architecture/decisions/0033-<slug>.md` superseding ADR-0001 — restating the flat suffixed-folder convention, the prefer-suffixed-then-plain resolution order, the deploy-time suffix strip, and the reserved-set-only-grows invariant, with the placement example corrected — and adding that a harness's directory is registry data independent of its code, plus the shared-`.agents/skills` consequence and that moving a harness's directory carries the content already placed there across to the new one; verify `node scripts/adr/check.mjs --repo cli` reports it conforming
- [x] 4.2 Carry ADR-0001's machine check (the hardcoded-harness-codes grep) into the successor verbatim, and verify running the check's own script block exits 0 and that `scripts/adr/run.mjs` executes it under the successor's id rather than skipping it
- [x] 4.3 Set ADR-0001's `status` to `superseded` and add `superseded_by:` naming the successor, changing nothing else in the file, and verify `node scripts/adr/check-immutability.mjs --base main` passes
- [x] 4.4 Correct the `.codex` literal in `docs/architecture/decisions/0015-import-harness-selection-flag.md`'s Alternatives Considered section and verify the conformance check still passes
- [x] 4.5 Add the successor's row to `docs/architecture/decisions/README.md`'s index and flip ADR-0001's status cell to `superseded`, and verify the conformance check passes

## 5. Reviewer configuration

- [x] 5.1 Re-point the `adr-0001-harness-suffix-convention` rule in `.greptile/config.json` and the record path in `.greptile/files.json` at the successor's id, and verify `node scripts/adr/greptile-rule.mjs <successor-id>` resolves the delegation

## 6. Registry repository (`../hatch-skills`)

- [x] 6.1 Correct `.codex/skills/<name>/` to `.agents/skills/<name>/` in `hatch-usage/SKILL.md`'s "Where skill content lives" section, and verify no `.codex` literal remains anywhere in the repository
- [x] 6.2 Bump `hatch-usage/skill.json` from `1.3.0` to `1.3.1` and verify that repository's CI version-bump check passes on the pull request

## 7. Verification

- [x] 7.1 Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` and verify all four pass
- [x] 7.2 Verify the CI collision-check job runs (its path filter matches the changed `src/harness-registry.json`) and passes against the live `hatch-skills` checkout
- [x] 7.3 Acceptance-test by hand against a scratch project: initialize declaring `codex`, confirm placement under `.agents/skills/`, seed a `.codex/skills/` copy plus one unrecorded folder, run an import, and confirm the recorded copies are reclaimed, the unrecorded folder and its parents survive, and the whole thing is one commit
- [x] 7.4 Acceptance-test the migration by hand: in a scratch project declaring `codex`, move a recorded skill's content back to `.codex/skills/<name>/`, run `hatch import <name>` for that already-current entry, and confirm it is not reported as having local edits, its content is back under `.agents/skills/<name>/` unchanged, `.codex/` is gone, the summary names what moved, and exactly one commit was made
- [x] 7.5 Verify `openspec validate move-codex-skills-directory --strict` passes before archiving
