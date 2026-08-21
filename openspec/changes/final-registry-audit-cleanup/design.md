## Context

The registry currently has three real top-level entries and eleven `_`-prefixed testing fixtures. Its CI already separates checks that lock names from checks that validate content shape:

- `scripts/check-name-permanence.mjs` enforces permanent real-content names and blocks real-to-testing reclassification when `NAME_PERMANENCE_ENFORCEMENT=block`; in `warn` mode it emits GitHub warnings and exits zero.
- `.github/workflows/ci.yml` currently sets the name-permanence job to `warn`, with a comment saying the hardening pass should flip it to `block`.
- `scripts/check-testing-declarations.mjs`, `scripts/check-descriptions.mjs`, collision checking, version bump checking, and script tests are already blocking.
- The registry README says testing skills are exempt from name permanence forever, while every real folder stays permanent.

That model is right after launch. The audit changes only the transition: before launch, real names may still be corrected once, but only with an explicit audit record and an immediate hardening follow-up.

The `hatch list` command is already shipped and the `registry-discovery` capability is archived into the main specs. This change treats listing as current behavior and uses it to verify the cleaned registry's public surface.

## Goals / Non-Goals

**Goals:**

- Make the final audit a deliberate release-readiness activity with recorded decisions for every current skill/group.
- Carry out the launch cleanup as part of the change, including real skill renames where the current names should not freeze.
- Establish a general skill-content convention without embedding skill-specific PRD or architecture process instructions in specs.
- Permit real-content rename/delete cleanup while there are no live consumers.
- Keep the warning output from name permanence visible during cleanup PRs so reviewers see exactly which names are changing.
- Preserve strict content-quality checks during the audit.
- End with CI in blocking mode before launch.

**Non-Goals:**

- Allowing casual or repeated real-content renames after launch.
- Replacing the `removed` metadata model for post-launch removal.
- Reworking skill content, naming conventions, harness suffix behavior, group semantics, or import resolution unless the audit identifies a specific entry-level cleanup.
- Making fixture cleanup require the same ledger burden as real-content cleanup.
- Specifying the exact conversational flow for `prd-elicitation`, `architecture-elicitation`, or `capture-adrs` inside OpenSpec requirements.

## Decisions

### Treat warn-mode permanence as an explicit pre-launch audit mode

The existing script already has the right control point. The change should not invent a second bypass flag or remove the check from CI. During the final audit, `NAME_PERMANENCE_ENFORCEMENT=warn` remains set and every real-content deletion, rename, or `false` to `true` reclassification produces warning annotations.

Those warnings are not failures during the audit, but they are not ignored either. A cleanup PR that triggers them must include the corresponding decision in the audit ledger. This keeps the exception reviewable without pretending the long-term rule has disappeared.

### Keep content checks blocking

Name permanence is special because it protects external consumers from broken imports. Before launch, those consumers do not exist. The same reasoning does not apply to malformed manifests, missing descriptions, destination collisions, or failing enforcement-script tests. Those checks protect registry correctness at the moment the PR merges, so they remain blocking throughout the audit.

Version-bump checking also stays blocking for surviving folders. A renamed folder is treated as deletion plus addition by the permanence check, but its new folder still needs valid metadata and versioning like any other registry entry.

### Record decisions in a ledger rather than only in commit history

The audit should leave a durable document in `hatch-skills` that lists each current top-level folder and one decision:

- `keep`: the folder is launch-ready under its current name.
- `rename`: the folder moves to a new top-level name before launch.
- `remove`: the folder is deleted before launch because it should not be importable or fixture-maintained.
- `fixture-only`: the folder remains `_`-prefixed test content and is not part of the launch product surface.
- `defer`: the folder remains but needs a tracked post-audit follow-up before launch.

For real-content `rename` and `remove`, the ledger records the reason, old name, new name when applicable, and any downstream references that were updated. For fixtures, a shorter rationale is enough because they are already outside the permanence rule.

