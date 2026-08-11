---
name: plan-build-batches
description: Decomposes the remaining, non-infrastructure part of a scoped, architected MVP into an ordered sequence of small, human-verifiable build batches, grouping the confirmed use cases (and their alternative flows) using the independently-implementable + reviewable-as-a-coherent-whole test. Run this after build-infrastructure-batch has already built and recorded Batch 1 — this skill picks up from docs/build-plan.md rather than deciding whether infrastructure comes first, since that's not a judgment call. Use this once MVP scoping (docs/use-cases/), architecture decisions (docs/architecture/decisions/), and the infrastructure batch are all settled and the developer wants to sequence the rest of the build — "how do we break the rest of this into batches," "what do we build after the skeleton," "sequence the remaining use cases," "extend the build plan." Produces a written batch plan (one entry per batch: contents, dependency rationale, human-verification method) gated on explicit developer confirmation before any batch starts. Does not build anything itself. Does not re-litigate scope or architecture decisions; if sequencing reveals a missing decision, defer to mvp-scoping or write-architecture-decision instead of deciding it inline.
---

# Plan Build Batches

You are sequencing the rest of an already-scoped, already-architected, already-skeletoned MVP into an ordered series of small build batches a human can verify one at a time. Every batch you propose must survive two tests: it doesn't depend on a batch that hasn't been built yet, and it ends in something a person can actually try and judge.

## Inputs

Read before proposing anything:

- `docs/build-plan.md` — must already exist with a Batch 1 entry marked `done`, written by `build-infrastructure-batch`. If it's missing, or Batch 1 isn't recorded as done, stop and point the developer at `build-infrastructure-batch` first. Deciding whether infrastructure comes first isn't a judgment call this skill makes — it's a precondition.
- `docs/use-cases/*.md` — every confirmed in-scope use case (mvp-scoping's output).
- `intake/mvp-scope.md`, specifically **"For the sequencing step"** — the dependency and timing notes carried forward from the PRD.
- `docs/architecture/decisions/` and its `README.md` index — every accepted ADR, so a proposed batch never conflicts with a settled decision.
- `references/batching-criteria.md` in this skill — the distilled rules this skill applies and the reasoning behind them. Read it before proposing anything; don't re-derive the criteria from scratch.

If a use case is missing or unwritten, or an architecture decision affecting an in-scope use case is still `proposed` or absent, stop and point the developer at `mvp-scoping` or `write-architecture-decision` first. Do not sequence around a gap.

## Phase 1 — Confirm the foundation

Read Batch 1 from `docs/build-plan.md`. It should already be recorded `done` by `build-infrastructure-batch` — real infrastructure, not a projection. This phase is a confirmation, not a proposal: if anything about it looks stale (an ADR changed since it was built, or the recorded contents don't match what's actually in the repo), flag it to the developer before batching anything on top of it. Everything in Phase 2 assumes this foundation is real and current.

## Phase 2 — Propose batches for the remaining use cases

For every confirmed use case not covered by Batch 1:

1. Pull forward every dependency and timing note already on record. These are constraints, not suggestions — never propose an order that violates a recorded dependency.
2. Group use cases that share dependency depth, a data model, or an implementation surface into the same batch — provided the group still ends in one coherent, demoable outcome. Never group use cases together for convenience alone.
3. If a single use case is too large to review as one batch (many alternative flows, several unrelated business rules), split it across batches using the techniques in the reference doc — by workflow step, business rule variation, interface/path, or data variation. Never split a batch along architectural layers (UI vs. logic vs. data) — every batch must remain a vertical slice.
4. For every candidate batch, write one entry: name, use cases/flows included, why they're sequenced here (the dependency or cohesion reason), and — critically — exactly how a human verifies it once built. "Tests pass" is not a verification method; a concrete action the developer takes and observes is.

## Phase 3 — Confirm with the developer

Present the proposed sequence for Batch 2 onward — alongside the already-built Batch 1 for context — as a table: name, contents, rationale, verification method. Invite corrections on grouping, sequencing, and batch size: a batch nobody can review as a whole is too coarse, a batch that delivers nothing checkable is too fine. Revise on any valid point.

Do not proceed to Output until the developer explicitly confirms the plan. This gate is the single most load-bearing practice in the reference material — do not skip it because the plan looks obviously right.

## Output

Append the confirmed batches to `docs/build-plan.md`, after the existing Batch 1 entry, in the same format: one section per batch, in build order, each with its contents, rationale, and verification method exactly as confirmed. This is the standing reference every later build step reads to know what "done" means for their batch — keep it current if a batch's scope changes materially during build, rather than letting it drift from reality.

## Throughout

This skill makes no scope or architecture decisions. If sequencing surfaces a scope gap (a use case implies something never decided) or an architecture gap (a batch needs a technology choice no ADR covers), stop and flag it to `mvp-scoping` or `write-architecture-decision`. Do not decide it here to keep moving.

All output must be in English.

## Completion

Before treating this step as complete, verify:

- [ ] Batch 1 was confirmed already `done` in `docs/build-plan.md` before any other batch was proposed — not re-decided or re-proposed here.
- [ ] Every confirmed use case — and, where split, every alternative flow — is assigned to exactly one batch: none unscheduled, none duplicated.
- [ ] No batch depends on a batch sequenced after it.
- [ ] Every batch has an explicit, concrete human-verification method.
- [ ] The developer explicitly confirmed the sequence before it was appended to `docs/build-plan.md`.
