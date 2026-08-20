## Why

A cloud-agent test of the `hatch-usage` skill ran `hatch import prd-elicitor`, guessed from context, and failed — the real name is `prd-elicitation`. Nothing in the CLI can answer "what is this actually called?": there is no `hatch list`, no `hatch search`, no browsable index. The agent's only recourse was a raw GitHub Contents call against the private `hatch-skills` repo, which is neither a supported code path nor something every credential holder can do. [intake/backlog-0003](../../../intake/backlog-0003-registry-search-list.md) logged the gap; `hatch-usage/SKILL.md` currently works around it by instructing agents to stop and ask the user for the exact name.

Every other command already assumes the caller knows the name: [UC-3](../../../docs/use-cases/import-content.md) opens with `hatch import <skill-or-group-name>` and never says where that name comes from. Discovery is the one step of the workflow with no command behind it.

## What Changes

- **A new `hatch list [filter]` command.** Bare `hatch list` prints every importable skill and group in the registry. Given an argument, it prints only entries whose name contains that argument, matched case-insensitively as a substring — enough to turn a half-remembered `prd-elicit` into `prd-elicitation`. There is one command, not a `list`/`search` pair: both cases are the same query with and without a filter.
- **Each entry shows name, kind, version and description.** The name is exactly what you type after `hatch import`. The kind is `skill` or `group`. The version is the current one on `main` — `hatch list` never enumerates a name's published tags, and the description it prints is the latest version's, not a per-version history.
- **A skill's description comes from its `SKILL.md` frontmatter.** The `description` field the harnesses already require is the single source — no second copy in `skill.json` to drift out of step with it.
- **A group gets its own `description` field on its `skill.json`.** A group folder has no `SKILL.md` of its own; its content is its members. Without a field of its own a group could only be described by concatenating its members' descriptions, which is exactly the noise this avoids. `description` joins `version`, `members`, `removed` and `testing` as a field on the folder's own manifest, and registry CI requires it on every group.
- **The registry is read live, with no index file.** One non-recursive Contents call on the registry root yields every top-level folder name; each surviving entry costs one `skill.json` fetch, plus one `SKILL.md` fetch for a plain skill. This is the same API `hatch import` already uses, and it introduces no second artifact that must agree with the tree — the reason [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) rejected a version index and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) rejected a removed-names index. A CI-maintained index remains the escape hatch if registry growth makes the walk slow; this change records that rather than building it.
- **Removed and testing content are hidden.** A removed entry is omitted: a first-time import of one is refused outright ([AF-13](../../../docs/use-cases/import-content.md), [ADR-0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md)), so listing it would advertise a dead end. Testing content is omitted from an ordinary project's listing exactly as it is unimportable there ([ADR-0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md)), and appears only in a project recording `testProject: true` — the archived testing-skill change named this listing surface as the case that would have to account for the convention once it existed.
- **A group's nested members are not listed.** They are not top-level folders and not individually importable — a group is always imported whole (UC-3). Listing them would produce names that look importable and are not, which is the same class of failure this command exists to remove.
- **A harness variant is folded into its family only when the family's plain folder exists.** With both `handover/` and `handover-cld/` present, the list shows `handover` once — the name you type. A suffix-shaped folder with no plain sibling is listed under its own literal name, because from a single snapshot it is indistinguishable from an ordinary skill that happens to end that way ([ADR-0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md)), and typing it does resolve.
- **`hatch list` authenticates like any other registry command,** and needs no project — it is a registry query, not a project operation. Run inside an initialized project it reads `testProject` from the manifest; run anywhere else it lists as an ordinary project would see the registry.
- **A `404` on the registry root reports a credential problem, not a missing name.** The root always exists, so the ambiguity [backlog-0003](../../../intake/backlog-0003-registry-search-list.md) flagged resolves cleanly here: the only reading is that the credential cannot see the registry. `hatch import`'s per-name "not found" wording is unchanged.
- **`hatch-usage/SKILL.md` stops telling agents this gap exists** and points them at `hatch list` instead.

## Capabilities

