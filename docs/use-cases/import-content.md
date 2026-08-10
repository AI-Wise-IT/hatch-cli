# Use Case: Import Skill/Group Content into a Project

## Overview

- **ID:** UC-3
- **Name:** Import Skill/Group Content into a Project
- **Primary Actor:** Developer (including a cloud agent acting unattended on the developer's behalf)
- **Outcome:** The named skill or group is present in the target project — correctly placed per the project's declared harness(es), recorded in the manifest, and committed as its own reviewable change. Covers first-time import, re-import (update/no-op/local-edit protection), and adding a harness to a project already using Hatch. Works against any existing project, not only ones created by `hatch new`.

## Preconditions

- The target is an existing project directory (may or may not have been created by Hatch).
- The registry is the sole source of skill/group content, and the whole registry is private — every import requires an authenticated session (see UC-2).

## Main Success Scenario

1. Developer/agent runs `hatch import <skill-or-group-name>` against a target project directory.
2. System checks whether the target is already a git repository; if not, initializes one.
3. System checks for an authenticated session; if none exists, prompts inline for the registry password and authenticates.
4. System fetches the named skill — or, if it's a group, the whole group atomically — from the registry.
5. System checks each destination path the content would occupy is not already taken by something Hatch didn't place there.
6. System places the content into every harness folder the project declares support for.
7. System writes/updates the project manifest, recording the skill/group and its version.
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

## Postconditions

- **Success:** The target skill/group (or harness backfill) is correctly reflected in the project — content placed per declared harnesses, manifest updated, one commit made — except where AF-1 (no-op) or AF-3 (local edits protected) apply, in which case that specific item is left exactly as it was. Any deprecation warning is surfaced regardless of the primary outcome.
- **Failure:** No changes are made anywhere — no content placed, no manifest change, no commit — when the registry is unreachable or authentication fails.

## Business Rules

- One `hatch import` invocation produces at most one commit, deterministic and reviewable, regardless of how many files or skills it touches (single skill, whole group, or harness backfill).
- A group is always fetched and imported as a whole — never one skill out of a group individually.
- Placed content is never overwritten if it differs from what was originally imported — a local edit is assumed intentional.
- Deprecation/removal checks run on every invocation and cover all previously-imported skills/groups, not just the one being acted on.
- The destination-occupied conflict can be resolved interactively or, for unattended/cloud-agent runs, defaults to skipping the conflicting file rather than blocking.
- Harness placement is governed by the project manifest's recorded harness(es), never by scanning the filesystem for which harness folders happen to exist.
- No two skills in the registry may claim the same destination path — that invariant is enforced separately at the registry level (see UC-5 — Prevent destination-path collisions across the registry). This use case's destination-occupied handling is specifically about a pre-existing, non-Hatch-placed file already sitting at a path, not a registry-level collision.
