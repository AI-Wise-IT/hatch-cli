## Why

Hatch places Codex content under `.codex/skills/`. Codex does find skills there, but its default location is `.agents/skills/` — which is also where other tooling in use alongside Hatch (OpenSpec's own skills, for one) already puts them. The practical cost is that a project's skills are split across two directories, so a workflow combining Hatch skills with skills from another source cannot see both in one place.

Nothing about the harness-suffix convention is wrong; only the destination directory the `codex` harness maps to. Hatch is still in its testing phase, with a small number of projects initialized against `.codex/skills/`, so the migration cost is at its lowest it will ever be.

## What Changes

- The `codex` harness's `skillsDir` becomes `.agents/skills`. Its harness name (`codex`) and reserved suffix code (`cdx`) are unchanged, so every `-cdx` registry folder resolves exactly as before.
- `hatch import` migrates the legacy directory for a project that declares `codex` and still has a `.codex/skills/` directory. Anything Hatch recorded that sits only in the old location is moved into `.agents/skills/`; anything already present in both is removed from the old one; and `.codex/skills/` and `.codex/` are dropped when left empty. Without the move, an existing project's skills would sit where Codex no longer looks; without the removal, it would keep a permanently stale second copy of every skill that Codex would still discover.
- The harness-to-directory mapping, the migration, and the reclamation behaviour are recorded as a spec capability. Neither `hatch import` nor `hatch remove` has one today, so placement behaviour currently lives only in the code.
- [ADR-0001](../../../docs/architecture/decisions/0001-harness-suffix-convention.md) is superseded by a new record. Its `## Decision` names `.codex/skills/` and is frozen, so the successor restates the full mechanism — suffix convention, resolution order, deploy-time suffix strip — and carries forward its machine check.
- The `hatch-usage` skill in the `hatch-skills` registry names the old path and is corrected there.

**Not breaking for registry content**: no skill folder is renamed, no reserved code changes, and no manifest field changes. It is a change to where content lands in a project, which the reclamation step handles.

## Capabilities

### New Capabilities

- `harness-placement`: which directory each declared harness's content is placed in, that the harness name and its reserved suffix code are independent of that directory, and how a harness whose directory has moved carries its content across to the new one and reclaims the one it used to occupy.

### Modified Capabilities

None. `project-initialization` states placement in terms of "the harness's skill directory" without naming one, so its requirements are unaffected by which directory that is. `decision-record-convention` and `continuous-code-review` are exercised by this change rather than altered — superseding a record and re-binding its reviewer rule are what those specs already require.

## Impact

**hatch-cli — code**
- `src/harness-registry.json`: the `codex` entry's `skillsDir` value. This is the whole of the production behaviour change; every consumer reads `getHarnessDefinition(...).skillsDir` rather than a literal.
- `src/commands/import.ts`: the relocation step ahead of the staleness and local-edit checks, the reclamation step after placement, and commit-and-report on the paths that previously returned early having changed nothing. Both steps are covered by the existing snapshot/rollback bookkeeping and included in the import's single commit.
- Tests: 36 hardcoded `.codex` literals across `import.test.ts` (13), `remove.test.ts` (13), `init.test.ts` (6), `file-snapshot.test.ts` (3), `harness-registry.test.ts` (1), plus new coverage for reclamation.

**hatch-cli — records and configuration**
- A new decision record superseding ADR-0001; ADR-0001 gains `status: superseded` and `superseded_by:`, with its frozen sections untouched.
- `.greptile/config.json` and `.greptile/files.json`: the rule bound to `adr-0001-harness-suffix-convention` re-points at the successor, since a superseded record's delegation is skipped.
- `docs/architecture/decisions/README.md`: index row for the new record, and ADR-0001's status cell.
- `docs/architecture/decisions/0015-import-harness-selection-flag.md`: a `.codex` literal in its Alternatives Considered section.

**hatch-skills (sibling repository)**
- `hatch-usage/SKILL.md` names `.codex/skills/<name>/`; correcting it requires the `skill.json` patch bump its CI enforces.

**CI**
- The collision-check job's path filter matches `src/harness-registry.json`, so it will clone `hatch-skills` and run. Its predicate is destination-*name* based and path-independent, so it is expected to pass unchanged.

**Accepted consequence**
- `.agents/skills/` is shared ground rather than Codex-private. Import's destination-occupied handling already covers a name it did not place, but a conflict with non-Hatch tooling moves from rare to routine, and the registry-side collision check cannot see names claimed by other tools.
