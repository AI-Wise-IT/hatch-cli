# Product Requirements Document — Skill Registry + Hatch Recipe CLI

## Purpose

The Hatch CLI currently only works when checked out alongside its template content on one machine, because skill/template resolution is a hardcoded path relative to the CLI's own source (`phases.js:19`). This effort splits the system into two independently-versioned repositories — a skill-content repo, organized as a flat collection of standalone skills and skill-groups (folders of related skills that may reference each other, but never across different groups), and a Hatch CLI repo that owns recipe (pipeline) definitions — so skills and groups are fetched from a registry rather than bundled locally, and all cross-group composition/sequencing is the recipe's responsibility. It exists to make Hatch usable from anywhere — including the cloud sessions already in use today and phone-initiated work soon to come — to let skill content be tuned independently of CLI release cadence, and to keep skills and groups independently, externally gradable via the Tessl.io registry by containing any coupling within a group's own boundary.

## Success Criteria

- `hatch import` succeeds on a machine with no local skill/template checkout — skills and groups resolve by fetching from a registry, not from a path relative to the CLI's source.
- Skill content can be updated and published without cutting a new Hatch CLI release.
- A group is always fetched as a whole; no skill is fetched individually out of a group it belongs to.
- No skill or group declares a dependency on a skill in a different group — all cross-group composition is expressed in the recipe.
- Recipes are defined as code in the Hatch CLI repo and version/release together with the CLI.
- flex-exp's global skill folder is retired as a mechanism — its content is migrated once into the new skill repo, and its skills exist afterward only as project-level imports resolved through the CLI.
- Given a project's own manifest, running `hatch import` reproduces that exact same skill set on a different machine.

## Scope

**Must**

- The skill repo supports skill-groups — folders of related skills that may reference each other only within the group — fetched and imported atomically as a whole, never one skill out of a group.
- A single `hatch import` command accepts a skill, a group, or a recipe as its target — one uniform entry point regardless of granularity — and works against any existing project, not only ones originally created by Hatch.
- A configurable target location for a new project, rather than always landing in the current directory.
- A distinct flag or separate command for creating a brand-new project, since that path needs inputs (target location, folder name) that importing into an existing project doesn't.
- Clear, actionable failure when the registry is unreachable at fetch time.
- Before importing anything, `hatch import` validates that every skill/group named in a recipe actually exists in the registry, so a typo fails fast rather than partway through.
- Re-running `hatch import` on a project updates an already-imported skill to the latest compatible version rather than erroring — but never overwrites a skill that's been locally edited since it was imported.
- If a skill (or a whole group) already imported into a project is later deprecated or removed from the registry, the project keeps working unaffected, and `hatch import` surfaces a warning about it.
- Re-running `hatch import` for something already up to date is a no-op.
- A project-level index file is written and updated automatically by `hatch import`, recording every imported skill/group and its version.
- A command to cleanly remove/uninstall a previously-imported skill from a project.
- No two skills in the registry may claim the same destination path — enforced as something scannable within Hatch's own tooling, not a check placed in every target project.
- `hatch import` detects a destination path already occupied by a pre-existing file it didn't place, and fails/flags rather than overwriting it.
- Each `hatch import` stages and commits its own change immediately and deterministically, giving a clean, reviewable diff.
- If a multi-step recipe fails partway through, rollback goes back to the last successful commit and no further — whether a failure takes out one step or several depends on whether a commit checkpoint already separates them, which the recipe author controls.
- If the target directory isn't already a git repo, `hatch import` initializes one so it can make its per-import commits.
- `hatch import` prints a summary of what was added or updated (names + versions) after it finishes.
- Recipe steps execute strictly in order, one fully before the next starts.
- Registry supports private/unlisted skills, reachable via `hatch login` (or equivalent) authentication.
- Harness-targeting (Claude Code, Codex, Cursor, etc.) is expressed structurally in the registry — via folder placement or naming convention, reusing the same mechanism flex-exp already has for harness-specific skills — not via metadata in a skill's own manifest.
- A skill valid for more than one harness is deployed into every relevant harness folder in the same import.
- The project's manifest/index records which harness(es) that project uses, and that record — not filesystem sniffing — governs which harness-specific content gets placed on every import.
- When scaffolding a brand-new project, `hatch import` asks which harness(es) to support up front, recording the answer in the manifest from the start.
- If a project later adopts a new harness, `hatch import` can add it to the manifest and backfill harness-specific content for skills already imported.
- A deprecated/removed group gets the same warning treatment as a single deprecated/removed skill.

**Want**

- A recipe-level cleanup policy/script for one-time-use skills and instructions, so residue doesn't stick around in the target project after a pipeline finishes.
- Recipe steps can pin an exact skill version, for reproducible builds at the recipe-definition level.
- The project manifest also records which recipe (and which Hatch CLI version) produced the current state, not just which skills/groups.
- If a project drops a harness, `hatch import` can remove that harness's placed content and drop it from the manifest.

**Nice**

- A way to list/browse available skills or recipes from the CLI itself.
- A skill or group's manifest shows its Tessl grade/score, visible before you import it.

**No**

