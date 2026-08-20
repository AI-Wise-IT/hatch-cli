> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

[`add-registry-listing`](../add-registry-listing/proposal.md) gives every skill one line: name, kind, current version, and a one-sentence description. That is enough to stop a wrong guess at a name, and not enough to decide whether to import something.

The questions it leaves unanswered are the ones a developer or agent actually asks next. What does this skill do, at more length than one sentence? Which versions exist, and which would `@^1.2.0` actually resolve to? Is there a harness-specific variant, and does it behave differently? Today the only way to find out is to import it and read what lands — which is the wrong order, and leaves a manifest entry and a commit behind if the answer is no.

The version question is the sharpest one. [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) publishes every version as a `<name>@<version>` git tag, so the history exists and is queryable — but nothing in the CLI reads it. A developer choosing a pin ([AF-11, AF-12](../../../docs/use-cases/import-content.md)) has to already know which versions were published.

## What Changes

Sketch only — none of this is settled.

- A per-skill details view, showing more than a listing row can: the skill's full description, its current version, the versions published before it, which harness variants exist, and whether it is flagged removed.
- Version history read from the registry's `<name>@<version>` tags rather than from any new artifact.
- Read-only and project-free, like `hatch list` — it inspects the registry, it does not touch a project.

## Capabilities

Provisional. Most likely an extension of `registry-discovery` rather than a capability of its own, since it answers the same question at a different depth — but that is a scoping decision, not a settled one.

### New Capabilities

- None assumed.

### Modified Capabilities

- `registry-discovery` (provisional): would gain the per-entry detail view alongside the listing.

## Open Questions

- **Command surface.** `hatch show <name>`, `hatch info <name>`, a `--details` flag on `hatch list`, or something else. Whether one command serves both skills and groups, or [`add-group-details-command`](../add-group-details-command/proposal.md) stays separate — the kind is already known from `skill.json`, so one command could branch on it.
- **How version history is retrieved.** Enumerating a name's tags is a GitHub API surface the CLI has never used; [ADR-0003](../../../docs/architecture/decisions/0003-registry-github-tarball-fetch.md) settled only on the Contents API. Whether tag listing fits under that record or needs its own is open.
- **How much of the content is shown.** The `SKILL.md` frontmatter description, the whole `SKILL.md` body, or a listing of the files an import would place. Showing the body starts to resemble importing without importing.
- **Whether it shows what changed between versions.** Genuinely useful for deciding whether to update, and a materially larger feature than showing a version list.
- **Harness variants.** Whether a variant's own description and version are shown separately, or the family is presented as one thing — the same folding question [`add-registry-listing`](../add-registry-listing/design.md) settled for the listing, which may or may not have the same answer at this depth.
- **Whether removed content is inspectable.** The listing hides it; a details view arguably should still answer "what happened to this name", since the name is permanent and something may still reference it.
