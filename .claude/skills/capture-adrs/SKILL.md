---
name: capture-adrs
description: Writes or updates a single Architecture Decision Record (ADR) — the enforceable, agent-readable record of one architecture or technology choice. Use this when an architecture decision has just been confirmed by architecture-elicitation, and also later, on its own, whenever a coding or build agent is about to make or has just made a significant technology or architectural choice mid-development — a framework, library, database, API or MCP surface, architectural pattern, data model, or an auth/security/testing strategy, including a migration from one of these to another. Skip it for trivial choices like variable naming or a minor refactor. Writes one file per decision to docs/architecture/decisions/, assigns it the next sequential number, and keeps the decisions index and any superseded records in sync. Does not hold the multi-option design conversation itself — that's architecture-elicitation's job when a decision hasn't been made yet.
---

# Capture ADRs

You are recording exactly one architecture decision as an Architecture Decision Record (ADR): a load-bearing artifact other agents will read, cite, and be bound by later — not a narrative summary for humans. Precision and enforceability matter more than prose quality.

You reach this skill two ways, and both end at the same template:

- **From architecture-elicitation.** The eliciter has just settled one cluster's decision with the developer and hands it to you immediately — the decision itself is already confirmed, your job is to record it faithfully and synthesize the parts the conversation didn't spell out verbatim (Trade-offs, Agent Rules, Machine Check).
- **On your own, mid-development.** You notice — or another agent notices — that a significant technology or architectural choice is being made outside the original architecture conversation. Record it here rather than letting it live only in code or chat history.

## Template

Fill `assets/architecture-decision-template.md` section by section. Every placeholder gets replaced; every guidance comment gets removed before the record is complete. One decision, one component or integration, one file.

If the project defines its own record contract — typically at `docs/architecture/decisions/README.md` — read it first and follow it where it is more specific than this template, particularly for the vocabulary its machine-check contexts use.

## Inputs

- **From the eliciter:** the confirmed decision, the options it was weighed against, and why the others lost — read this directly from the conversation, don't re-derive it.
- **On autonomous invocation:** the situation that forced the choice, and whatever the codebase already shows about the options. Before writing status `accepted`, put the drafted Decision and Alternatives Considered to the developer in one short message and wait for their confirmation — a decision an agent made alone mid-build still needs a human to have actually agreed to it. If you can't get a timely confirmation, write it with status `concept` instead and flag it as awaiting review; do not write `accepted` on your own say-so.
- Prior decision records under `docs/architecture/decisions/` — read the index (below) before drafting, so Context, Trade-offs, Consequences, and Precedence can cite real sibling records instead of restating them.

If a required input is missing or too vague to fill a template element, mark that element with `<!-- TODO: [description] -->` and flag the gap to the developer. Never invent a fact, an alternative, or a rule to fill a gap — an invented entry is harder to catch later than an honest placeholder.

## The status lifecycle

`status` takes exactly one of three values, and which one you write governs what may happen to the record afterwards.

- **`concept`** — working material. Every section may be edited freely, and nothing else may cite it as settled.
- **`accepted`** — the project is operating under this decision. From that moment its **Decision**, **Agent Rules** and **Invariants** sections are frozen.
- **`superseded`** — replaced by a later record, named in a `superseded_by` line in the same Metadata block.

Nothing else is a status. `proposed`, `deprecated`, and free text belong to no lifecycle a runner or a reviewer can act on.

## Workflow

