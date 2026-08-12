# The Invariant Framework — Reference

Distilled grounding for `pre-launch-audit` and `pre-launch-harden`. Cite this reasoning when explaining a finding or a recommendation — don't re-derive it from scratch each time.

## The core idea

Irreversibility isn't a property of a rule — it's a property of who's watching. Hyrum's Law: given enough consumers of a system, every observable behavior — documented or not — becomes something somebody depends on. A name, a version number, a schema shape, an API signature: none of these are inherently permanent. They become permanent the moment a real external dependent (a user, another team, a published artifact, live production data) starts relying on them existing, and not one moment before.

This reframes "pre-launch cleanup" away from a calendar concept ("before we ship") and toward the actual question: *does an observer exist yet for this specific rule?* Different rules in the same project can cross that line at different times.

## Two operations that get conflated

- **Purge** — remove something that only exists because of internal development and would otherwise become permanently locked in by a rule meant to protect real content. This is a one-time, use-it-or-lose-it window: once enforcement goes blocking, removal stops being an ordinary change and becomes a breaking one.
- **Harden** — flip a rule's enforcement from advisory to blocking. This doesn't change the rule; it changes who it's being enforced against, going forward.

Keep these distinct. A purge decision (is this specific artifact safe to remove) is not evidence the underlying rule is wrong or temporary — the rule is very likely correct and permanent; what's temporary is only the current, still-growing population of things it hasn't started protecting yet.

## The trap

The single most common failure: the enforcement mechanism built for a rule often goes live — and starts actually blocking — long before anyone declares the project launched, because it's easiest to build and test against real activity while nobody's watching closely for the "is this the moment we go live" question. By the time someone thinks to ask, the guard has already been quietly protecting things for a while, and the purge window has partially or fully closed without anyone deciding it should. This is what `pre-launch-audit`'s drift check exists to catch, and it should be run repeatedly through a build — not only once, right before a planned cutover — because this failure doesn't wait for anyone's schedule.

## What "keep" looks like even when something looks like a fixture

Not everything that looks like scaffolding is disposable. If an artifact is cited by name as real evidence in a project's own build, verification, or test record, it's working infrastructure that happens to be informally named — not cruft. Treat "referenced anywhere as real evidence" as a strong presumption toward keep, and require a genuine absence of any reference before calling something a purge candidate. Getting this backwards — flagging load-bearing regression fixtures as cleanup targets because they're named like test data — is a real, easy-to-make mistake, not a hypothetical one.

## How mature ecosystems formalize the same boundary

- **SemVer's pre-1.0 convention**: `0.x.y` is unstable by declared convention — anything may break. Moving to `1.0.0` is a declared promise, not a technical event: "this shape now holds value and is a contract."
- **Kubernetes' alpha → beta → stable graduation**: a three-tier model with explicit, checkable graduation criteria (soak time, no changes for N releases) rather than a vibe-based judgment call — alpha resources can vanish without notice, beta gets a real but shorter deprecation guarantee, only stable gets the full backward-compatibility promise.
- **npm's immutable-registry policy**: once published beyond a short grace window — and only while nothing depends on it yet — a package version can never be reused, only deprecated. The grace window is keyed on *dependents existing*, not elapsed time.
- **The expand/contract pattern**: the mechanism you fall back to once something live needs a breaking change — add the new shape alongside the old, migrate consumers, remove the old shape only once nothing uses it. Expensive by design; it's the cost of having real dependents. The entire value of a pre-cutover purge is getting the same outcome for free while it's still just an edit.
- **Operational/Launch Readiness Reviews**: formalize the cutover itself as a gated, checklist-driven event with a named artifact (a date, a tag, a commit) — not a vibe. The structure, not the specific checklist items, is the transferable part.

## The seven-step pattern these two skills implement

1. Classify invariants — irreversibility-bearing vs. purely internal.
2. Build enforcement early, keep it advisory (non-blocking) until a deliberate cutover.
3. Name an explicit cutover — a tag, commit, or date, not a milestone description.
4. Purge what's genuinely unreferenced, immediately before cutover — this is `pre-launch-audit`'s classification job.
5. At cutover, flip enforcement to blocking and remove any bypass — this is `pre-launch-harden`'s job.
6. After cutover, route further change through graduated-change tooling (expand/contract, deprecation, major-version bumps), not ad hoc edits.
7. Periodically audit for drift — a mechanism that went blocking before anyone named a cutover. Run `pre-launch-audit` repeatedly, not once.
