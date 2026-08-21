## 1. Audit Preparation

- [ ] 1.1 Create a durable audit ledger in `hatch-skills` listing every current top-level folder with fields for current name, kind, testing status, version, description source, decision, rationale, replacement name, and follow-up references.
- [ ] 1.2 Populate the ledger with the current registry entries: `architecture-decisions`, `hatch-usage`, `prd-elicitation`, `_collision-check-fixture-a`, `_collision-check-fixture-b`, `_group-fixture-combo`, `_group-fixture-conflict-cross-major`, `_group-fixture-conflict-same-major`, `_group-fixture-sub`, `_group-fixture-versioned`, `_harness-suffix-fixture`, `_harness-suffix-fixture-cld`, `_reimport-fixture`, and `_removed-fixture`.
- [ ] 1.3 For each real entry, inspect `SKILL.md`, `skill.json`, nested members, group pointers, descriptions, README references, and any Hatch CLI docs/tests that name it; record keep/rename/remove/defer in the ledger.
- [ ] 1.4 Record the architecture cleanup decision: `write-architecture-decision` -> standalone `capture-adrs`, `design-architecture-decision` -> nested `architecture-elicitation`, and `architecture-decisions` remains the group bundle.
- [ ] 1.5 Record the `prd-elicitation` flow-feedback items in the ledger as skill-content work, not spec requirements.
- [ ] 1.6 For each testing entry, verify it still exercises a needed CLI behavior; record fixture-only, rename, or remove in the ledger.

## 2. Cleanup PRs

- [ ] 2.1 Move `architecture-decisions/write-architecture-decision/` to top-level `capture-adrs/`, update its `SKILL.md` frontmatter `name`, headings, references, template asset paths, and any docs/tests that name the old skill.
- [ ] 2.2 Rename `architecture-decisions/design-architecture-decision/` to nested `architecture-decisions/architecture-elicitation/`, update its `SKILL.md` frontmatter `name`, headings, references, and handoff instructions so it invokes `capture-adrs`.
- [ ] 2.3 Convert `architecture-decisions/skill.json` to keep a nested `architecture-elicitation` member and add a pointer member for `capture-adrs`, and update the group description to describe the bundle.
- [ ] 2.4 Revise `prd-elicitation/SKILL.md` according to the recorded flow feedback, preserving its responsibility boundary: functional requirements and handoff notes, not sequencing or architecture decisions.
- [ ] 2.5 Rename any other real skill/group whose launch name should change, updating folder names, frontmatter `name`, group pointer references, README/docs references, tests, and any Hatch CLI fixture expectations that name it.
- [ ] 2.6 Remove any real skill/group that should not launch, using git deletion only during the audit window and documenting why no `removed` tombstone is needed pre-launch.
- [ ] 2.7 Remove or rename obsolete testing fixtures, preserving only fixtures that still prove a current Hatch behavior.
- [ ] 2.8 For every surviving edited folder, bump `skill.json.version` according to the existing version-bump check.
- [ ] 2.9 Run `node scripts/check-testing-declarations.mjs .`, `node scripts/check-descriptions.mjs .`, `node --test "scripts/*.test.mjs"`, and the CI collision check path; verify they pass.
- [ ] 2.10 Run the name-permanence check in warn mode and confirm every warning is represented in the audit ledger.

## 3. Hatch CLI / Documentation Follow-Through

- [ ] 3.1 Search the Hatch CLI repository for old names and update docs, tests, OpenSpec references, and skill guidance that should follow a rename, including `write-architecture-decision`, `design-architecture-decision`, `capture-adrs`, `architecture-elicitation`, and `architecture-decisions`.
- [ ] 3.2 If `hatch-usage` is renamed or removed, update any bootstrap/import guidance that expects that skill name.
- [ ] 3.3 Run the Hatch CLI test suite paths affected by renamed registry content.

## 4. Re-Hardening

- [ ] 4.1 Flip `.github/workflows/ci.yml` in `hatch-skills` from `NAME_PERMANENCE_ENFORCEMENT: warn` to `block`.
- [ ] 4.2 Update `hatch-skills` README language so real-content name permanence is described as blocking after launch, with only the recorded final audit as the closed pre-launch exception.
- [ ] 4.3 Add or update `scripts/check-name-permanence.test.mjs` cases proving real-content deletion and real-to-testing reclassification fail in block mode, while testing-fixture deletion still passes.
- [ ] 4.4 Run the full `hatch-skills` CI-equivalent checks after hardening and verify there are no name-permanence warnings or failures.

## 5. Acceptance

- [ ] 5.1 Verify `hatch list` against the cleaned registry shows only the intended launch-ready real entries for an ordinary project.
- [ ] 5.2 Verify `hatch list architecture` shows `architecture-decisions` but not the nested `architecture-elicitation`, and `hatch list adr` or `hatch list capture` shows `capture-adrs`.
- [ ] 5.3 Verify `hatch import architecture-decisions`, `hatch import capture-adrs`, and `hatch import <other-kept-real-entry>` succeed; verify `hatch import architecture-elicitation` is not advertised as a standalone import target.
- [ ] 5.4 Verify removed pre-launch entries are not listed and cannot be imported by their old names.
- [ ] 5.5 Verify testing fixtures remain hidden from ordinary projects and available only to test projects where expected.
- [ ] 5.6 Confirm the audit ledger has no `defer` entries left unresolved before launch.