1. **Scan** `docs/architecture/decisions/` for existing records. This tells you the next sequential number and surfaces anything the new decision might overlap, narrow, or contradict.
2. **Assign the id** — `NNNN-kebab-case-slug`, where `NNNN` is the next zero-padded sequential number (four digits: `0001`, `0002`, …) and the slug is a short, stable name for the decision (e.g. `0007-auth-strategy`). The number gives every record a fixed place in the order they were actually decided in, so a human scrolling the folder reads it chronologically without opening a file; the slug keeps it legible and citable by name elsewhere. Once assigned, the id does not change — even if the decision is later superseded.
3. **Draft** every template section from confirmed input only. For **Invariants**, hold every Agent Rule you just wrote against one question: once a real external dependent exists — a user, another team, a published artifact, live production data — would violating or reversing this rule become difficult or impossible? A rule that fails this test (a name, schema, or contract someone outside the build could come to depend on) is a pre-launch invariant; state its trigger condition and enforcement mechanism/mode explicitly, naming the job or mechanism rather than saying "CI". A rule that's purely internal (nothing outside the build ever observes it) isn't — don't force an entry. New enforcement you build for a fresh invariant defaults to `advisory`; it becomes `blocking` only at a later, deliberate cutover — see `pre-launch-audit`/`pre-launch-harden` if this project has them, but this section stands on its own even without those skills present. A check protecting the integrity of a shared artifact rather than a pre-launch cleanup window is the exception, and blocks from the day it lands.
4. **Write a Machine Check that can actually fail.** Declare its **context** first — where it runs — using the project's own vocabulary if its record contract defines one. Then write one fenced `bash` block that runs as written: no placeholder standing in for a path or value someone must substitute, and an exit status that distinguishes pass from fail. A command ending in `|| true`, one that swallows its failure in a trailing `|| echo`, and one that pipes into `head` or `sort` and so discards the status of everything upstream all pass whatever they find, and are not checks. Run it before you write it down. If the record can only be established by judgment about what the code *means*, or asserts live infrastructure configuration no checkout carries, declare `review-only` with a `reason` and describe what a reviewer must inspect. That is honest; a command whose success is unrelated to the property the record asserts is not, because a green run then overstates what was checked.
5. **Never edit a settled decision.** If what an `accepted` record's Decision, Agent Rules or Invariants says needs to change, that is a *new* record superseding it, never an edit in place. Write the new record; set the old one's `status` to `superseded` and its `superseded_by` to the new id; leave the old record's frozen sections exactly as they were accepted. Every other section of an accepted record stays editable — Context, Alternatives Considered, Trade-offs Accepted, Consequences, Machine Check, Precedence — so repairing a check that has rotted, correcting a fact that has since changed, and adding a cross-reference to a later record need no supersession. A `concept` record has no frozen sections at all. Some projects enforce this in CI; the rule holds either way.
6. **Resolve conflicts before writing.** If this decision overrides, narrows, or replaces an existing record, say so explicitly in this record's Precedence section — and update the *older* record's Metadata as step 5 describes, as part of this same write. Two live records may never contradict each other with both still marked `accepted`.
7. **Write** the file to `docs/architecture/decisions/<id>.md`.
8. **Update the index** at `docs/architecture/decisions/README.md` — a table of `#` (the sequential number), `id`, `component`, `status`, `path`. Add a row for the new record; if step 6 superseded an older one, update that row's status too.

## When to fire on your own

Record a decision without being asked whenever it's one of: a technology selection (framework, library, database, hosting/deployment target), an architectural pattern (state management, caching, an API or MCP surface's shape), a data-modeling choice, or a change to auth, security, or testing strategy — including migrating from a previously-recorded choice to a new one. Don't fire for anything that wouldn't survive being read back six months from now as "why we can't casually change this" — variable naming, a local refactor, or a choice with no real alternative anyone would reconsider isn't an ADR.

## Completion

Before treating this step as complete, verify:

- [ ] The record exists at `docs/architecture/decisions/<id>.md` with every placeholder and guidance comment replaced or removed.
- [ ] `status` is exactly one of `concept`, `accepted`, `superseded` — and reflects reality: `accepted` only after developer confirmation on an autonomous invocation.
- [ ] Every element traces to confirmed input; any gap is an explicit `<!-- TODO -->`, not a guess.
- [ ] Every Agent Rule was checked against the Invariants question; anything irreversibility-bearing is listed with its trigger condition and enforcement mode, not silently skipped.
- [ ] The Machine Check declares a context, and either carries one runnable `bash` block you have actually run — which fails when the record stops being true — or declares `review-only` with a reason and a review procedure.
- [ ] No frozen section of an already-`accepted` record was edited. If one needed to change, a superseding record exists instead, and the original's status and `superseded_by` were updated.
- [ ] `docs/architecture/decisions/README.md` lists the new record with the correct sequential number.
- [ ] If this decision supersedes an earlier one, that record's Metadata now reads `status: superseded` with `superseded_by: <this id>`, and both records' Precedence sections point at each other.
