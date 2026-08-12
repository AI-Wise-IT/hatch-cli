# Use Case: Import Skill/Group Content into a Project

## Overview

- **ID:** UC-3
- **Name:** Import Skill/Group Content into a Project
- **Primary Actor:** Developer (including a cloud agent acting unattended on the developer's behalf)
- **Outcome:** The named skill or group is present in the target project — correctly placed per the project's declared harness(es), recorded in the manifest, and committed as its own reviewable change. Covers first-time import, re-import (update/no-op/local-edit protection/pin-respecting), optionally pinning an exact or floor version, and adding a harness to a project already using Hatch. Works against any existing project, not only ones created by `hatch new`.

## Preconditions

- The target is an existing project directory (may or may not have been created by Hatch).
- The registry is the sole source of skill/group content, and the whole registry is private — every import requires an authenticated session (see UC-2).

## Main Success Scenario

1. Developer/agent runs `hatch import <skill-or-group-name>[@<version>]` against a target project directory — optionally pinning an exact version (`@1.2.0`) or a range floor (`@^1.2.0`).
2. System checks whether the target is already a git repository; if not, initializes one.
3. System checks for an authenticated session; if none exists, prompts inline for the registry password and authenticates.
4. System fetches the named skill — or, if it's a group, the whole group atomically — from the registry, at the given version if one was pinned, otherwise at the latest compatible version.
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
- Terminates in Success.

### AF-2: Re-import — update available, no local edits
Triggered when a newer compatible version exists and the placed content is unmodified since import.
- System fetches and places the updated content, updates the manifest version, commits, and reports the version change (e.g. "X updated v1 → v2").
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

### AF-9: Pinned-pointer version conflict within a group
Triggered at step 4, while unpacking a group whose members are resolved via pointers (including pointers to other groups, per ADR-0013) — two or more pointer paths reach the same skill name pinned to different versions.
- If the conflicting pinned versions share the same MAJOR version: system resolves to the highest pinned version and surfaces a warning naming every conflicting pin and which one was used.
  - The rest of the import proceeds normally; the warning is included in the summary.
  - Terminates in Success alongside the primary outcome.
- If the conflicting pinned versions differ in MAJOR version: system aborts the entire import — nothing is placed, no manifest change, no commit — reporting the skill name and the conflicting pinned versions.
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
- System resolves and fetches exactly as it would for an unpinned import (latest compatible, same MAJOR) — the given version records an intentional floor, not a resolution constraint.
- System records the manifest entry as range-pinned at that floor, for visibility, but this does not change update behavior: a range-pinned skill/group continues to auto-update on later re-imports exactly like an unpinned one (AF-2 applies normally).
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
- A group is always fetched and imported as a whole — never one skill out of a group individually.
- A group's members may be physically part of the group's own folder, or a named pointer to a skill (or another group) living elsewhere in the registry, optionally pinned to an exact version (see ADR-0013). Deployment always unpacks a group into flat, individual entries in the target project — never as one nested group folder.
- A pinned-pointer version conflict within one import is resolved deterministically, never silently guessed: highest pinned version wins with a warning when the conflicting versions share a MAJOR version; the whole import is blocked otherwise (see AF-9).
- Placed content is never overwritten if it differs from what was originally imported — a local edit is assumed intentional.
- Deprecation/removal checks run on every invocation and cover all previously-imported skills/groups, not just the one being acted on.
- A removed flag warns, never blocks, for anything a project already depends on (AF-4) — but blocks outright a first-time import of the exact named target itself, standalone skill or group (AF-13, see ADR-0021). This distinction does not (yet) extend to a group member discovered removed mid-resolution while the group's own entry is fine — that remains warn-only, pending a registry-side check (not yet built) that a group's current version doesn't depend on a removed skill.
- The destination-occupied conflict can be resolved interactively or, for unattended/cloud-agent runs, defaults to skipping the conflicting file rather than blocking.
- Harness placement is governed by the project manifest's recorded harness(es), never by scanning the filesystem for which harness folders happen to exist.
- No two skills in the registry may claim the same destination path — that invariant is enforced separately at the registry level (see UC-5 — Prevent destination-path collisions across the registry), using the same resolution logic `hatch import` itself uses (see ADR-0014), not a separate reimplementation. This use case's destination-occupied handling is specifically about a pre-existing, non-Hatch-placed file already sitting at a path, not a registry-level collision.
- An exact version pin (`<name>@<version>`) is sticky: once recorded, it is respected by every later import touching that skill/group until the developer explicitly re-pins or clears it — the re-import auto-update rule (AF-2) does not apply to a pinned item while the pin stands (see AF-10, AF-11).
- A range/floor pin (`<name>@^<version>`) records an intentional minimum-version constraint but does not change fetch or update resolution — a range-pinned skill/group auto-updates exactly as an unpinned one does (see AF-12).
- A standalone skill/group's own version pin (AF-10 through AF-12) is a distinct mechanism from a group's internal pointer-member version pin (AF-9, see [0013-registry-group-structure-and-permanence](../architecture/decisions/0013-registry-group-structure-and-permanence.md) and [0016-group-member-manifest-format](../architecture/decisions/0016-group-member-manifest-format.md)): a group member's pin is resolved fresh every time that group is unpacked and is never recorded as a persistent, sticky commitment in the target project's manifest — only a standalone import's own pin persists.
