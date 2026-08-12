# Backlog 0003: a way to discover valid skill/group names before importing

## Metadata

- **id:** backlog-0003-registry-search-list
- **status:** logged, not scoped, not built
- **decision_record:** `intake/backlog-0003-registry-search-list.md`

This is not a rescope record (compare [rescope-0001-standalone-version-pinning](rescope-0001-standalone-version-pinning.md), which pulled something *into* scope). Nothing here has been decided into or out of the MVP — it is a durable note that a real gap was raised, so a future scoping conversation starts from an accurate record instead of rediscovering it from scratch.

## What was raised

A cloud-agent test of the `hatch-usage` skill attempted `hatch import prd-elicitor` (guessed from context) and failed with "not found in the registry" — the real name was `prd-elicitation`. There is currently no way to discover a valid skill/group name before attempting an import: no `hatch search`, no `hatch list`, and no browsable index. The agent's only recourse was falling back to a raw GitHub Contents API call against the private `hatch-skills` repo directly — not something every credential holder can or should do, and not a supported code path.

Checked against everything currently scoped: [import-content.md](../docs/use-cases/import-content.md) (UC-3) assumes the caller already knows the target name. Neither `mvp-scope.md` nor the original PRD mentions a browse/search/list capability. **Confirmed: nothing like this exists in current scope**, though [0009-skill-versioning-semver-tags](../docs/architecture/decisions/0009-skill-versioning-semver-tags.md)'s Trade-offs section anticipated it in passing ("this scheme could be extended later... e.g. with a browsable index for the deferred 'list/browse' Nice item").

## Why deferred rather than designed here

This is a genuinely new capability (a new CLI command, and/or a registry-side index it reads), not a format gap inside already-scoped work. It also has real open design questions: does it need a new registry-side artifact (an index file CI keeps in sync, mirroring `version-check`'s pattern) or can it walk the Contents API live the way `hatch import` already does; does it return names only or also descriptions/versions; and how it interacts with the registry's privacy (a token without registry read access currently gets a `404`, per Batch 4's notes in `docs/build-plan.md` — the same ambiguity would apply to a `list`/`search` result).

## What picking this up later requires

A proper scoping pass (`mvp-scoping`) — decide Must/Want/Nice, write it up as a use case (working title: "Discover available skills/groups in the registry") — and only then a design conversation (`design-architecture-decision`) for the retrieval mechanism (live API walk vs. a CI-maintained index) and output shape.

## Consequences

- No files, commands, or CI jobs exist yet for this — this record's only effect is making sure it isn't lost.
- In the meantime, `hatch-usage/SKILL.md` ([hatch-skills#20](https://github.com/AI-Wise-IT/hatch-skills/pull/20)) tells an agent this gap exists explicitly, so it asks the user for the exact name rather than guessing or improvising a workaround.
