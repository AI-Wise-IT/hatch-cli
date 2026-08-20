# Use Case: Remove Content from a Project

## Overview

- **ID:** UC-4
- **Name:** Remove Content from a Project
- **Primary Actor:** Developer (including a cloud agent acting unattended)
- **Outcome:** A previously-imported skill, group, or harness is cleanly removed from the project — its placed content deleted, its manifest entry dropped, and the change committed — without silently destroying local edits or leaving the manifest out of sync with what's actually on disk.

## Preconditions

- The target is an existing project with a Hatch manifest.

## Main Success Scenario

Happy path: removing a standalone skill or group that is present on disk exactly as imported (no local edits, no group-membership restriction, no manifest drift).

1. Developer runs `hatch remove <skill-or-group-name>` against a target project.
2. System confirms the item is recorded in the manifest and its placed content exists on disk as expected.
3. System removes the placed content from every harness folder it was placed in.
4. System updates the manifest to drop the entry.
5. System commits this as a single commit.
6. System reports what was removed.

## Alternative Flows

### AF-1: Not imported
Triggered at step 2 when the target was never recorded in the manifest.
- System gives an informational note that the target was never imported.
- No changes are made.
- Terminates in Success (no-op).

### AF-2: Manifest entry present, but content missing on disk
Triggered at step 2 when the manifest records the item as imported, but its placed content is no longer present (manually deleted outside Hatch).
- System detects and reports the discrepancy.
- If run interactively: system asks for confirmation to drop the stale manifest entry; on confirmation, the entry is removed and committed.
- If run unattended: system aborts by default, leaving the stale entry in place, and reports the discrepancy for the developer to resolve later.
- Terminates in Success (confirmed cleanup) or leaves state unchanged (unattended, reported).

### AF-3: Local edits present
Triggered when the placed content differs from what was originally imported.
- System warns that the content has been locally modified since import.
- If run interactively: system asks whether to proceed with removal anyway.
- If run unattended: system aborts by default; nothing is removed.
- Terminates in Success (confirmed and removed) or aborts (unattended or declined).

### AF-4: Target is a skill that belongs to a group
Triggered when the named target is a single skill that was imported as part of a group, not standalone.
- System refuses to remove it individually.
- System reports that the whole group must be removed instead, naming the group.
- Terminates in Failure — nothing is removed.

### AF-5: Drop a harness
Triggered by `hatch remove --harness <name>`, with no skill/group target.
- System checks the harness isn't the project's only declared harness (see Business Rules); if it is, aborts and reports that at least one harness must remain.
- Otherwise, removes that harness's placed content for every already-imported skill/group.
- System drops the harness from the manifest.
- System commits this as a single commit.
- System reports what was removed.
- Terminates in Success, or Failure if it was the only declared harness.

## Postconditions

- **Success:** The targeted skill/group's placed content and manifest entry no longer exist in the project (or, for a harness drop, that harness's placed content and manifest declaration no longer exist), recorded in one commit. No-op and unattended-abort cases leave the project state unchanged.
- **Failure:** Attempting to remove a single skill that belongs to a group, or attempting to drop the project's only declared harness — in both cases nothing is removed and the reason is reported.

## Business Rules

- A skill that belongs to a group can only be removed as part of removing the whole group — never individually, since group members may depend on each other.
- Local edits and manifest/disk drift both require confirmation before removal proceeds; unattended runs default to aborting rather than silently modifying state.
- `hatch remove` follows the same one-invocation-one-commit rule as `hatch import`, and the same git-optional rule: without a repository at the project root it removes the content, skips the commit, and warns — see [0026-git-optional-dependency](../architecture/decisions/0026-git-optional-dependency.md). Its "nothing was changed" guarantee on failure is met by restoring the deleted content from the command's own snapshot, so it holds with or without a repository.
- A project must always declare at least one harness — dropping the last remaining harness is blocked.
- `hatch remove` is a distinct command, not a flag on `hatch import` — import stays purely additive, remove is the single home for anything destructive (including dropping a harness).
