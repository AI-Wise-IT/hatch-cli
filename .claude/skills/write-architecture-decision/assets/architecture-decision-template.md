# <Decision Title>

<!-- Replace every placeholder and remove every guidance comment before the record is considered complete. Keep this file focused on one architecture component, integration, or technology choice. -->

## Metadata

- **id:** <NNNN-stable-kebab-case-slug>
- **component:** <catalogue component or confirmed project-specific component>
- **status:** <proposed | accepted | deprecated | superseded by NNNN-slug>
- **applies_to:** <file globs, folders, backlog unit classes, or component scope this decision governs>
- **decision_record:** `docs/architecture/decisions/<id>.md`

## Decision

<!-- State the selected choice plainly. Cover everything this component owns. Use imperative language for the enforceable part and avoid rationale here. -->

<What the project has decided.>

## Context

<!-- Record the confirmed project facts, prior decision records, PRD/use-case constraints, and requirements that drove the decision. Do not copy sibling records; cite them by id and path. -->

<Why this decision was needed and what constrained it.>

## Alternatives Considered

<!-- List only genuine options considered in the dialogue. If a mandated choice left no real alternatives, say that plainly and cite the constraint. Do not fabricate options. -->

- <Alternative and why it was not chosen.>

## Trade-offs Accepted

<!-- Explain what was knowingly given up, mapped to prompt coherence, failure surface, reversibility, and operational simplicity. -->

- **Prompt coherence:** <accepted trade-off>
- **Failure surface:** <accepted trade-off>
- **Reversibility:** <accepted trade-off>
- **Operational simplicity:** <accepted trade-off>

## Consequences

<!-- Record what this decision constrains or enables downstream. Include environment variables, required files, review concerns, infrastructure implications, and records that must read this decision. -->

- <Consequence.>

## Agent Rules

<!-- State rules agents can execute literally. Each rule should be scoped by applies_to above and should use MUST or MUST NOT. -->

- MUST <required action or constraint>.
- MUST NOT <forbidden action or shortcut>.

## Machine Check

<!-- Provide one grep pattern, lint rule, script, command, or manual check that can verify conformance. If no automated check exists yet, write the smallest concrete manual check and explain what would make it fail. -->

```bash
<check command>
```

Expected result: <what passing looks like>.

## Precedence

<!-- Name any decision record this overrides, narrows, depends on, or is superseded by. Resolve contradictions here so later agents do not choose arbitrarily. If this record supersedes an earlier one, the earlier record's own status line must be updated to "superseded by <this id>" as part of writing this record. -->

- <decision id and path, or "No known conflicting decision records.">
