# Batching Criteria — Reference

Distilled grounding for `plan-build-batches` and `build-infrastructure-batch`: one proven internal precedent, one internal precedent that was deliberately retired, and the external frameworks both agree with. Cite this reasoning when proposing or defending a batch boundary — don't re-derive it from scratch each time.

## The core test

A batch boundary is correct only if it passes both:

- **Independently implementable** — it does not depend on a batch that hasn't been built yet. Dependencies point backward only.
- **Reviewable as a coherent, demoable whole** — it ends in something a person can actually try and judge, not a partial layer or an internal detail nobody outside the build can evaluate.

A batch that fails the first test is out of order. A batch that fails the second is either too coarse (unrelated things bundled together so nothing about it can be judged as one thing) or too fine (it delivers nothing checkable on its own).

## Internal precedent: sakura-calt

sakura-calt's MVP (29 user stories) was first attempted as one monolithic build — it failed and was fully reverted. Only after that did the team decompose it into 7 batches of 2–8 stories each (mode ~4), and the rebuild succeeded. What made the batches work:

- **Dependency order** — schema/data model first, then domain entities, then computation, then display, then configuration, then cross-cutting aggregation (data export, account deletion) last, because those depend on everything else existing.
- **Shared implementation surface** — stories that shared one schema migration, one computation module, or tightly-coupled UI/logic that couldn't be separated without an artificial seam, traveled together.
- **Verifiability against real state, not zero-state** — sequencing sometimes deliberately delayed a batch so it could be checked against real data rather than an empty database, because that's what made manual verification meaningful.
- **A written rationale per batch** — every batch had one paragraph stating why those specific stories belonged together and why they were sequenced where they were, plus a "Delivers" line written as an end-to-end outcome a person could try, not a technical milestone.
- **An explicit human confirmation gate** — each batch ran through build → automated verification against its own standalone acceptance-criteria checklist → a refinement loop that only closed when the developer explicitly confirmed the batch was done. No batch advanced on "looks right."
- **Deferred criteria were allowed, explicitly** — a criterion could be knowingly pushed from an earlier batch into a later one (e.g. because the UI it needed didn't exist yet) rather than forcing premature, fake completeness.

## Internal precedent that was retired: hatch-mvp's old `scope-build`

An earlier Hatch template used almost this same two-condition test, plus a mandatory developer-dialogue step before locking the plan. It was deleted — not because the batching *criteria* were wrong, but because it duplicated a separate execution mechanism (a full build → review → refine → review loop per batch, run through its own logbook/plan model) that the generated project's own backlog pipeline already owns. The batching *judgment* — independently implementable, reviewable as a whole, confirmed with the developer before starting — is exactly what's preserved here; what's deliberately not being revived is a competing workflow engine. Keep this skill's job to *sequencing and verification criteria*, not to re-implementing a parallel build/review loop.

## External frameworks

**Walking skeleton — Alistair Cockburn.** Build a tiny implementation that performs a small end-to-end function, touching every architectural layer even if trivially, before adding real functionality to any layer. This is the model for treating infrastructure/skeleton as the mandatory first batch: prove the full stack is wired end to end before any use case gets built on top of it.

**User story mapping / release slicing — Jeff Patton.** Arrange the backbone of user activities, then slice down through all of them to define releases; the first slice is the walking skeleton, later slices add breadth and depth. Use cases here play the role of Patton's backbone activities — grouping and sequencing them into batches is the named practice, not an improvisation.

**Vertical vs. horizontal slicing.** A vertical slice cuts through every layer (UI, logic, data) to deliver one complete, user-visible outcome; a horizontal slice delivers one layer at a time and produces nothing usable until everything is done. This is the test for whether a candidate batch is actually demoable — never split a batch along architectural layers.

**INVEST — Bill Wake.** A well-formed slice should be Independent, Negotiable, Valuable, Estimable, Small, Testable. Use this as the acceptance test for a candidate batch, especially Independent (no forward dependency) and Testable (ends in something a person can check).

**Skateboard-to-car / Earliest Testable–Usable–Lovable — Henrik Kniberg.** Each increment must be a complete, working (if minimal) product a real user could try — never a partial component of the eventual thing. This is why a batch's verification method must be a real action a person takes, not "code reviewed" or "tests pass."

**Story-splitting patterns — Richard Lawrence / Mike Cohn.** Concrete techniques for cutting an oversized story or use case into smaller vertical slices without losing end-to-end value: by workflow step, by business rule variation, by interface/path, by data variation, by isolating a spike. Use these when a single use case has too many alternative flows to review as one batch.

## docs/build-plan.md format

Both skills read and write the same file, so it needs one consistent shape. One section per batch, in build order:

```markdown
## Batch <n> — <name>
**Status:** done | planned
**Contents:** <what it covers — infra scaffolding, or which use cases / flows>
**Rationale:** <why these things travel together, why sequenced here>
**Verification:** <the concrete action(s) a human takes to confirm it, and — once done — what was actually observed>
```

`build-infrastructure-batch` creates this file with the Batch 1 entry, status `done`, once every checklist item is verified. `plan-build-batches` then reads it, treats Batch 1 as a fixed precondition, and appends Batch 2 onward in the same format as each is proposed and confirmed.

## What this means in practice

- **Infrastructure is always built first, not planned first.** Which ADRs are cross-cutting infrastructure is a mechanical read, not a judgment call — there's nothing to discuss with the developer before building it, only things to verify once it exists. `build-infrastructure-batch` runs directly off the architecture decisions and needs no batch plan to start.
- **The use-case batches are planned second, against a real foundation.** Grouping and sequencing the remaining use cases *is* a judgment call — dependency order, shared implementation surface, splitting an oversized use case — and benefits from the infrastructure already existing rather than being projected, since what the skeleton build actually surfaced can inform how the rest is grouped.
- Every batch after Batch 1 is one or more confirmed use cases (or a deliberate split of one large use case), sequenced by recorded dependency and grouped by shared implementation surface, each ending in something a person can try.
- Every batch plan is proposed, then explicitly confirmed by the developer, before build starts on it — this applies to Batch 1's completion too, not just the later batches' sequencing.
