# Re-scope 0001: standalone `hatch import` version pinning

## Metadata

- **id:** rescope-0001-standalone-version-pinning
- **supersedes (partially):** `intake/mvp-scope.md`'s exclusion-register entry "Want — recipe steps pinning an exact skill version" (under "Deferred — recipes carved out entirely")
- **decision_record:** `intake/rescope-0001-standalone-version-pinning.md`

`intake/mvp-scope.md` is a decision record, not living documentation: "a later re-scoping decision is a new record, not a rewrite of this one." This file is that new record. `intake/mvp-scope.md` itself is left unedited.

## What changed

The original PRD (`intake/product-requirements.md`) only ever specified version pinning as a **recipe-step** capability: "Recipe steps can pin an exact skill version, for reproducible builds at the recipe-definition level" (Want). When MVP scoping cut recipes wholesale ("the user judged recipes as unlikely to be used soon and as needing further design refinement before building against them"), pinning went with them — not on its own merits, but as a casualty of the whole recipe surface being deferred.

The developer has now decided, in conversation (during Batch 6), to pull version pinning back into scope as its own standalone `hatch import` capability — decoupled from recipes entirely, modeled on the established npm (`1.2.3` exact / `^1.2.0` range) and pip (`==1.2.3` / `~=1.2.0`) conventions. Recipes themselves remain fully deferred and out of scope; nothing else from that exclusion-register entry is revived.

## The open question this resolves

The original PRD flagged, and never answered, exactly the question this re-scope had to settle before it could be built: "How recipe-level exact-version pinning (want) reconciles with reimport's 'update to latest compatible' auto-update (must) when both apply to the same skill." (`intake/product-requirements.md`, Open questions.) Cutting recipes made the question moot at the time; reviving pinning as a standalone capability makes it live again.

Resolved directly with the developer:

- **An exact pin (`<name>@<version>`) is sticky.** It persists in the project manifest and is respected by every later `hatch import <name>` touching that skill/group — re-import's existing auto-update Must does not override a standing pin. To move off a pin, the developer explicitly re-pins to a different version or requests `hatch import <name>@latest`, which clears the pin and resumes normal auto-update tracking. (Chosen over a "one-shot" pin — governing only the moment of install and reverting to auto-update on the very next re-import — because a one-shot pin doesn't actually deliver the PRD's own stated motivation, "reproducible builds.")
- **A range/floor pin (`<name>@^<version>`) is also in scope, as a recorded, visible minimum-version constraint — not a resolution constraint.** In this system, "no version given" already means "latest compatible, same MAJOR" (the existing AF-2 Must), so a range pin resolves and updates identically to an unpinned import at fetch time; a range-pinned skill continues to auto-update on every re-import exactly as an unpinned one would. Its only effect is recording the developer's intentional floor in the manifest for visibility/documentation — it does not gate or validate that floor against anything in this scope.

## Scope

**In scope**, folded into Batch 7 (re-import & staleness) rather than treated as a separate batch, since pin-vs-auto-update is fundamentally the same re-import-semantics machinery Batch 7 already builds (AF-1/AF-2/AF-3):

- `hatch import <name>@<version>` — exact pin, sticky across re-imports.
- `hatch import <name>@^<version>` — range/floor pin, metadata-only, does not change update behavior.
- `hatch import <name>@latest` — explicit unpin, resumes normal auto-update tracking.
- Re-import respecting an exact pin (skip auto-update, report pinned) instead of auto-updating.
- The manifest recording each skill/group's pin state (exact, range, or none) — shape left to Batch 7's implementation, the same way Batch 6 left the group-membership manifest shape to its own implementation once the capability was scoped.

Use case doc updated to reflect this: `docs/use-cases/import-content.md` (UC-3) — main flow steps 1/4/7, new AF-10 (re-import respects an exact pin), AF-11 (import specifies an exact pin), AF-12 (import specifies a range/floor pin), and three new Business Rules distinguishing this standalone pin mechanism from a group's internal pointer-member pin (AF-9, ADR-0013/0016 — resolved fresh per import, never persisted).

**Still out of scope, unaffected by this re-scope:**

- Recipes themselves — schema, pre-flight validation, rollback, step ordering — remain fully deferred per `intake/mvp-scope.md`, waiting on recipe design being revisited.
- Validating a range pin's floor against anything (e.g. refusing an import that would resolve below a recorded floor) — the range pin is descriptive only in this scope.
- A project-manifest record of which recipe/CLI version produced the current state — still deferred with recipes.

## Consequences

- Batch 7's contents grow to include AF-10/AF-11/AF-12 alongside its original AF-1–AF-4 scope; `docs/build-plan.md`'s Batch 7 entry is updated accordingly as part of this re-scope.
- Batch 7's manifest work now needs a pin-state field per skill/group entry, likely another schema migration (v2 → v3) alongside whatever AF-1–AF-4 already require — an implementation decision for that batch, not fixed here.
- No architecture decision record exists yet for the pin-state manifest shape or the version-string parsing (`@1.2.0` vs `@^1.2.0` vs `@latest`); Batch 7's build should record one (extending or following the pattern of [0009-skill-versioning-semver-tags](../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) and [0017-manifest-schema-v2-group-membership](../docs/architecture/decisions/0017-manifest-schema-v2-group-membership.md)) rather than deciding the shape silently.
