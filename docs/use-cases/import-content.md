# Use Case: Import Skill/Group Content into a Project

## Overview

- **ID:** UC-3
- **Name:** Import Skill/Group Content into a Project
- **Primary Actor:** Developer (including a cloud agent acting unattended on the developer's behalf)
- **Outcome:** The named skill or group is present in the target project — correctly placed per the project's declared harness(es), recorded in the manifest, and committed as its own reviewable change. Covers first-time import, re-import (update/no-op/local-edit protection/pin-respecting), optionally pinning an exact or floor version, and adding a harness to a project already using Hatch. Works against any project that `hatch init` has initialized, however that project was originally created.

## Preconditions

- The target is an existing project directory (may or may not have been created by Hatch).
- The registry is the sole source of skill/group content, and the whole registry is private — every import requires an authenticated session (see UC-2).
- The caller knows the target's name. [UC-6](discover-registry-content.md) is where that name comes from: `hatch list` prints every importable name, and every name it prints is one this use case accepts.

## Main Success Scenario

1. Developer/agent runs `hatch import <skill-or-group-name>[@<version>]` against a target project directory — optionally pinning an exact version (`@1.2.0`) or a range floor (`@^1.2.0`).
2. System checks whether the target project has a manifest; if not, it aborts and names `hatch init`. It also notes whether the project is a git repository root, warning if it isn't.
3. System checks for an authenticated session; if none exists, prompts inline for the registry password and authenticates.
4. System fetches the named skill — or, if it's a group, the whole group atomically — from the registry, at the given version if one was pinned, otherwise at the latest version the project may auto-apply (AF-1, AF-12).
5. System checks each destination path the content would occupy is not already taken by something Hatch didn't place there.
6. System places the content into every harness folder the project declares support for.
7. System writes/updates the project manifest, recording the skill/group, its version, and its pin state (exact, range, or none).
8. System commits the entire import as a single commit.
9. System prints a summary of what was added (names + versions).

## Alternative Flows

### AF-1: Re-import — already up to date
Triggered when the developer re-runs `hatch import` for a skill/group already at the latest compatible version.
- System reports it's already up to date.
- No changes are made, no commit is created.
- For a group, this is established by resolving the member graph and finding that the group's own version, every member's resolved version, and the recorded pin all match what the project already holds. A group's members are resolved before the no-op is reported, never inferred from the group's own version standing still — a caret-constrained member (AF-9) resolves against the registry's current tags and can move while the group does not.
- Terminates in Success.

### AF-2: Re-import — update available, no local edits
Triggered when a newer compatible version exists and the placed content is unmodified since import.
- System fetches and places the updated content, updates the manifest version, commits, and reports the version change (e.g. "X updated v1 → v2").
- For a group, "a newer version exists" covers a member that moved on its own: a caret-constrained pointer resolving higher within its MAJOR updates that member even when the group's own version is unchanged, with no edit to the group's content needed to make it happen.
- Terminates in Success.

### AF-3: Re-import — local edits present
Triggered when the placed content differs from what was originally imported.
- System does not overwrite it.
- System reports that the skill has local edits and was not updated.
- Terminates in Success — respecting a local edit is the correct outcome, not a failure.

### AF-4: Deprecated or removed skill/group detected
Triggered on every `hatch import` run, regardless of what's being explicitly imported — system checks all already-imported skills/groups against the current registry state.
- If any are deprecated or removed, the project is left working unaffected.
- System surfaces a warning listing them, alongside whatever the primary command was doing.
- Terminates in Success alongside the primary outcome.
- "Removed" means the registry has flagged the skill/group as removed in its own metadata, not that it was deleted — registry names are permanent and never deleted or reused (see ADR-0013), so the flagged item's content remains fetchable if still referenced (e.g. by a group pointer); only its status changes.

### AF-5: Add a harness (backfill)
Triggered by `hatch import --add-harness <name>`, with no skill/group target.
- System validates the harness name.
- System adds the harness to the manifest.
- System places every already-imported skill/group's content into the new harness's folder.
- System commits this as a single commit.
- System reports the harness added and which skills were backfilled.
- Terminates in Success.

### AF-6: Destination occupied
Triggered at step 5 when a destination path is already taken by something Hatch didn't place there.
- If run interactively, system warns and asks the developer to choose: skip that file (rest of the skill/group still imported) or import it with a suffix.
- If run unattended (no interactive terminal), system defaults to skipping the conflicting file and continues with the rest.
- The outcome (skipped or suffixed) is included in the final summary.
- Terminates in Success — the overall import still completes.

### AF-7: Registry unreachable
Triggered when the registry can't be reached, either during the login prompt (step 3) or the fetch (step 4).
- System aborts the whole command cleanly: nothing is placed, no manifest change, no commit.
- Developer is informed the registry is unreachable.
- Terminates in Failure.

### AF-8: Invalid password
Triggered at step 3 when the supplied password is wrong.
- System aborts before fetching or placing anything.
- Developer is informed the password is invalid.
- Terminates in Failure.

### AF-9: Pointer-constraint version conflict within a group
Triggered at step 4, while unpacking a group whose members are resolved via pointers (including pointers to other groups, per ADR-0013) — two or more pointer paths reach the same skill name under constraints that resolve to different versions.

A pointer member declares one of three constraints on its `version` (ADR-0032):
- **none** — resolves to the registry's current published content for that name, across any MAJOR.
- **exact**, `X.Y.Z` — resolves to exactly that published version.
- **caret**, `^X.Y.Z` — resolves to the highest published version sharing that MAJOR and at or above that floor, and never into another MAJOR. Aborts the import when no published version satisfies it, naming the member and the constraint.

Any other value is a malformed manifest, rejected while the member list is parsed and before any content is fetched for that member.

Every constraint resolves to a concrete version before conflicts are settled, so the rules below apply to resolved versions rather than to the form each was written in:
- An unconstrained path expresses no opinion: where another path declares a constraint, that constraint governs and no warning is raised.
- If the resolved versions share the same MAJOR version: system resolves to the highest and surfaces a warning naming every conflicting constraint and which version was used.
  - The rest of the import proceeds normally; the warning is included in the summary.
  - Terminates in Success alongside the primary outcome.
- If the resolved versions differ in MAJOR version: system aborts the entire import — nothing is placed, no manifest change, no commit — reporting the skill name and the conflicting constraints.
  - Terminates in Failure.

### AF-10: Re-import — exactly pinned, update skipped
Triggered when the developer re-runs `hatch import <name>` (no version given) for a skill/group the manifest already records as exactly pinned (see AF-11).
- System does not check for or fetch a newer version.
- System reports the skill/group is pinned at its recorded version and was left untouched.
- No changes are made, no commit is created.
- Terminates in Success — distinct from AF-1: a newer compatible version may well exist, but the developer's pin is honored regardless of that.

### AF-11: Import specifies an exact version pin
Triggered when the developer runs `hatch import <name>@<version>`.
- System fetches exactly that version, regardless of what's newer.
- System places it and records the manifest entry as exactly pinned at that version.
- The pin is sticky: it governs every later `hatch import <name>` touching that skill/group (see AF-10) until the developer explicitly re-pins (`hatch import <name>@<other-version>`) or requests `hatch import <name>@latest`, which clears the pin and resumes normal auto-update tracking (AF-2).
- Terminates in Success.

### AF-12: Import specifies a range/floor version pin
Triggered when the developer runs `hatch import <name>@^<version>`.
- System resolves and fetches exactly as it would for an unpinned import — the given version records an intentional floor, not a resolution constraint, and is never consulted when resolving.
- System records the manifest entry as range-pinned at that floor, for visibility, but this does not change update behavior: a range-pinned skill/group continues to auto-update on later re-imports exactly like an unpinned one (AF-2 applies normally).
- The MAJOR bound on a standalone import comes from the version recorded in the manifest, not from the caret: a re-import auto-applies only a higher MINOR/PATCH of the recorded version's MAJOR, while a **first** import has no recorded version to compare against and takes whatever the registry currently publishes, in any MAJOR. A group's internal caret constraint is the reverse — it carries the MAJOR bound itself, because it has no recorded version to derive one from (AF-9, ADR-0032).
- Terminates in Success.

### AF-13: Import target is removed, and has never been imported before
Triggered at step 4 when the named target — a standalone skill or a group, whichever is named directly on the command line — is being imported for the first time (no existing manifest entry for it) and the registry's current metadata for it is flagged removed (see ADR-0013, ADR-0019).
- System refuses the import outright: nothing is placed, no manifest change, no commit.
- System reports that the target is removed and cannot be newly imported.
- Terminates in Failure.
- Distinct from AF-4: AF-4 warns about something a project *already* depends on; AF-13 blocks a project from *newly starting* to depend on something already known to be deprecated. AF-13 does not apply to a re-import of something already recorded in the manifest (still AF-4's warn-only path), and does not apply merely because a member of an otherwise-fine group is removed (also still warn-only, pending future registry-side dependency detection — not yet built; see ADR-0021).

## Postconditions

- **Success:** The target skill/group (or harness backfill) is correctly reflected in the project — content placed per declared harnesses, manifest updated, one commit made — except where AF-1 (no-op), AF-3 (local edits protected), or AF-10 (exactly pinned) apply, in which case that specific item is left exactly as it was. Any deprecation warning is surfaced regardless of the primary outcome.
- **Failure:** No changes are made anywhere — no content placed, no manifest change, no commit — when the registry is unreachable, authentication fails, a group's pinned-pointer members conflict across different MAJOR versions (AF-9), or the named target is a first-time import of something removed (AF-13).

## Business Rules

- One `hatch import` invocation produces at most one commit, deterministic and reviewable, regardless of how many files or skills it touches (single skill, whole group, or harness backfill).
- Every reference to committing here applies when the project is a git repository root. Hatch never creates a repository; without one it does the same work, skips the commit, and warns — see [0026-git-optional-dependency](../architecture/decisions/0026-git-optional-dependency.md). The "no changes are made" guarantees hold either way, restored by the command itself rather than by any version-control operation.
- A group is always fetched and imported as a whole — never one skill out of a group individually.
- A group's members may be physically part of the group's own folder, or a named pointer to a skill (or another group) living elsewhere in the registry, optionally carrying an exact-version or caret constraint (see ADR-0013, ADR-0032). Deployment always unpacks a group into flat, individual entries in the target project — never as one nested group folder.
- A pointer-constraint version conflict within one import is resolved deterministically, never silently guessed: every constraint resolves to a concrete version first, then the highest wins with a warning when those versions share a MAJOR version; the whole import is blocked otherwise (see AF-9).
- A group's members are resolved on every re-import before the import can report the project already up to date, because a caret-constrained member moves independently of the group's own version (see AF-1, ADR-0032).
- Placed content is never overwritten if it differs from what was originally imported — a local edit is assumed intentional.
- Deprecation/removal checks run on every invocation and cover all previously-imported skills/groups, not just the one being acted on.
- A removed flag warns, never blocks, for anything a project already depends on (AF-4) — but blocks outright a first-time import of the exact named target itself, standalone skill or group (AF-13, see ADR-0021). This distinction does not (yet) extend to a group member discovered removed mid-resolution while the group's own entry is fine — that remains warn-only, pending a registry-side check (not yet built) that a group's current version doesn't depend on a removed skill.
- The destination-occupied conflict can be resolved interactively or, for unattended/cloud-agent runs, defaults to skipping the conflicting file rather than blocking.
- Harness placement is governed by the project manifest's recorded harness(es), never by scanning the filesystem for which harness folders happen to exist.
- No two skills in the registry may claim the same destination path — that invariant is enforced separately at the registry level (see UC-5 — Prevent destination-path collisions across the registry), using the same resolution logic `hatch import` itself uses (see ADR-0014), not a separate reimplementation. This use case's destination-occupied handling is specifically about a pre-existing, non-Hatch-placed file already sitting at a path, not a registry-level collision.
- An exact version pin (`<name>@<version>`) is sticky: once recorded, it is respected by every later import touching that skill/group until the developer explicitly re-pins or clears it — the re-import auto-update rule (AF-2) does not apply to a pinned item while the pin stands (see AF-10, AF-11).
- A range/floor pin (`<name>@^<version>`) records an intentional minimum-version constraint but does not change fetch or update resolution — a range-pinned skill/group auto-updates exactly as an unpinned one does (see AF-12).
- A standalone skill/group's own version pin (AF-10 through AF-12) is a distinct mechanism from a group's internal pointer-member constraint (AF-9, see [0013-registry-group-structure-and-permanence](../architecture/decisions/0013-registry-group-structure-and-permanence.md) and [0032-group-pointer-caret-constraint](../architecture/decisions/0032-group-pointer-caret-constraint.md)): a group member's constraint is resolved fresh every time that group is unpacked and is never recorded as a persistent, sticky commitment in the target project's manifest — only a standalone import's own pin persists.
