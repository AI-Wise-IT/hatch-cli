> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

A group's listing row in [`add-registry-listing`](../add-registry-listing/proposal.md) shows the group's own description, deliberately — a row built from its members' descriptions would be a paragraph of noise. That decision is right for a listing and leaves a real gap: the thing you most need to know about a group before importing it is what is in it.

A group is imported whole ([UC-3](../../../docs/use-cases/import-content.md)) — never one member at a time — so importing one to find out what it contains is a heavier commitment than for a single skill. It places every member's content into every declared harness and records the lot in the manifest.

The member graph is also the part of the registry with the most that can surprise you. Members are nested or pointers, pointers may be pinned or floating, a pointer may name another group at arbitrary depth ([ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md), [ADR-0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md)), and two pointer paths reaching the same name at conflicting pins is a real failure mode the import has to resolve or abort on ([AF-9](../../../docs/use-cases/import-content.md)). None of that is visible before the import runs.

## What Changes

Sketch only — none of this is settled.

- A per-group details view: the group's own description and version, and its members — each with its kind, the version it resolves to, and whether it is flagged removed.
- The group's own published version history, read from its `<name>@<version>` tags, as in [`add-skill-details-command`](../add-skill-details-command/proposal.md).
- Read-only and project-free, like `hatch list`.

## Capabilities

Provisional. Most likely `registry-discovery` again, and possibly the same command as the per-skill view rather than a separate one.

### New Capabilities

- None assumed.

### Modified Capabilities

- `registry-discovery` (provisional): would gain the group detail view alongside the listing.

## Open Questions

- **One command or two.** A group and a skill are distinguishable from `skill.json` alone, so a single `hatch show <name>` could branch on kind. Splitting them is only worth it if the two views diverge enough to justify it. This is the first question to settle, and it decides whether this record and [`add-skill-details-command`](../add-skill-details-command/proposal.md) are one change or two.
- **How deep the member graph is resolved.** One level is cheap and can misrepresent a group whose members are themselves groups. Full resolution shows what an import would actually place, at the cost of walking the whole pointer graph — the work `resolveGroupMembers` already does, for a command that is meant to be a quick look.
- **Whether pin conflicts are surfaced before the import.** AF-9's major-version conflict aborts an import outright. Detecting it during a details view would turn this into a genuinely useful pre-flight check, and would mean running most of the resolution logic.
- **How a removed member is shown.** The group itself may be fine while a member is flagged, which import currently only warns about — and which [`add-removed-dependency-check`](../add-removed-dependency-check/proposal.md) records as wanting a registry-side check. A details view is a plausible place for that to surface first.
- **Whether nested members become browsable names.** They are deliberately absent from the listing because they are not individually importable. Showing them here is showing what the group contains, not offering them as targets — the wording has to keep that clear.
