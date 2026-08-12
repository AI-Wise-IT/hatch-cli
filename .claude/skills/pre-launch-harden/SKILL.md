---
name: pre-launch-harden
description: Executes a one-time, developer-confirmed cutover that flips a project's pre-launch invariants from advisory to blocking enforcement, and finalizes any agreed cleanup of artifacts that would otherwise become permanently locked in once real external dependents exist. Requires an explicit, named cutover statement from the developer (a tag, commit, or date tied to "we are now launching") before touching anything — never infers a launch from context or enthusiasm. Use this when the developer says things like "let's do the pre-launch hardening," "we're about to launch, lock these down," "flip the invariants to enforced," "do the cutover," or wants to finalize what's safe to clean up before going live. Always runs pre-launch-audit first (or confirms its report is current) — this skill acts on that report rather than rediscovering invariants itself. Never bulk-enables or bulk-deletes anything; walks through each invariant and each purge candidate individually with the developer, and verifies each flip by observing real behavior rather than trusting configuration. Works for any kind of invariant and any kind of enforcement mechanism, not one specific stack.
---

# Pre-Launch Harden

You are executing a deliberate, irreversible cutover: flipping a project's invariants from "detected but not enforced" to "actually enforced," and finalizing whatever cleanup needed to happen before that flip made it permanent. This is the one skill in the pre-launch pair allowed to change anything, which is exactly why it moves slowly and confirms constantly. Read `pre-launch-audit`'s `references/invariant-framework.md` if you haven't already — the same reasoning about irreversibility being earned by real dependents, not declared by a calendar, governs every step here.

## Inputs

- **`pre-launch-audit`'s most recent report** (`docs/pre-launch-audit.md` by default, or wherever the developer says it was written). If none exists, or the developer isn't confident it reflects the current state of the codebase, run `pre-launch-audit` first rather than acting on stale information — this skill has no invariant-discovery logic of its own by design, so a stale or missing report is a hard blocker, not a shortcut to route around.
- **The project's decision records**, to update each hardened invariant's documented mode afterward and keep documentation in sync with reality.

## Phase 1 — Confirm the cutover, explicitly

Before doing anything else, ask the developer to name the cutover directly: is this project launching now, tied to a concrete marker (a git tag, a commit, a release date)? Don't proceed on general enthusiasm ("yeah let's harden things") without pinning it to something specific — the point of naming it is that anyone reading the record later, including a future version of you, can answer "was this artifact created before or after we went live" without ambiguity. If the developer isn't ready to name a concrete cutover, stop here. Rushing this gate defeats the entire purpose of having it.

## Phase 2 — Resolve urgent drift first

If the audit report flagged any invariant already blocking with no recorded cutover, handle it before the deliberate flips in Phase 3. It's already had real, unplanned effect — treat it as a separate, higher-priority conversation ("this has been blocking people/cleanup for a while without anyone deciding that — do we want that, and since when has it actually been true?") rather than folding it silently into the batch of intentional changes.

## Phase 3 — Flip each advisory invariant, one at a time

For every invariant the audit report found `advisory`:

1. Confirm with the developer that this specific invariant is in scope for this cutover (a project might harden invariants in stages rather than all at once — don't assume "all of them, now" without asking).
2. Make the actual, mechanism-specific change that makes enforcement real — this varies completely by what the mechanism is: adding a check to a CI required-status-check list, tightening a database constraint, removing a feature flag's escape hatch, publishing a `1.0.0` tag, closing an API's beta annotation. There's no universal action here; use whatever fits the real mechanism, the same way `pre-launch-audit` had to inspect it directly rather than through one standard method.
3. Verify it's actually blocking now by observing real behavior — attempt the forbidden action for real (or the closest safe approximation) and confirm it's rejected. Don't mark this done from reading the new configuration; the discipline is the same one `build-infrastructure-batch`-style skills apply to their own verification steps.

## Phase 4 — Resolve each purge candidate individually

For every artifact the audit report classified as a genuine purge candidate, confirm individually with the developer before removing anything — never bulk-delete on inferred intent, even when every candidate looks equally disposable. For anything the audit report left ambiguous, force an explicit decision now rather than defaulting either way; ambiguity that survives to this point is a real judgment call, not something to guess at.

## Phase 5 — Record the cutover

Write a durable, dated record of what just happened: the named cutover marker (tag/commit/date), every invariant that flipped from advisory to blocking, and what — if anything — was purged. This is the artifact a later drift-audit, or a teammate joining later, reads to know the cutover actually happened and when — the same role `docs/build-plan.md`-style batch records play elsewhere in this project's build history. A reasonable default location is `docs/pre-launch-cutover.md`, appending a new entry per cutover if this ever happens more than once (e.g. a project that hardens invariants in stages).

## Phase 6 — Sync documentation

Update every hardened invariant's entry in its source decision record, changing its documented mode from `advisory` to `blocking`. Don't leave the record claiming something weaker than what's now actually true — that mismatch is exactly what `pre-launch-audit` exists to catch on some future run, and it shouldn't have to catch its own sibling skill's leftovers.

## Throughout

- Never infer a cutover from context — always get the developer's explicit, named confirmation before Phase 3 or Phase 4 touches anything.
- Never act on a stale or absent audit report — run `pre-launch-audit` first if needed.
- Never bulk-act — every enforcement flip and every purge decision gets its own confirmation, even when the developer expresses general agreement with the whole plan.
- Once an invariant is blocking, any future need to change it is out of this skill's scope — it goes through graduated-change tooling (expand/contract, a deprecation flag, a major-version bump), which this skill doesn't design or execute.
- All output must be in English.

## Completion

Before treating this cutover as complete, verify:

- [ ] The cutover itself was explicitly named by the developer (a concrete tag/commit/date), not inferred.
- [ ] Any urgent drift from the audit report was resolved as its own conversation, not folded silently into the deliberate flips.
- [ ] Every invariant flipped to blocking was verified by observing real rejected behavior, not by reading its new configuration.
- [ ] Every purge candidate was confirmed individually before removal; nothing was bulk-deleted.
- [ ] Every ambiguous artifact from the audit report was explicitly resolved, not silently defaulted.
- [ ] The cutover was recorded as a durable, dated artifact.
- [ ] Every hardened invariant's mode was updated from `advisory` to `blocking` in its source decision record.
