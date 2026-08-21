## Why

Hatch is still before launch, and no live project depends on names in the private `hatch-skills` registry yet. This is the last low-cost point to audit the registry as a product surface rather than as an implementation fixture collection: every real skill name, group boundary, description, harness variant, and fixture should be checked before the names become permanent public contract.

The current CI model already has the right long-term shape. `scripts/check-name-permanence.mjs` can run in warn or block mode, and `.github/workflows/ci.yml` currently sets `NAME_PERMANENCE_ENFORCEMENT: warn`. The problem is that the documentation and specs treat real-content name permanence as morally settled while the launch cleanup may intentionally remove or rename real entries. Without an explicit audit window, a cleanup PR would look like a violation that slipped through rather than a deliberate final reset.

The launch moment is also where the registry should shed any skills that are not ready to be importable product content. Keeping a weak or misnamed skill because the permanence rule feels too early would be worse than acknowledging the pre-launch exception, doing the cleanup once, and then hardening the rule immediately afterward.

## What Changes

- **Define a final registry audit before launch.** The audit enumerates every current top-level registry entry, classifies it as keep, rename, remove, or fixture-only, and uses the implementation review to confirm every rename/removal decision.
- **Include the cleanup itself in this change.** Applying the change audits and edits the `hatch-skills` repository, rather than only preparing an audit plan.
- **Split the architecture skill group only where the member is reusable.** `write-architecture-decision` becomes a standalone top-level skill named `capture-adrs`. The architecture conversation skill is renamed to `architecture-elicitation` but remains nested inside the `architecture-decisions` group because it exists only as part of that bundled workflow.
- **Improve `prd-elicitation` as content, not as spec.** Feedback on its conversational flow is handled in the skill file. The specs capture the convention a skill must satisfy, not the PRD skill's exact interviewing process.
- **Allow real-content renames and deletions only during that audit window.** The name-permanence CI check remains capable of warning without blocking while the final cleanup PRs land. Warnings are expected during those PRs and must be reviewed as intentional launch cleanup.
- **Keep all other registry checks blocking.** Version bumps, testing declarations, descriptions, collision checks, and script tests continue to block. The audit window only softens name permanence and the related `false` to `true` reclassification check.
- **Require a post-cleanup hardening PR.** Once the final cleanup is complete, CI flips `NAME_PERMANENCE_ENFORCEMENT` to `block`, the docs/spec language returns to the strict launched-state rule, and future real-content renames/deletions must use the established `removed` metadata path rather than git deletion.
- **Clarify fixture cleanup remains ordinary.** `_`-prefixed testing content remains deletable and renameable both before and after launch. The audit may delete or rename fixtures without using the special real-content exception.

## Capabilities

`openspec/specs/` currently holds `project-initialization`, `testing-skill-convention`, and `version-control-integration`.

### New Capabilities

- `skill-content-convention`: the repository-wide conventions every real skill or group must satisfy, including frontmatter/manifest metadata, standalone-vs-group structure, reference placement, and reviewability.

### Modified Capabilities

None. The final audit and hardening sequence are implementation context for this change, not standing product behavior to archive into main specs.

## Impact

**Cross-repo (`AI-Wise-IT/hatch-skills`)**
- Audit every top-level folder currently in the registry:
  - real content: `architecture-decisions`, `hatch-usage`, `prd-elicitation`
  - testing fixtures: `_collision-check-fixture-a`, `_collision-check-fixture-b`, `_group-fixture-combo`, `_group-fixture-conflict-cross-major`, `_group-fixture-conflict-same-major`, `_group-fixture-sub`, `_group-fixture-versioned`, `_harness-suffix-fixture`, `_harness-suffix-fixture-cld`, `_reimport-fixture`, `_removed-fixture`
- Rename or remove entries that should not be frozen under their current names.
- Move `architecture-decisions/write-architecture-decision/` to a top-level `capture-adrs/` skill, update its frontmatter name and any references to the old name.
- Rename the nested architecture conversation member to `architecture-decisions/architecture-elicitation/`, update its frontmatter name and handoff references to `capture-adrs`.
- Keep `architecture-decisions/` as a group with a nested `architecture-elicitation` member and a pointer member to `capture-adrs`; update its description so it describes the bundle accurately.
- Revise `prd-elicitation/SKILL.md` according to audit feedback on its conversational flow, while keeping the spec focused on general skill conventions.
- Keep version bumps aligned with content edits where folders survive.
- Keep `scripts/check-name-permanence.mjs` in warn mode until cleanup is done, then flip the workflow to block mode.
- Update README language so it accurately distinguishes pre-launch audit behavior from launched-state permanence.

**Hatch CLI / OpenSpec**
- Add a skill-content convention spec capturing the structural/content-quality rules that apply across skills.
- Treat `hatch list` and the `registry-discovery` spec as shipped behavior; use them for cleanup acceptance rather than planning list functionality.
- No CLI runtime behavior changes are expected unless the audit identifies a skill rename that requires documentation, fixture, or usage guidance updates.

**Out of scope**
- Changing the semantics of `hatch import`, `hatch list`, group resolution, removed metadata, testing content import gating, or destination collision detection.
- Weakening CI checks other than name permanence and the paired real-to-testing reclassification rule.
- Creating a general future process for arbitrary post-launch renames. After launch, names are permanent again.
- Publishing or deploying Hatch.
