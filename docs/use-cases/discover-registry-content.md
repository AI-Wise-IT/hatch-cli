# Use Case: Discover What the Registry Holds

## Overview

- **ID:** UC-6
- **Name:** Discover What the Registry Holds
- **Primary Actor:** Developer (including a cloud agent acting unattended on the developer's behalf)
- **Outcome:** The developer or agent learns which skills and groups the registry actually holds — each one's importable name, whether it is a skill or a group, its current version, and what it is for — so the name typed into `hatch import` is one the registry really has rather than one guessed from context.

## Preconditions

- The registry is the sole source of skill/group content, and the whole registry is private — reading it requires an authenticated session (see [UC-2](authenticate-to-registry.md)).
- No project is required. `hatch list` is a registry query, not a project operation: it runs from any directory, whether or not a Hatch manifest is present.

## Main Success Scenario

1. Developer/agent runs `hatch list`, optionally followed by a single filter argument.
2. System checks for an authenticated session; if none exists, prompts inline for the registry password and authenticates — before reading anything from the registry.
3. System reads the manifest of the directory it is run in to determine whether this project has opted in to testing content. A directory with no manifest is treated as an ordinary project.
4. System reads the registry's top-level folders and reduces them to importable names: entries that are not folders are dropped, a folder that is not registry content is dropped, and a harness variant `<base>-<code>` is folded into `<base>` when the plain `<base>` folder also exists.
5. System applies the filter, if one was given, keeping only names containing it as a substring, matched without regard to case. Testing content is excluded here too, unless this project opted in.
6. System reads each surviving entry's own metadata to determine its kind and current version, dropping any entry the registry marks removed, and any testing content that escaped the name check in a project that did not opt in.
7. System reads each surviving plain skill's description from its `SKILL.md` frontmatter; a group's description comes from the group's own manifest.
8. System prints the entries in ascending alphabetical order, one per line, each showing its name, its kind, its current version, and its description.

## Alternative Flows

### AF-1: Filter matches nothing
Triggered at step 5 or 8 when no entry's name contains the filter.
- System reports that nothing matched.
- Terminates in Success — a query with no results is not a failure.

### AF-2: Filter names testing content from a project that did not opt in
Triggered at step 5 when the only names the filter would match are testing content and this project has not opted in.
- System reports that nothing matched, in wording identical to AF-1.
- System does not indicate that anything was withheld, does not report a count of hidden entries, and does not name the opt-in.
- Terminates in Success.

### AF-3: Empty registry
Triggered at step 4 when the registry holds no importable content at all.
- System reports that there is nothing to list, and prints no entries.
- Terminates in Success.

### AF-4: Registry unreachable
Triggered at step 4 when the registry cannot be reached at all.
- System reports the registry unreachable.
- System prints no partial listing.
- Terminates in Failure.

### AF-5: Credentials without registry access
Triggered at step 4 when the registry's root cannot be read with the credentials in use.
- System reports that those credentials do not grant access to the registry.
- System does not describe the result as a name that was not found — the registry root always exists for anyone who can see the repository, so the only reading is a credential problem.
- System prints no entries.
- Terminates in Failure.

### AF-6: Partially readable registry
Triggered at step 6 or 7 when the root listing succeeded but an individual entry's metadata cannot be read.
- System prints every entry it could read.
- System reports the unreadable entries by name.
- Terminates in Failure — so an incomplete listing is never mistaken for a complete one.

### AF-7: Entry with no readable description
Triggered at step 7 when an entry carries no description that can be read.
- System still lists the entry, with its name, kind and version.
- System shows its description as absent.
- Terminates in Success — a missing description is a listable state, not an error.

### AF-8: More than one filter argument
Triggered at step 1 when a second positional argument is given.
- System reports the usage and reads nothing from the registry.
- Terminates in Failure.

## Postconditions

- **Success:** The developer/agent has a list of names `hatch import` accepts, each with its kind, current version and description — or an explicit statement that nothing matched. The project is unchanged in every case: no content placed, no manifest written, no commit created.
- **Failure:** The registry was unreachable, the credentials in use cannot read it, an entry could not be read, or the command was called with too many arguments. Nothing is written in any of these cases either.

## Business Rules

- Every printed name is a name `hatch import` accepts. The listing is drawn from the registry's top-level folders only; a group's nested member is not listed, because a group is always imported whole and its members are not individually importable ([UC-3](import-content.md)).
- Entries are printed in ascending alphabetical order by name, independently of the order the registry returns them.
- Each entry shows exactly four things: its importable name, its kind, its current version, and its description. The kind distinguishes a group from a plain skill the same way `hatch import` does — a folder whose manifest carries a `members` array is a group.
- Only the current version on the registry's default branch is shown. `hatch list` never enumerates an entry's published version tags, and never shows an earlier version's version number or description.
- A plain skill's description comes from the `description` field in its `SKILL.md` frontmatter, and never from its `skill.json`. A group has no `SKILL.md` of its own, so a group's description comes from a `description` field on the group's own `skill.json`, and is never derived from its members' descriptions. The registry's content checks require both — see [0028-registry-discovery-live-walk](../architecture/decisions/0028-registry-discovery-live-walk.md).
- Where a description cannot be read — no `SKILL.md`, no frontmatter, no `description` key, a value that is not a non-empty string, or a version published before the field was required — the entry is still listed with its description shown as absent. A missing description is never an error and never omits the entry.
- The filter matches names only, never descriptions, versions or kinds. It is a case-insensitive substring match, and a filter matching nothing exits successfully.
- An entry whose current `skill.json` declares `removed: true` is never listed, whatever project the command runs from and whatever the filter is, and no flag overrides it. A first-time import of removed content is refused outright ([AF-13](import-content.md), [0021-block-first-time-import-of-removed-target](../architecture/decisions/0021-block-first-time-import-of-removed-target.md)), so listing it would advertise a dead end. Its absence from the listing changes nothing about how `hatch import` treats it elsewhere — a manifest-recorded removed entry still warns exactly as before.
- Testing content is omitted from the listing of any project that does not record the test-project opt-in, matching the rule that makes it unimportable there ([0027-testing-skill-convention](../architecture/decisions/0027-testing-skill-convention.md)). The opt-in is read from the manifest of the directory the command runs in; run outside a project, the listing is what a project without the opt-in would see. A project recording the opt-in sees testing content alongside ordinary content, shown with the same fields. Output for a project without the opt-in never indicates that anything was withheld, never reports a count of hidden entries, and never names the opt-in.
- A folder named `<base>-<code>` for a reserved harness code is folded into `<base>` — shown once, under `<base>` — only when a top-level `<base>` folder also exists, since `<base>` is the name `hatch import` resolves. Every other top-level folder is listed under its own literal name, including one shaped `<base>-<code>` with no plain sibling: that is indistinguishable from an ordinary skill whose name merely ends in a reserved code ([0025-harness-shadowing-risk-accepted](../architecture/decisions/0025-harness-shadowing-risk-accepted.md)), and its literal name does resolve. A folded family's kind, version and description are the plain folder's.
- A `404` on the registry root reports a credential problem, not a missing name. This resolves the ambiguity only for this surface: `hatch import`'s per-name `404` stays genuinely ambiguous and its not-found wording is unchanged.
- `hatch list` makes no change to any project — it places no content, writes no manifest, and makes no commit — and it requires no project: it runs to completion from any directory, never reporting a missing manifest and never naming `hatch init`.
- Output is human-readable text. JSON and other scriptable output are out of scope, per the PRD's No list (`intake/product-requirements.md`).
