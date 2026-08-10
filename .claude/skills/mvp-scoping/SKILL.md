---
name: mvp-scoping
description: Runs a structured process to draw the line between what ships in the MVP and what's deferred, using a completed PRD as input, then documents everything that made the cut as use cases. Use this once a PRD exists (from prd-elicitation) and the user wants to decide what actually goes into the first build — "what's actually in v1," "draw the MVP line," "what are we cutting for now," or "write up the use cases for what's in scope." This is the step the PRD hands off to for sequencing: it takes the PRD's prioritized Must/Want/Nice/No scope list plus its dependency and timing notes, turns them into a confirmed in/out decision, and writes one use case per confirmed actor goal for whatever is in. It does not decide feature or backlog slicing, technology or architecture, or how deferred work gets ordered into later releases — those are separate steps.
---

# MVP Scoping

You are helping the user draw the line between what ships in the MVP and what doesn't, starting from a completed PRD. The PRD already decided how essential each item is (Must / Want / Nice / No); your job is to decide what actually ships in *this* build, and to write up everything that makes the cut clearly enough that architecture and build steps can pick it up cold.

Essentialness and inclusion are different questions. A Must is non-negotiable *if it ships at all* — it is not automatically in this release. Keep that distinction visible throughout.

Work through five phases in order. Do not write a use case before its cluster is confirmed, and do not close the exclusion register before every scope item is accounted for.

## Inputs

Read `intake/product-requirements.md` before starting. If it doesn't exist, or has no Scope section, stop and point the user at `prd-elicitation` first — do not reconstruct scope decisions from conversation alone.

Carry forward, from the PRD's closing lists:

- The full Scope section — Must, Want, Nice, No — each item with its one-liner.
- "For the sequencing step" — dependency notes and timing remarks the PRD deliberately did not act on.
- "Open questions" — anything left unresolved that bears on scope.

Every Must, Want, and Nice item is a starting position for this step to confirm or override, never a decision this step must inherit unquestioned. "No" is not a starting position — it is already a decision. Auto-carry every No straight to the exclusion register in Phase 5 and do not spend a turn on it.

## Phase 1 — Orient before deciding anything

Read the PRD's Scope list back to the user as two groups: Must, and Want+Nice — plain restatement, no verdicts yet. Don't restate No items; they need no attention here. Surface any dependency or timing notes attached to specific items now, so they're visible before Phase 2 starts making cuts.

Close this phase once the user confirms nothing has changed since the PRD was written.

## Phase 2 — Draw the line

Go through Must, then Want, then Nice, in that order. For each item, the question is binary: **ships in this MVP, or deferred.**

- Start from the PRD's own timing remarks where they exist — treat them as a proposed answer, not a settled one, and confirm or override with the user.
- When an item marked "in" depends on an item not yet decided, resolve the conflict before moving on: pull the dependency in, or cut the dependent item down so it stands without it. Do not leave a dependency implicit across the line.
- A Must can be deferred if the user says so explicitly — that's a signal it wasn't truly minimum, not an error to correct.
- "No" items are already out — auto-carried to the exclusion register in Phase 5. Do not ask about them or re-check them.

Keep a running two-column list — In / Out, one line each — as you go. This list is what Phase 3 clusters and Phase 5 closes out.

Only the user closes this phase.

## Phase 3 — Cluster the "in" list into actor goals

An actor goal is who is doing this and what complete, observable outcome they want — not a feature name, not a UI screen. Different means to the same end, for the same actor, are flows inside one use case, not separate ones. A different actor, or a genuinely different outcome, is a separate use case.

Propose clusters from the in-scope list: group items that serve the same actor reaching the same outcome by a different path. Present the map before writing anything:

- goal name and primary actor
- which in-scope items feed it
- one line on why they cluster together

Invite corrections — split, merge, rename, or pull an item into its own goal. Do not write a use case until its cluster is confirmed.

## Phase 4 — Write the use cases

One use case per confirmed cluster:

- **Overview** — id, name, primary actor, the observable outcome and why it matters
- **Preconditions** — verifiable facts true before the use case starts
- **Main Success Scenario** — numbered actor action / system response pairs, ending on the goal being achieved
- **Alternative Flows** — named, each tied to a specific main-flow step, each terminating explicitly
- **Postconditions** — Success and Failure, both stated
- **Business Rules** — constraints on the use case that aren't steps

Elicit this through dialogue, one cluster at a time. Ask about the main flow first, then the alternative flows and failure states that matter most for this actor. Range for depth on one cluster before moving to the next — this phase rewards getting one goal right over skimming all of them. Do not invent a flow, rule, or postcondition the user hasn't confirmed; if something is unclear, ask rather than fill it with a plausible assumption.

## Phase 5 — Close the exclusion register

For everything in "Out" — deferred Want or Nice items, any Must the user chose to defer, and every No — write one line: what it is, and why it's out. Distinguish deferred (name what it's waiting on, if known) from permanently excluded.

Before closing, check that every PRD scope item lands in exactly one place: a confirmed use case, or the exclusion register. An item in neither is a dropped decision — find it and place it.

## Throughout

This step makes no technology, architecture, or backlog/feature-slicing decisions. If the user raises one, note it and defer it to that step — do not interview around it.

If a cluster's flows imply a scope decision that Phase 2 didn't cover (a sub-behavior the PRD's one-liner didn't mention), treat it as a new candidate: get an explicit in/out verdict for it before writing it into the use case.

All output must be in English.

## Output

- `docs/use-cases/<slug>.md` — one file per confirmed in-scope actor goal, using the structure in Phase 4. Permanent, maintained documentation: architecture and later build steps read these as current truth, so keep them in sync as the product moves.
- `intake/mvp-scope.md` — the record of the split: confirmed in-scope goals (linking to their use case) and the exclusion register with reasons.

`intake/mvp-scope.md` is a decision record, not living documentation — it captures what was decided and why at MVP-cut time, the same way a PRD captures what was elicited at requirements time. Do not edit it to keep it "current" once the product moves past the MVP; a later re-scoping decision is a new record, not a rewrite of this one. `docs/use-cases/` is the opposite case — it must stay current, because later steps act on it.

Before treating this step as complete, verify:

- [ ] Every PRD scope item (Must, Want, Nice, No) is accounted for in exactly one place — a use case or the exclusion register.
- [ ] Every confirmed in-scope actor goal has a use case with both Success and Failure postconditions filled in.
- [ ] Every excluded item states a reason, and whether it's deferred or permanent.
- [ ] Every dependency between an in-scope and an out-of-scope item was resolved explicitly, not left implicit.
- [ ] No technology, architecture, or backlog-slicing decision was made in this step.
