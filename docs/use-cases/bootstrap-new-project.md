# Use Case: Initialize a Project for Hatch

## Overview

- **ID:** UC-1
- **Name:** Initialize a Project for Hatch
- **Primary Actor:** Developer
- **Outcome:** An existing directory becomes a Hatch-managed project: it carries a manifest recording which harness(es) it supports, and a fixed "how to use Hatch" skill so any agent working in the project (local or cloud) knows how to operate Hatch from the start. This matters because initialization needs an input — the harness selection — that no other command can supply, and because every other project-scoped command can then simply require a manifest rather than branching on whether one exists.

## Preconditions

- The developer has the Hatch CLI installed and available.
- The target directory already exists. Creating a project is outside Hatch's scope.
- The developer possesses the registry's personal password (authentication is required, since initialization imports the self-documentation skill from the registry).

## Main Success Scenario

1. Developer runs `hatch init --harness <name[,name...]>`, optionally naming a target directory with `--path <dir>`; without it, the current working directory is the target.
2. System validates every supplied harness against its known harness set.
3. System confirms the target directory exists.
4. System prompts for the registry password and authenticates the session (same mechanism as UC-2 — Authenticate to the Registry).
5. System fetches the fixed "how to use Hatch" skill from the registry.
6. System places that skill into every harness folder the project declares — once per harness, duplicated if multiple harnesses are selected.
7. System writes a project manifest recording the selected harness(es), the skill, and its version.
8. System records the whole scaffold as one commit if the project is a git repository root; if it is not, the system says so and makes no commit.
9. Project is ready — no other skill or group content has been imported yet; that happens later via `hatch import`.

## Alternative Flows

### AF-1: Invalid password
Triggered at step 4 when the supplied password doesn't match.
- System aborts before creating anything.
- Developer is informed the password is invalid.
- Terminates in Failure.

### AF-2: Project already initialized
Triggered at step 3 when the target directory already has a manifest.
- If every requested harness is already declared, the system reports that the project is already initialized, changes nothing, and terminates in Success.
- If the request names a harness the project does not declare, the system changes nothing, tells the developer that adding a harness is done through `hatch import --add-harness`, and terminates in Failure.

### AF-3: Invalid or unrecognized harness selection
Triggered at step 2 when the developer specifies a harness Hatch doesn't recognize, or supplies no harness at all.
- System aborts before authenticating or reaching the registry.
- Developer is informed which harness name(s) were invalid, or that `--harness` is required.
- Terminates in Failure.

### AF-4: Target directory does not exist
Triggered at step 3 when the named target directory isn't there.
- System aborts, creating nothing — it never creates the target directory.
- Developer is informed the target project does not exist.
- Terminates in Failure.

### AF-5: Registry unreachable
Triggered at step 4 or step 5 when the registry can't be reached.
- System aborts cleanly; nothing persists (no placed content, no manifest) even if some steps had already run.
- Developer is informed the registry is unreachable.
- Terminates in Failure.

## Postconditions

- **Success:** The target directory contains a manifest recording the selected harness(es) and the placed self-documentation skill, and has the "how to use Hatch" skill placed once per declared harness. If the project is a git repository root, exactly one new commit holds the whole scaffold; if it is not, nothing is committed and the developer has been told so. No other skill/group content is present yet.
- **Failure:** No manifest and no placed content persist in the target directory, regardless of which step failed and regardless of whether the project is a git repository. The developer sees the specific reason (invalid password, already initialized, invalid harness, missing target, or registry unreachable).

## Business Rules

- Initialization is a distinct command (`hatch init`), never a flag combined with import. It is the only command that creates a manifest; every other project-scoped command requires one and names `hatch init` when none is present.
- `hatch init` operates on a directory that already exists. It never creates the target directory and never initializes a git repository — see [0026-git-optional-dependency](../architecture/decisions/0026-git-optional-dependency.md).
- The operation is atomic end-to-end, including the self-documentation skill fetch: authentication, skill placement, manifest write, and the commit either all succeed or none of them persist.
- Harness selection is validated against Hatch's known set of harnesses before anything else happens — before authentication, before any registry request, before any filesystem change.
- An existing manifest is never modified by `hatch init`.
- A single, fixed "how to use Hatch" skill is always imported during initialization; there is no opt-out.
- This skill is harness-agnostic content (identical across harnesses) but is still placed once per declared harness folder, the same placement mechanic as any harness-specific skill.
- This skill's content is authored as part of this project's own build and lives in the registry like any other skill.
