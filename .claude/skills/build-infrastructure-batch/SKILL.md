---
name: build-infrastructure-batch
description: Builds and verifies the mandatory first batch of any MVP build — project infrastructure and skeleton (CI/CD, branch protection, test runner, lint/format, deployment target, database connectivity, versioning automation, and any other cross-cutting scaffolding the settled architecture decisions call for) — before any use-case-specific product code exists. This is the first build step of an MVP, run directly from architecture decisions as soon as they're settled — it needs no batch plan to start, because which ADRs are cross-cutting infrastructure is a mechanical read, not a judgment call. Use this before plan-build-batches, not after — "set up the project scaffolding," "build the skeleton first," "stand up CI before we build features," "start the build." The batch is human-verifiable without any product feature existing: push/commit/branch behavior, CI running, an empty skeleton app deployed and reachable, and each integration (database, auth provider, etc.) connecting. Creates docs/build-plan.md with the confirmed Batch 1 entry, which plan-build-batches then reads and appends to for the remaining use-case batches. Does not decide the batch sequence for subsequent batches (plan-build-batches' job) and does not make new architecture or technology decisions — if scaffolding surfaces a gap no ADR covers, defer to write-architecture-decision.
---

# Build Infrastructure Batch

You are building the first, mandatory batch of the MVP: project infrastructure and skeleton, with no product feature behavior yet. This batch exists because nothing else can be reviewed as a coherent, demoable whole once quality gates are active until the gates themselves exist. It is the walking skeleton (Cockburn): a thin, real connection through every layer of the stack, proven end to end, before any layer gets real content. See `plan-build-batches/references/batching-criteria.md` for the full reasoning if you need it.

Run this before `plan-build-batches`, not after. Deciding *that* infrastructure is Batch 1 needs no dialogue — it's always true — so there's no reason to hold it behind a planning conversation about the use-case batches, which does need judgment. Building the skeleton first also means the remaining batches get planned against a real, working foundation instead of a projected one.

## Inputs

Read every accepted architecture decision under `docs/architecture/decisions/` (and its `README.md` index). Extract only what's cross-cutting infrastructure — not use-case-specific product behavior: CI/CD workflow, branch protection rules, test runner setup, lint/format setup, deployment target, database/connectivity, versioning and tag automation, manifest/schema migration skeleton, and anything else in the same category.

`docs/build-plan.md` will not normally exist yet — this skill creates it. If it does exist already (e.g. `plan-build-batches` was run first on an earlier project), read it, confirm Batch 1's scope still matches, and proceed to update rather than recreate it.

## Workflow

1. **Build the checklist.** Translate every relevant ADR into one or more concrete, buildable, human-verifiable behaviors. One row per behavior: which ADR it comes from, what it requires, and the concrete action that verifies it.
2. **Flag what you can't do yourself.** Some infrastructure is account-level, not code — e.g. enabling GitHub branch protection may require repo-admin permissions beyond what's available to you. Tell the developer exactly what to click or run, and wait for confirmation it's done, rather than silently skipping it or assuming it happened.
3. **Implement the scaffolding.** CI/CD workflow files, lint/format/test tooling config, versioning/tag automation, manifest/schema migration skeleton if applicable, deployment config, database/connectivity wiring. If the architecture includes a deploy target, deploy an empty or skeleton version of the app — so "does it appear online" is directly testable, not just "does the build succeed locally."
4. **Verify with the developer, one checklist item at a time.** For example: push a commit and confirm CI runs; open a PR and confirm the required checks gate merge; attempt a direct push to the protected branch and confirm it's blocked; confirm the skeleton app is reachable at its deployed URL; confirm the database connects (a trivial read/write or a health-check endpoint). Do not mark an item done from reading the config — the developer must actually observe the behavior.
5. **Record completion.** Once every checklist item is verified and the developer confirms, write (or update) `docs/build-plan.md` with a Batch 1 entry: name ("Infrastructure & Skeleton"), contents (the scaffolding built), rationale (always first — the walking-skeleton reasoning above), verification (the checklist and how each item was confirmed), status `done`. This is the same file `plan-build-batches` reads next and appends Batches 2+ to — use the format in `plan-build-batches/references/batching-criteria.md` so the file stays consistent across both skills.

## Throughout

This skill scaffolds infrastructure only — no product or use-case behavior, no new architecture decisions. If an ADR is silent on something this batch needs, stop and route it to `write-architecture-decision` rather than choosing silently.

Once this batch is verified and recorded, hand off to `plan-build-batches` to sequence the remaining use cases into Batches 2+.

All output must be in English.

## Completion

Before treating this step as complete, verify:

- [ ] Every cross-cutting ADR requirement has a corresponding scaffolded piece and a checklist entry.
- [ ] Every checklist item was verified by the developer directly observing the behavior, not inferred from code.
- [ ] Any account-level or manual action outside this skill's reach was explicitly handed to the developer, not silently skipped.
- [ ] `docs/build-plan.md` exists and records Batch 1 as done, in the shared format.
- [ ] No use-case-specific product behavior was built in this batch.