### Split standalone skills from the architecture bundle

The current `architecture-decisions` folder is a group with two nested members: `design-architecture-decision` and `write-architecture-decision`. The audit separates only the member that has a real standalone use:

- `capture-adrs` is a standalone skill that writes or updates one ADR. It owns the ADR template asset and can be imported on its own by a project that wants only the recorder.
- `architecture-elicitation` is the nested group member that runs the architecture conversation and hands settled choices to `capture-adrs`. It is not a standalone skill because it semantically requires the ADR capture skill to complete its workflow.
- `architecture-decisions` remains the group name for importing the full architecture workflow, with one nested member (`architecture-elicitation`) and one pointer member (`capture-adrs`).

This follows the existing group model: nested members are for content that exists only as part of a group, while pointer members are for skills that are useful both standalone and in a bundle. ADR capture has a clear standalone use during implementation whenever an agent makes a significant architecture choice outside the original conversation, so it should not be trapped inside the group. Architecture elicitation, by contrast, is not complete without ADR capture, so exposing it as standalone would create an import handle for a skill that semantically requires another skill.

### Keep skill-specific flow in skill content

`prd-elicitation` needs content feedback on its flow. That feedback belongs in `prd-elicitation/SKILL.md` and in the audit ledger, because it is instruction text for one skill rather than a system behavior Hatch enforces. The spec should instead capture the general convention a reviewed skill must satisfy: clear trigger metadata, bounded responsibility, explicit inputs and outputs, handoff boundaries, reference assets in stable locations, and no hidden side effects.

This distinction keeps OpenSpec useful as the durable contract for registry behavior and quality rules, while leaving each skill free to express its own conversational method.

### Harden immediately after cleanup

The audit is not complete until a follow-up PR flips `.github/workflows/ci.yml` to `NAME_PERMANENCE_ENFORCEMENT: block` and updates README/spec language to describe the launched-state rule without ambiguity. That hardening PR should not rename or delete real content itself; it closes the window opened for the cleanup.

Keeping hardening separate from the cleanup PR makes review simpler: one PR can contain the messy registry decisions, and the next can prove the final invariant is restored.

### Reclassification is allowed only as an audit cleanup action

The existing permanence script treats `testing: false` to `testing: true` as equivalent to laundering a real folder out of permanence. That remains true after launch. During this audit, reclassification may be appropriate if a current real entry is discovered to be a fixture or internal test support under a poor name, but it must be accompanied by the naming marker required by ADR-0027 and the ledger entry explaining the decision.

The preferred cleanup for real content that should not launch remains deletion during the audit rather than converting it into a fixture, unless the content is genuinely useful as a long-lived CLI test fixture.

## Risks / Trade-offs

- **A temporary exception can linger** -> Make hardening a required task, and define the audit as incomplete until CI blocks real-content deletion and reclassification again.
- **Warnings can be normalized** -> Require every real-content warning to map to a ledger row; unmatched warnings mean the cleanup PR is not ready.
- **Renames may break internal references** -> The audit tasks include searching README, skills, group members, fixtures, docs, and tests for each old name and verifying `hatch list`/collision behavior after the change.
- **Removing a weak skill may reduce launch scope** -> This is acceptable before launch. A smaller trustworthy registry is better than freezing questionable names into a permanent contract.
- **The ledger can become stale after launch** -> The ledger records the launch audit, not an ongoing source of truth. Post-launch changes are governed by CI and the registry README.

## Migration Plan

1. Add the audit ledger to `hatch-skills` with every current top-level folder classified.
2. Apply cleanup PRs while `NAME_PERMANENCE_ENFORCEMENT` remains `warn`.
3. For each cleanup PR, verify all blocking checks pass and every name-permanence warning is intentional and ledger-backed.
4. Run an acceptance pass against the cleaned registry using the current Hatch CLI.
5. Flip name permanence to `block` in CI and update documentation/spec language to the launched-state rule.
