## Why

`skill-content-convention` already requires a registry name to be "kebab-case and task-oriented enough that it can stand alone in `hatch list`". In practice that phrasing has not been enough to decide a name. Three of the four skills ported from the `flex-exp` repository arrived named for the artifact they produce or a quality of their output — `balanced-evaluation`, `expert-reference`, `self-contained-output` — and each one satisfies a literal reading of "task-oriented" while telling a reader nothing about what the skill does. In a listing they read as things you receive rather than work an agent performs.

The gap is that the existing rule states a goal without stating the form that achieves it. Naming a skill for its output is the specific failure mode, and it is common enough to be worth ruling out by name.

The cost of getting this wrong is permanent. [ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) makes a published name unrenameable, so a name is decided exactly once and lives with the registry forever. A rule that only bites at review time, stated as a goal rather than a form, is the kind that gets satisfied on a technicality — and the mistake it lets through cannot be undone.

## What Changes

- **A plain skill's name SHALL be a verb-first task phrase** — a verb naming the work the skill performs, with the object it acts on where one clarifies it: `capture-adrs`, `evaluate-decision`, `strip-editing-residue`, `prime-expert-context`, `organise-thoughts`.
- **A plain skill's name SHALL NOT be a noun phrase naming its output or a property of that output.** This is the specific pattern being ruled out: `balanced-evaluation` names a quality of the answer, `expert-reference` names the document, `self-contained-output` names a property of the result. None of them names the work.
- **Groups keep the rule they already have.** A group name describes the bundled workflow or capability a user receives, and is not required to be verb-first. A group is a bundle rather than an action, and `architecture-decisions` reads correctly as the capability it delivers.
- **The requirement binds a name at first publication, not retroactively.** Name permanence outranks it: a name already published stays exactly as it is. `prd-elicitation` and `hatch-usage` are noun phrases that predate this rule and are not renamed, because [ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) forbids it.
- **Registry `README.md` gains a short authoring note**, so the form is stated where someone authoring a skill actually reads before choosing a name.

This is a convention change only. It adds no CI check: whether a name is a verb phrase is a judgment a reviewer makes, not something mechanically decidable, and the review gate that already accepts content as real importable content is where it belongs. A future mechanical bar on content validity is the separate, unscoped [`add-skill-content-requirements`](../add-skill-content-requirements/proposal.md).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-content-convention`: the requirement "Registry names are stable, task-oriented import handles" gains the verb-first form for plain skills, the explicit exclusion of output-naming noun phrases, the group carve-out, and the statement that permanence outranks the rule for already-published names.

## Impact

**Specs**
- `openspec/specs/skill-content-convention/spec.md` — one modified requirement.

**Cross-repo (`AI-Wise-IT/hatch-skills`)**
- `README.md` — a short authoring note stating the form, alongside the existing convention sections.

**Registry content**
- Nothing is renamed. The four skills being ported in the same working session already comply (`organise-thoughts`, `evaluate-decision`, `prime-expert-context`, `strip-editing-residue`).
- `prd-elicitation` and `hatch-usage` do not comply and are deliberately left alone; permanence outranks the rule.

**Out of scope**
- Any CI check enforcing the form.
- Renaming, deprecating, or superseding already-published content to comply.
- Naming rules for harness-suffixed variants, which [ADR-0001](../../../docs/architecture/decisions/0001-harness-suffix-convention.md) already fixes.
