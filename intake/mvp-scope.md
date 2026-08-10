# MVP Scope — Skill Registry + Hatch Recipe CLI

Decision record from the MVP-scoping step, based on `intake/product-requirements.md`. Captures what shipped in this build and why, and what didn't. Not living documentation — a later re-scoping decision is a new record, not a rewrite of this one.

## Confirmed in-scope goals

- **[Bootstrap a New Project](../docs/use-cases/bootstrap-new-project.md)** (UC-1) — `hatch new` scaffolds a project at a chosen location, authenticates, initializes git, records harness selection(s) in the manifest, imports a fixed self-documentation skill (new — added during this step, not in the original PRD) so any agent knows how to use Hatch from the start, and commits it all as one initial commit.
- **[Authenticate to the Registry](../docs/use-cases/authenticate-to-registry.md)** (UC-2) — `hatch login` authenticates against the whole registry (private in full, single shared password, no public/private split) for use by subsequent commands.
- **[Import Skill/Group Content into a Project](../docs/use-cases/import-content.md)** (UC-3) — `hatch import` fetches a skill or group (never a recipe — see exclusions) into any existing project, handling first-time import, update-to-latest-compatible, local-edit protection, deprecation warnings, harness placement/backfill, and destination-path conflicts.
- **[Remove Content from a Project](../docs/use-cases/remove-content.md)** (UC-4) — `hatch remove` cleanly removes a previously-imported skill, group, or harness, protecting local edits and manifest/disk consistency.
- **[Prevent Destination-Path Collisions Across the Registry](../docs/use-cases/prevent-path-collisions.md)** (UC-5) — a CI check on the skill-content repo that reports (never auto-fixes) any two skills/groups claiming the same destination path.

## Exclusion register

Every item below is out of this MVP. Reason and deferred/permanent status noted for each.

### Deferred — recipes carved out entirely

The user judged recipes as unlikely to be used soon and as needing further design refinement before building against them, so all recipe-specific scope was pulled out of this build in one pass during Phase 3. Waiting on: recipe design being revisited by the user.

- **Must — recipe pre-flight validation.** "Before importing anything, `hatch import` validates that every skill/group named in a recipe actually exists in the registry." Without recipes, a single skill/group import has no multi-step partial-failure state to protect against, so this item is moot as well as deferred.
- **Must — recipe rollback on partial failure.** "If a multi-step recipe fails partway through, rollback goes back to the last successful commit and no further." No multi-step recipe, no partial-failure state.
- **Must — strict recipe step ordering.** "Recipe steps execute strictly in order, one fully before the next starts." No recipe, no steps.
- **Want — recipe-level cleanup policy** for one-time-use skills/instructions.
- **Want — recipe steps pinning an exact skill version.** (Also resolved, if revisited: a pin would only govern the initial install: re-imports still auto-update to latest compatible per the Must in UC-3, since a permanent pin would conflict with that Must.)
- **Want — project manifest recording which recipe (and Hatch CLI version) produced the current state.**
- Must #2's scope was trimmed rather than fully cut: `hatch import` accepts a skill or a group as target for this MVP; "or a recipe" is dropped until recipes return.

### Deferred — other

- **Nice — list/browse available skills or recipes from the CLI itself.** No specific trigger for revisiting; simply not essential for the first build.
- **Nice — a skill/group's manifest shows its Tessl grade/score before import.** Waiting on Tessl grading actually being usable — per the PRD's Context, no harness exists yet to evaluate skill quality, so there's nothing to show yet regardless.
- **Logout.** Raised as a new candidate while writing UC-2 (Authenticate to the Registry) — the PRD never mentioned it. Deferred for now; no session-invalidation mechanism exists in this MVP. Revisit if a concrete need for it comes up.

### Permanent — from the PRD's own "No" list

- Local caching of fetched skill content for speed or offline use.
- A separate `hatch run` command — resolving a recipe was meant to just be `hatch import` given a recipe as target; moot for now with recipes deferred, but the decision itself (no separate run command) stands regardless of when recipes return.
- Leaving a failed, partway-through recipe in a resumable state — a clean restart is fine; rollback-to-last-commit is the only guarantee. Also moot while recipes are deferred, but the decision stands for whenever they return.
- A publish command that moves skills from flex-exp into the registry on an ongoing basis — flex-exp's content is a one-time migration; flex-exp goes away as a concept afterward.
- Gating `hatch import` on "no uncommitted changes" in the target project.
- A pre-commit hook installed into every target project.
- Scriptable/JSON output from `hatch import` — human-readable text stays sufficient for now.
- Auto-detecting whether a target is a brand-new vs. existing project — handled explicitly via the distinct `hatch new` command instead.
