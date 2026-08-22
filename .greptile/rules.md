# How this repository's decision records are organised

This file is orientation, not policy. It states **no rules of its own**. Every standard this
repository enforces lives either in a decision record under `docs/architecture/decisions/`
or in a scoped rule in `.greptile/config.json` that cites one. If something reads like a
rule and is not in one of those two places, it is not a rule.

## What the records are

`docs/architecture/decisions/` holds one file per settled architecture or technology
decision, numbered in acceptance order. They are supplied to you as review context through
`.greptile/files.json` — all of them, every review. They are the source; the rules in
`config.json` are pointers to them.

## How to read one

Each record carries the same sections. Three matter most when reviewing:

- **`## Decision`** — what was settled, stated normatively. Context for judging intent.
- **`## Agent Rules`** — the `MUST` / `MUST NOT` an agent building against this record obeys.
  **This is the enforceable part.** When a rule in `config.json` says "enforce the Agent
  Rules of record N", this is the section it means.
- **`## Invariants`** — what became irreversible, how it is enforced, and in what mode.

`## Machine Check` declares how the record is verified. Most records name a command that a
CI job runs. Five name a reviewer instead, because what they assert needs judgment about
what code *means* rather than a fact a command can read — those are the ones where your
reading is the only check there is.

## What "accepted" means for a record

A record whose status is `accepted` has three **frozen** sections: `## Decision`,
`## Agent Rules`, `## Invariants`. They are immutable. Changing what any of them mandates
requires a *new record that supersedes this one* — never an edit in place. A pull request
that edits a frozen section of an accepted record is a contract violation regardless of
whether the new wording is an improvement.

Every other section may be edited freely. Repairing a check that has rotted or adding a
cross-reference is maintenance, not a new decision.

A record whose status is `superseded` describes a decision no longer in force. Do not
enforce it. It names its replacement in `## Metadata`.

## Two things that are deliberately not your job

**Repository visibility and branch protection.** Records 0004 and 0008 assert live GitHub
organisation state that no checkout contains. Nothing in a diff can establish or refute
them. Do not infer a violation from their absence in the code.

**Whether a decision is a good one.** The records are settled. If a change conflicts with a
record, the finding is that the change conflicts with a settled decision — not that the
decision should be revisited. Superseding a record is a deliberate act with its own
procedure, and a pull request that does it properly is conforming, not violating.
