# <Decision Title>

<!-- Replace every placeholder and remove every guidance comment before the record is considered complete. Keep this file focused on one architecture component, integration, or technology choice. -->

## Metadata

<!-- `status` is exactly one of three values. `concept` is working material: every section may be edited freely, and nothing may cite it as settled. `accepted` means the project is operating under this decision, and its Decision, Agent Rules and Invariants sections are frozen from that moment — changing what any of them says takes a superseding record, never an edit. `superseded` names the record that replaced it. -->

- **id:** <NNNN-stable-kebab-case-slug>
- **component:** <catalogue component or confirmed project-specific component>
- **status:** <concept | accepted | superseded>
- **superseded_by:** <NNNN-slug of the record that replaces this one — this line only exists when status is superseded>
- **applies_to:** <file globs, folders, backlog unit classes, or component scope this decision governs>
- **decision_record:** `docs/architecture/decisions/<id>.md`

## Decision

<!-- FROZEN once status is accepted. State the selected choice plainly. Cover everything this component owns. Use imperative language for the enforceable part and avoid rationale here. -->

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

<!-- FROZEN once status is accepted. State rules agents can execute literally. Each rule should be scoped by applies_to above and should use MUST or MUST NOT. -->

- MUST <required action or constraint>.
- MUST NOT <forbidden action or shortcut>.

## Invariants

<!-- FROZEN once status is accepted. For each Agent Rule above, ask: once a real external dependent exists (a user, another team, a published artifact, live production data), would violating or reversing this rule be difficult or impossible? If yes, it's a pre-launch invariant — list it below with the condition that makes it irreversible and how it's (or will be) enforced. If genuinely none of this record's rules are irreversibility-bearing, write that plainly rather than forcing an entry. -->

- **<the Agent Rule, quoted or closely paraphrased>** — becomes irreversible once: <the condition that flips it from reversible to permanent — e.g. "a real project imports this name," "a row exists in production," "a client has called this endpoint">. Enforcement mechanism: <how it's checked or blocked — a CI check named by job, a database constraint, a runtime guard, a type, or "none">. Current mode: <not-yet-built | advisory (detects and reports, does not block) | blocking (enforced)>.

<!-- New enforcement for a fresh invariant should default to advisory — build and prove the mechanism before it can block anything, since nothing external depends on it yet. It only becomes blocking at a deliberate, later cutover, not automatically at the moment this record is written. A check that protects the integrity of a shared artifact rather than a pre-launch cleanup window is the exception, and blocks from the day it lands. -->

## Machine Check

<!-- Declare where the check runs before writing it. Use the vocabulary the project's own docs/architecture/decisions/README.md defines if it has one; otherwise name the repository or environment plainly. A decision that can only be established by judgment about what code *means*, or that asserts live infrastructure configuration no checkout carries, declares that instead of presenting a command. -->

- **context:** <the repository or environment this check runs in, or `review-only`>

<!-- For an executable context: exactly one fenced bash block, followed by a stated expected result. The command must run as written — no placeholder standing in for a path or value a reader is expected to substitute — and must distinguish pass from fail by its exit status. A command that ends in `|| true`, swallows its own failure in a trailing `|| echo`, or pipes into `head`/`sort` and so discards the status of everything upstream, is not a check: it passes whatever it finds. A runner will execute this, so it has to be true that running it establishes the record. -->

```bash
<check command>
```

Expected result: <what passing looks like, and what a failure prints instead>.

<!-- For `review-only`: delete the fenced block entirely, and in its place write a `- **reason:**` bullet saying why no command can establish this record, followed by prose naming exactly what a reviewer must inspect and conclude. A command whose success is unrelated to the property the record asserts — a grep for a phrase in a comment, an inverted exit status — is worse than none at all, because a green run then overstates what was actually checked. -->

## Precedence

<!-- Name any decision record this overrides, narrows, depends on, or is superseded by. Resolve contradictions here so later agents do not choose arbitrarily. If this record supersedes an earlier one, the earlier record's own Metadata must be updated to status `superseded` with `superseded_by` naming this id, as part of writing this record. -->

- <decision id and path, or "No known conflicting decision records.">