`openspec/specs/` holds `project-initialization`, `testing-skill-convention` and `version-control-integration`. This change adds one capability and modifies none of them.

### New Capabilities

- `registry-discovery`: what `hatch list` shows and what it hides — the importable-name rule (top-level folders only, harness families folded, nested members excluded), the per-entry fields and where each is sourced, the group `description` field and its registry-side requirement, the removed and testing exclusions, filter matching, and the authentication and failure behavior of a registry query that needs no project.

### Modified Capabilities

None. `testing-skill-convention`'s requirements are about what marks testing content and that it is never importable into an ordinary project; hiding it from a listing is a rule about a surface that spec does not describe, and stating it in `registry-discovery` contradicts nothing there. `project-initialization` and `version-control-integration` are untouched — `hatch list` creates no manifest, places no content, and makes no commit.

## Impact

**Code (`hatch-cli`)**
- `src/commands/list.ts` (new) — argument parsing, the authenticate step, the fold-and-filter pass over top-level names, the metadata fetches, and the rendered table.
- `src/registry/fetch.ts` — a root-listing call returning every top-level entry's name and type. `registryFolderExists` and `fetchRegistryFile` already cover the per-entry work; the root call is the one shape missing.
- `src/registry/description.ts` (new) — YAML frontmatter `description` extraction from a `SKILL.md`, tolerant of a file with no frontmatter, no `description` key, or no `SKILL.md` at all.
- `src/registry/group-resolve.ts` — `description` parsed onto `GroupSkillJson` alongside `removed` and `testing`; absent reads as no description, never an error, so versions published before the field stay listable.
- `src/index.ts` — the `list` command wired in.
- `README.md` — `list` added to the implemented-commands line.

**Architecture decisions**
- New ADR — the discovery mechanism: live walk over an index, description sourced from `SKILL.md` frontmatter for skills and a `skill.json` field for groups, and the fold-only-when-the-plain-folder-exists rule.
- [ADR-0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md) and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) describe `skill.json`'s fields; the new group `description` field is recorded in the new ADR rather than by amending either.

**Documentation**
- `docs/use-cases/discover-registry-content.md` (new, UC-6) — the use case [backlog-0003](../../../intake/backlog-0003-registry-search-list.md) asks for, with the alternative flows for an empty result, an unreachable registry and a credential without registry access.
- `intake/backlog-0003-registry-search-list.md` — marked picked up, referencing this change.
- `intake/mvp-scope.md` — the "Nice — list/browse" deferral records that it was taken up.

**Cross-repo (`AI-Wise-IT/hatch-skills`)**
- `description` added to every group's `skill.json`, each with the PATCH bump the blocking `version-check` job requires.
- A blocking CI check requiring a non-empty string `description` on every group folder's `skill.json`, and requiring a `description` in every plain skill folder's `SKILL.md` frontmatter.
- `hatch-usage/SKILL.md` — the "there is no way to discover names, ask the user" instruction replaced with `hatch list`.
- `README.md` — the group `description` field documented alongside the fields already described there.

**Out of scope**
- JSON or otherwise scriptable output. `intake/mvp-scope.md` lists scriptable output as a permanent No; human-readable text is what this command prints.
- Any per-version view — listing a name's published tags, or showing an older version's description. Recorded as the unfinished proposals [`add-skill-details-command`](../add-skill-details-command/proposal.md) and [`add-group-details-command`](../add-group-details-command/proposal.md).
- Matching against descriptions rather than names. The filter narrows names, which is the failure `backlog-0003` recorded; meaning-based matching over descriptions is a different feature, recorded as the unfinished proposal [`add-semantic-registry-search`](../add-semantic-registry-search/proposal.md).
- Building the CI-maintained index. Recorded as the escape hatch, deliberately not built.
- Any bar on what makes a skill's content valid beyond requiring a description to exist. Recorded as the unfinished proposal [`add-skill-content-requirements`](../add-skill-content-requirements/proposal.md).
- Showing a Tessl grade per entry — still blocked on Tessl grading being usable, per `intake/mvp-scope.md`.
