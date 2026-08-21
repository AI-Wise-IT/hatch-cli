## 1. Audit Preparation

- [x] 1.1 Audit the current registry entries: `architecture-decisions`, `hatch-usage`, `prd-elicitation`, `_collision-check-fixture-a`, `_collision-check-fixture-b`, `_group-fixture-combo`, `_group-fixture-conflict-cross-major`, `_group-fixture-conflict-same-major`, `_group-fixture-sub`, `_group-fixture-versioned`, `_harness-suffix-fixture`, `_harness-suffix-fixture-cld`, `_reimport-fixture`, and `_removed-fixture`.
- [x] 1.2 For each real entry, inspect `SKILL.md`, `skill.json`, nested members, group pointers, descriptions, README references, and any Hatch CLI docs/tests that name it; classify it as keep, rename, or remove for launch.
- [x] 1.3 For each testing entry, verify it still exercises a needed CLI behavior and classify it as fixture-only, rename, or remove.
- [x] 1.4 Record the architecture cleanup decision: `write-architecture-decision` -> standalone `capture-adrs`, `design-architecture-decision` -> nested `architecture-elicitation`, and `architecture-decisions` remains the group bundle.
- [x] 1.5 Record the `prd-elicitation` flow-feedback items as skill-content work, not spec requirements.

## 2. Cleanup PRs

- [x] 2.1 Move `architecture-decisions/write-architecture-decision/` to top-level `capture-adrs/`, update its `SKILL.md` frontmatter `name`, headings, references, template asset paths, and any docs/tests that name the old skill.
- [x] 2.2 Rename `architecture-decisions/design-architecture-decision/` to nested `architecture-decisions/architecture-elicitation/`, update its `SKILL.md` frontmatter `name`, headings, references, and handoff instructions so it invokes `capture-adrs`.
- [x] 2.3 Convert `architecture-decisions/skill.json` to keep a nested `architecture-elicitation` member and add a pointer member for `capture-adrs`, and update the group description to describe the bundle.
- [x] 2.4 Revise `prd-elicitation/SKILL.md` according to the recorded flow feedback, preserving its responsibility boundary: functional requirements and handoff notes, not sequencing or architecture decisions.
- [x] 2.5 Rename any other real skill/group whose launch name should change, updating folder names, frontmatter `name`, group pointer references, README/docs references, tests, and any Hatch CLI fixture expectations that name it.
- [x] 2.6 Remove any real skill/group that should not launch, using git deletion only during the audit window and documenting why no `removed` tombstone is needed pre-launch.
- [x] 2.7 Remove or rename obsolete testing fixtures, preserving only fixtures that still prove a current Hatch behavior.
- [x] 2.8 For every surviving edited folder, bump `skill.json.version` according to the existing version-bump check.
- [x] 2.9 Run `node scripts/check-testing-declarations.mjs .`, `node scripts/check-descriptions.mjs .`, `node --test "scripts/*.test.mjs"`, and the CI collision check path; verify they pass.
- [x] 2.10 Run the name-permanence check and confirm it passes after cleanup hardening.

## 3. Hatch CLI / Documentation Follow-Through

- [x] 3.1 Search the Hatch CLI repository for old names and update docs, tests, OpenSpec references, and skill guidance that should follow a rename, including `write-architecture-decision`, `design-architecture-decision`, `capture-adrs`, `architecture-elicitation`, and `architecture-decisions`.
- [x] 3.2 If `hatch-usage` is renamed or removed, update any bootstrap/import guidance that expects that skill name.
- [x] 3.3 Run the Hatch CLI test suite paths affected by renamed registry content.

## 4. Re-Hardening

- [x] 4.1 Flip `.github/workflows/ci.yml` in `hatch-skills` from `NAME_PERMANENCE_ENFORCEMENT: warn` to `block`.
- [x] 4.2 Update `hatch-skills` README language so real-content name permanence is described as blocking after launch.
- [x] 4.3 Add or update `scripts/check-name-permanence.test.mjs` cases proving real-content deletion and real-to-testing reclassification fail in block mode, while testing-fixture deletion still passes.
- [x] 4.4 Run the full `hatch-skills` CI-equivalent checks after hardening and verify there are no name-permanence warnings or failures.

## 5. Acceptance

- [x] 5.1 Verify `hatch list` against the cleaned registry shows only the intended launch-ready real entries for an ordinary project.
- [x] 5.2 Verify `hatch list architecture` shows `architecture-decisions` but not the nested `architecture-elicitation`, and `hatch list adr` or `hatch list capture` shows `capture-adrs`.
- [x] 5.3 Verify `hatch import architecture-decisions`, `hatch import capture-adrs`, and `hatch import <other-kept-real-entry>` succeed; verify `hatch import architecture-elicitation` is not advertised as a standalone import target.
- [x] 5.4 Verify removed pre-launch entries are not listed and cannot be imported by their old names.
- [x] 5.5 Verify testing fixtures remain hidden from ordinary projects and available only to test projects where expected.
- [x] 5.6 Confirm no deferred launch cleanup decisions remain before launch.