- Local caching of fetched skill content for speed or offline use.
- A separate `hatch run` command — resolving a recipe is just `hatch import` given a recipe as its target.
- Leaving a failed, partway-through recipe in a resumable state — a clean restart is fine, provided the rollback-to-last-commit must holds.
- A publish command that moves skills from flex-exp into the registry on an ongoing basis — flex-exp's content is a one-time migration into the new skill repo, after which flex-exp goes away as a concept.
- Gating `hatch import` on "no uncommitted changes" in the target project.
- A pre-commit hook installed into every target project.
- Scriptable/JSON output from `hatch import` — human-readable text stays sufficient for now.
- Auto-detecting whether a target is a brand-new vs. existing project — this is handled explicitly via the flag/command above instead.

## Context

- Solo project — no team, no collaborators to coordinate with.
- Already running cloud sessions with both Claude and Codex today; this isn't a hypothetical future need.
- Plain claude.ai chat won't gain access to these skills through this project; Cowork's status is uncertain — both are accepted boundaries, not gaps this project solves.
- Expects to work more from a phone soon; phone-initiated work always means a cloud-side agent, never local execution.
- Expected workflow shape: projects get composed on the computer first, then continued from the phone afterward.
- `hatch mvp` has drifted into a broken, incoherent state from accumulated changes to templates and pipeline structure — rebuilding is the chosen path over repairing it.
- No harness exists today to evaluate skill quality — this is the reason Tessl.io integration matters.
- A Tessl.io account already exists, but no repository has been uploaded to it yet — a clean slate in practice.
- flex-exp's skills are deployed to a global, machine-local folder, invisible from any cloud session — the concrete forcing function behind leaving local-only behind entirely.
- Existing projects created by the old `hatch mvp` have no ongoing dependency on Hatch after creation, so no migration path is needed for them.
- The mobile-shift timeline is contingent on technical feasibility not yet determined — deliberately left open rather than fixed to a date.
- If this system sits untouched for six months, it's expected to keep working; the main foreseeable risk is credential expiry.
- Client or business-sensitive content may end up flowing through these projects and skills — not knowable in advance, so treated as a real possibility rather than dismissed.
- The goal is a solid working base relatively soon, with AI-assisted development expected to make that pace realistic.

## Constraints

- Client or business data must never leak publicly.
- A project must never become stuck or unable to continue because the skills it depends on moved forward and broke the sequence.
- The system must never overwrite manual drift in an imported skill — a locally changed skill is assumed to have been changed on purpose.
- Registry access must be reachable over the open internet, gated by a single personal password — not built as a public, multi-user app with account management.

---

### Open questions

- Single registry (Tessl only) vs. multiple registries — the CLI's resolver design still depends on this.
- The concrete schema of a recipe-as-code (step shape, ordering/placement rules, and specifically how a recipe author marks a group of steps as one atomic commit vs. independently-committing steps).
- The concrete skill manifest shape — confirmed to exclude harness-targeting metadata, which is expressed structurally instead.
- The concrete structural mechanism for harness-targeting (folder convention, naming convention, or something else) — should reuse flex-exp's existing approach, but that hasn't been inspected yet.
- How recipe-level exact-version pinning (want) reconciles with reimport's "update to latest compatible" auto-update (must) when both apply to the same skill.
- Whether the lightweight project-index file (want) is sufficient against the "never get stuck" constraint, or whether the fuller version-pinning/lockfile design parked alongside `hatch recover` needs revisiting after all.
- Whether a single shared password is an adequate security boundary given client/business data may pass through the system — accepted as a starting point, not vetted.
- Three territories were raised but explicitly deprioritized without a formal verdict: notification beyond the post-import summary, discovery/search filtering beyond basic browsing, and skill-manifest metadata visibility beyond the Tessl-grade nice-to-have. Still open if revisited.

### For the sequencing step

- Prioritized Must/Want/Nice/No list is the Scope section above.
- Dependency notes: the harness-placement musts (manifest-driven, asked up front, backfilled on new harness) depend on the project-index/manifest mechanism existing first. The new-project flag/command depends on the target-location must. `hatch login` needs to ship before or alongside private-skill support, which is unusable without it. Git auto-init must precede commit-per-import.
- No timing/sequencing remarks (e.g. "v2," "eventually") were made during scoping — every verdict given was a judgment of essentialness, not timing, so there's nothing deliberately deferred-but-unlogged here.

### For the architecture step

- **Tessl.io** — named as the external skill-grading registry; an account already exists, no repository uploaded yet. Held firmly as the grading mechanism, not just a suggestion.
- **flex-exp** — named as the source of seed skill content and of an existing harness-targeting mechanism to reuse. Not yet inspected for compatibility with the new design.
- **git** — implied throughout (commit-per-import, rollback-to-last-commit, auto-init if missing) and reasoned about in real detail (atomic vs. independent commit boundaries) — held firmly enough to treat as settled behavior, though the underlying mechanics weren't architected here.
- **PowerShell** — mentioned only as an analogy (piped vs. loose commands) to explain a rollback-boundary concept, not a technology choice.
- Recovery instinct: rollback should only ever revert to the last successful commit, never further; whether steps share one atomic commit or commit independently should be a property the recipe author controls in the recipe schema.
- Observability instinct: human-readable text output is sufficient; no scriptable/JSON output wanted at this stage.
- Security posture named but undesigned: internet-reachable registry, single personal password, explicitly not a public app with account management — how to do this safely, especially with possible client data in play, is unresolved.
- Explicitly declined to interview: the technical mechanics of giving a cloud-running agent access to the registry, raised directly by the user during Context and deferred to this step on purpose.
