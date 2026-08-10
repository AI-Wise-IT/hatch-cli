# Use Case: Prevent Destination-Path Collisions Across the Registry

## Overview

- **ID:** UC-5
- **Name:** Prevent Destination-Path Collisions Across the Registry
- **Primary Actor:** Developer, in the role of registry maintainer
- **Outcome:** Confidence that no two skills or groups in the skill-content repo claim the same destination path, verified automatically on every commit via CI — so a collision is caught before it ever reaches the live registry, rather than surfacing later as a broken import in some project.

## Preconditions

- The skill-content repo has CI configured to run this check.
- CI has a full checkout of the skill-content repo available (the normal case for any CI run).

## Main Success Scenario

1. Developer pushes a commit (or opens a PR) to the skill-content repo.
2. CI triggers the destination-path collision check as part of its pipeline.
3. System scans every skill and group's declared destination path(s) across the full repo checkout.
4. System finds no two skills/groups claim the same destination path.
5. CI reports the check as passed.

## Alternative Flows

### AF-1: Collision detected
Triggered at step 4 when two or more skills/groups declare the same destination path.
- System produces a report listing the colliding skills/groups and the shared path.
- CI fails the check, blocking the change from merging/publishing.
- Terminates in Failure.

## Postconditions

- **Success:** CI confirms no destination-path collisions exist in the skill-content repo at this commit.
- **Failure:** CI is blocked, with a report identifying which skills/groups collide and on what path, so the developer can resolve it before the change reaches the registry.

## Business Rules

- This check runs automatically in CI, not as a manual step the developer has to remember to run.
- The check operates on the full local checkout already available to CI — it never needs to fetch anything from the live registry.
- This is a detection/report mechanism only for this MVP — no automatic resolution of a collision.
