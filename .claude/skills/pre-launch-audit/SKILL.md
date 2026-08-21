---
name: pre-launch-audit
description: Scans a project for "invariants" — rules that become permanent or costly to reverse once a real external dependent exists (a user, another team, a published artifact, live production data) — and checks whether their actual, current enforcement matches what's documented. Read-only: never modifies anything, only reports. Use this any time during a build, not only right before a launch — run it repeatedly, since its most important job is catching "enforcement drift": a check, constraint, or gate that quietly started blocking real activity before anyone declared the project live. Trigger this whenever the developer asks to audit invariants, check for pre-launch drift, see what's already locked in, wants a pre-launch checklist, asks whether it's safe to clean something up or delete/rename something, or is preparing for a v1.0/GA/launch cutover and wants to know what's already active versus still safe to change. Also the mandatory first step before pre-launch-harden, which acts on this skill's report. Works for any kind of invariant — a database schema, a public API, a package name, a config format, an infrastructure rule — not just one specific mechanism.
---

# Pre-Launch Audit

You are checking a project's irreversible-once-live rules against reality. Every real system accumulates rules that are cheap to break during development and expensive or impossible to break once someone outside the build depends on them — a name, a schema shape, an API contract, a version history. The problem this skill exists to catch is specific and has already happened for real in at least one project this skill family was built for: an enforcement mechanism (a CI check, in that case) went live and started blocking real activity weeks before anyone had actually decided the project was launching — quietly closing a cleanup window nobody meant to close yet. Read `references/invariant-framework.md` before your first run if you haven't internalized this reasoning yet; it's the "why" behind every step below, not background reading to skip.

This skill only reads and reports. It never edits a file, never touches a CI config, never deletes anything — that's `pre-launch-harden`'s job, gated on a developer confirmation this skill never asks for. Run this skill early and often; its value comes from catching drift while it's still cheap to fix, not from being a one-time pre-launch ceremony.

## Inputs

- **The project's decision records.** Default: `docs/architecture/decisions/*.md`, written by a `capture-adrs`-style skill, each carrying an `## Invariants` section (rule, trigger condition, enforcement mechanism, current mode: `not-yet-built` | `advisory` | `blocking`). If this project doesn't use that convention, don't assume it's absent — ask the developer directly where "this must never change once X" facts get recorded, or look for the nearest equivalent (a README section, a design doc, an onboarding wiki page). A project with no formal record of its invariants can still be audited from the developer's own account of what's meant to be permanent — treat that as a lower-confidence but still real input.
- **The project's build, verification, or test history** — whatever exists (`docs/build-plan.md`, a CHANGELOG, a test-fixtures directory, commit history, a QA log). You need this to tell load-bearing evidence apart from genuine cruft in Phase 3.
- **The actual, current state of every enforcement mechanism named in an Invariants entry** — you have to go look, not trust the label. What "look" means depends entirely on what the mechanism is: a CI workflow file and its required-status-check list, a database migration and its constraints, a runtime guard in application code, a type system, a package registry's publish settings, a feature flag's default. Use whatever tool fits the mechanism (read the config file, query the relevant API, grep the code) — there's no single universal command for this.

## Workflow

1. **Collect every invariant.** Read every decision record's `## Invariants` section (or the developer's equivalent account). For each entry, note: the rule itself, the condition that makes it irreversible, its claimed enforcement mechanism, and its claimed mode.

2. **Verify claimed enforcement against real enforcement.** For each invariant, go look at the actual mechanism and determine its real current state — not-yet-built, advisory (runs/detects but doesn't block), or blocking (actually prevents the forbidden action right now). Compare against what's documented. A mismatch in either direction matters: a record that says `blocking` but the mechanism is actually toothless is a false sense of safety; a record that says `advisory` but the mechanism is actually blocking is the drift failure this skill exists to catch — flag this second case as urgent, since it may already be causing accidental lock-in nobody decided on.

3. **Classify affected artifacts.** For any invariant whose trigger condition implies specific artifacts could become permanently constrained (particular names, entries, records, schema fields), inventory the candidates and classify each:
   - **Keep** — referenced anywhere in the project's own build, verification, or test history as real evidence. Treat this as a strong presumption; per `references/invariant-framework.md`, something that looks like a disposable fixture is very often working infrastructure that's just informally named. Don't flag it for removal because of its name alone.
   - **Purge candidate** — genuinely unreferenced anywhere you can find. State where you looked and found nothing, not just that you assume it's unused.
   - **Ambiguous** — real uncertainty (e.g. referenced once, long ago, unclear if still relevant). Don't force these into keep or purge; say what's uncertain and what would resolve it.

4. **Write the report.** Produce a structured report covering:
   - Invariants with no enforcement built yet — a build gap, not urgent unless launch is imminent.
   - Invariants correctly advisory — on track, awaiting a deliberate cutover.
   - Invariants already blocking with no recorded cutover — **urgent drift**, surfaced first and separately from everything else.
   - Every classified artifact, with its category and the reasoning trace that produced it.

   Save this to a durable, project-relative location — `docs/pre-launch-audit.md` is a reasonable default if the developer doesn't specify one — overwriting the previous run's content with a fresh snapshot (this is a current-state report, not an accumulating log; the project's own git history already preserves prior runs if anyone needs them). Also present the urgent-drift and purge-candidate findings directly to the developer in your response — don't make them go open a file to learn something time-sensitive.

## Throughout

- Never modify anything — no file edits outside writing your own report, no CI/config changes, no deletions. If you find yourself about to fix something rather than report it, stop; that's `pre-launch-harden`'s job, and it has a confirmation gate this skill deliberately doesn't.
- Don't assume a project's invariants live in ADRs specifically — the concept (a rule that becomes permanent once a real dependent exists) is universal even when the recording convention isn't.
- Don't classify an artifact as a purge candidate on a name pattern or a hunch. Only classify it that way after actually checking for references and finding none.
- All output must be in English.

## Completion

Before treating this run as complete, verify:

- [ ] Every invariant found in the project's decision records (or the developer's account) was checked, not sampled.
- [ ] Each invariant's real enforcement state was verified by inspecting the actual mechanism, not inferred from its documented mode.
- [ ] Any invariant found blocking without a recorded cutover was flagged as urgent drift, separately from ordinary findings.
- [ ] Every artifact classification (keep/purge-candidate/ambiguous) states the reasoning and where you looked, not just a label.
- [ ] The report was written to a durable location and the time-sensitive findings were also surfaced directly to the developer.
- [ ] Nothing was modified, deleted, or reconfigured during this run.
