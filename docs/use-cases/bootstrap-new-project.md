# Use Case: Bootstrap a New Project

## Overview

- **ID:** UC-1
- **Name:** Bootstrap a New Project
- **Primary Actor:** Developer
- **Outcome:** The developer has a brand-new project, at a location of their choosing, already a git repository with a manifest recording which harness(es) it supports, and already carrying a fixed "how to use Hatch" skill so any agent working in the project (local or cloud) knows how to operate Hatch from the start. This matters because creating a project needs inputs (target location, folder name, harness selection) that importing into an existing project doesn't, so it's kept as its own distinct command rather than folded into `hatch import`.

## Preconditions

- The developer has the Hatch CLI installed and available.
- The developer possesses the registry's personal password (authentication is required, since bootstrap imports the self-documentation skill from the registry).

## Main Success Scenario

1. Developer runs `hatch new`, providing: a target location (parent directory), a folder name, and the harness(es) the project should support.
2. System prompts for the registry password and authenticates the session (same mechanism as UC-2 — Authenticate to the Registry).
3. System creates the project folder at the specified location.
4. System initializes a git repository inside the new folder.
5. System writes a project manifest recording the selected harness(es).
6. System fetches the fixed "how to use Hatch" skill from the registry.
7. System places that skill into every harness folder the project declares — once per harness, duplicated if multiple harnesses are selected.
8. System records the skill and its version in the manifest.
9. System commits the initial scaffold (manifest, harness selections, and the placed skill) as the project's first commit.
10. Project is ready — no other skill or group content has been imported yet; that happens later via `hatch import`.

## Alternative Flows

### AF-1: Invalid password
Triggered at step 2 when the supplied password doesn't match.
- System aborts before creating anything.
- Developer is informed the password is invalid.
- Terminates in Failure.

### AF-2: Target path already occupied
Triggered at step 3 when a folder with the given name already exists at the target location.
- System aborts before creating anything or initializing git.
- Developer is informed the path is already occupied.
- Terminates in Failure.

### AF-3: Invalid or unrecognized harness selection
Triggered at step 1/5 when the developer specifies a harness Hatch doesn't recognize.
- System aborts before creating the folder.
- Developer is informed which harness name(s) were invalid.
- Terminates in Failure.

### AF-4: Target location not writable
Triggered at step 3 when the target location doesn't exist or the developer lacks write permission.
- System aborts before creating anything.
- Developer is informed the location isn't writable.
- Terminates in Failure.

### AF-5: Registry unreachable
Triggered at step 2 or step 6 when the registry can't be reached.
- System aborts cleanly; nothing persists (no folder, no git repo, no manifest) even if some steps had already run.
- Developer is informed the registry is unreachable.
- Terminates in Failure.

## Postconditions

- **Success:** A new project folder exists at the target location, is a git repository, contains a manifest recording the selected harness(es) and the placed self-documentation skill, has the "how to use Hatch" skill placed once per declared harness, and has one commit (the initial scaffold). No other skill/group content is present yet.
- **Failure:** No project folder, git repository, manifest, or commit persists at the target location, regardless of which step failed. The developer sees the specific reason (invalid password, occupied path, invalid harness, unwritable location, or registry unreachable).

## Business Rules

- Bootstrapping is a distinct command (`hatch new`), never a flag combined with import.
- The operation is atomic end-to-end, including the self-documentation skill fetch: authentication, folder creation, git init, manifest write, skill placement, and initial commit either all succeed or none of them persist.
- Authentication happens at the very start, before any filesystem changes — a failed login aborts before anything is created.
- Harness selection must be validated against Hatch's known set of harnesses before anything is created.
- A single, fixed "how to use Hatch" skill is always imported during bootstrap; there is no opt-out in this MVP.
- This skill is harness-agnostic content (identical across harnesses) but is still placed once per declared harness folder, the same placement mechanic as any harness-specific skill.
- This skill's content is authored as part of this project's own build and lives in the registry like any other skill.
