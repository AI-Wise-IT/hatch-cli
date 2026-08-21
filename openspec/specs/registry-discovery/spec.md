## Purpose

Defines how a developer or agent finds out what the registry holds before importing anything: which names `hatch list` presents as importable, what it shows about each one and where that information comes from, what it deliberately withholds, and how it behaves when the registry cannot be read.

## Requirements

### Requirement: Listing the registry's importable content

The CLI SHALL provide a `hatch list` command that prints the skills and groups available for import from the registry.

Every printed name SHALL be a name `hatch import` accepts. The listing SHALL be drawn from the registry's top-level folders only. A group's nested member SHALL NOT be listed: a group is imported whole and its members are not individually importable.

Entries SHALL be printed in ascending alphabetical order by name, and the ordering SHALL NOT depend on the order the registry returns them.

`hatch list` SHALL make no change to any project — it places no content, writes no manifest, and makes no commit. It SHALL NOT require a project: it SHALL run to completion from any directory, whether or not a Hatch manifest is present.

#### Scenario: Listing the whole registry

- **WHEN** a developer runs `hatch list` with an authenticated session
- **THEN** every importable skill and group in the registry is printed, one entry per line, in alphabetical order by name
- **AND** the command exits successfully

#### Scenario: A group's nested members stay unlisted

- **WHEN** the registry holds a group whose members include a nested member folder
- **THEN** the group's own name is listed
- **AND** the nested member's name is not listed as an entry of its own

#### Scenario: Run outside a project

- **WHEN** `hatch list` is run from a directory with no Hatch manifest
- **THEN** the listing is printed exactly as it would be inside a project
- **AND** the command does not report a missing manifest and does not name `hatch init`

#### Scenario: Nothing is written

- **WHEN** `hatch list` completes in an initialized, version-controlled project
- **THEN** no file in the project has changed
- **AND** no commit has been created

### Requirement: What each entry shows

Each listed entry SHALL show four things: its importable name, its kind, its current version, and its description.

The kind SHALL distinguish a group from a plain skill, determined the same way `hatch import` determines it — a folder whose `skill.json` carries a `members` array is a group, and a folder without one is a plain skill.

The version SHALL be the entry's current version on the registry's default branch. `hatch list` SHALL NOT enumerate an entry's published version tags and SHALL NOT show any version other than the current one.

The description SHALL be the current version's description. `hatch list` SHALL NOT show descriptions from earlier versions.

#### Scenario: A plain skill's entry

- **WHEN** `hatch list` prints an entry for a plain skill
- **THEN** the entry shows the skill's name, the kind `skill`, its current version, and its description

#### Scenario: A group's entry

- **WHEN** `hatch list` prints an entry for a group
- **THEN** the entry shows the group's name, the kind `group`, its current version, and its description

#### Scenario: Older versions are not shown

- **WHEN** an entry has several published versions whose descriptions differ
- **THEN** only the current version's version number and description are printed
- **AND** no earlier version appears in the output

### Requirement: Where a description comes from

A plain skill's description SHALL be read from the `description` field in its `SKILL.md` frontmatter. A plain skill SHALL NOT carry a description in its `skill.json`, and the CLI SHALL NOT read one from there.

A group's description SHALL be read from a `description` field on the group's own `skill.json`. A group has no `SKILL.md` of its own, and its description SHALL NOT be derived from its members' descriptions.

The registry's content checks SHALL require a non-empty string `description` on every group folder's `skill.json`, and SHALL require a `description` in every plain skill folder's `SKILL.md` frontmatter.

Where a description cannot be read — no `SKILL.md`, no frontmatter, no `description` key, a `description` that is not a non-empty string, or a version published before this field was required — the entry SHALL still be listed, with its description shown as absent. A missing description SHALL NOT be an error and SHALL NOT omit the entry.

#### Scenario: Skill description read from frontmatter

- **WHEN** a plain skill's `SKILL.md` frontmatter declares a `description`
- **THEN** that text is shown as the entry's description

#### Scenario: Group description read from its manifest

- **WHEN** a group's `skill.json` declares a `description`
- **THEN** that text is shown as the entry's description
- **AND** no member's description appears in the group's entry

#### Scenario: Group missing its description

- **WHEN** a group folder's `skill.json` omits `description`, or gives it an empty or non-string value
- **THEN** the registry's content checks report the folder and exit non-zero

#### Scenario: A pre-existing version with no description

- **WHEN** an entry's current content carries no readable description
- **THEN** the entry is still listed with its name, kind and version
- **AND** its description is shown as absent rather than causing a failure

### Requirement: Filtering by name

`hatch list` SHALL accept an optional filter argument. Given one, it SHALL print only entries whose name contains that argument as a substring, matched without regard to case. Given none, it SHALL print every entry.

The filter SHALL match against names only. It SHALL NOT match against descriptions, versions or kinds.

A filter matching nothing SHALL be reported as no matches and SHALL exit successfully — a query with no results is not a failure.

#### Scenario: Filter narrows to matching names

- **WHEN** a developer runs `hatch list prd-elicit` and the registry holds `prd-elicitation`
- **THEN** `prd-elicitation` is printed
- **AND** entries whose names do not contain `prd-elicit` are not printed

#### Scenario: Filter is case-insensitive

- **WHEN** a developer runs `hatch list PRD` and the registry holds `prd-elicitation`
- **THEN** `prd-elicitation` is printed

#### Scenario: Filter does not match descriptions

- **WHEN** a filter term appears in an entry's description but not in its name
- **THEN** that entry is not printed

#### Scenario: Filter matches nothing

- **WHEN** a filter matches no entry
- **THEN** the command reports that nothing matched
- **AND** exits successfully

### Requirement: Removed content is not listed

An entry whose current `skill.json` declares `removed: true` SHALL NOT appear in the listing, whether or not a filter would otherwise match it.

This SHALL apply regardless of the project the command is run from, and SHALL NOT be overridable by a flag.

The exclusion SHALL NOT change any other behavior for removed content: it remains fetchable, its name remains permanent, and `hatch import`'s existing treatment of it — warning for something already recorded in a manifest, refusing a first-time import of it as a named target — is unaffected.

#### Scenario: A removed entry is omitted

- **WHEN** the registry holds an entry whose `skill.json` declares `removed: true`
- **THEN** that entry does not appear in `hatch list` output
- **AND** a filter naming it exactly still reports no matches

#### Scenario: Import behavior is unchanged

- **WHEN** a project's manifest already records a removed entry
- **THEN** `hatch import` still warns about it exactly as before
- **AND** the entry's absence from `hatch list` changes nothing about that warning

### Requirement: Testing content is listed only to a test project

Testing content SHALL be omitted from the listing for any project that does not record the test-project opt-in, matching the rule that makes it unimportable there.

`hatch list` SHALL determine the opt-in from the manifest of the project it is run in. Run outside a project, it SHALL list as a project without the opt-in would see the registry.

A project recording the opt-in SHALL see testing content listed alongside ordinary content, shown exactly as any other entry.

Output for a project without the opt-in SHALL NOT indicate that anything was withheld, SHALL NOT report a count of hidden entries, and SHALL NOT name the opt-in.

#### Scenario: Ordinary project

- **WHEN** `hatch list` is run in a project that does not record the test-project opt-in
- **THEN** no testing content appears in the output
- **AND** the output says nothing about content being withheld

#### Scenario: Test project

- **WHEN** `hatch list` is run in a project recording the test-project opt-in
- **THEN** testing content is listed alongside ordinary content with the same fields

#### Scenario: Filter naming testing content from an ordinary project

- **WHEN** a developer in an ordinary project filters by the exact name of a testing skill
- **THEN** the command reports no matches
- **AND** its wording is the same as for a filter matching nothing at all

### Requirement: Harness variants are folded into the family name

Where a top-level folder is named `<base>-<code>` for a reserved harness code **and** a top-level folder named `<base>` also exists, the listing SHALL show `<base>` once and SHALL NOT show `<base>-<code>` as an entry of its own — `<base>` is the name `hatch import` resolves and therefore the name to print.

Any other top-level folder SHALL be listed under its own literal name, including one shaped `<base>-<code>` with no `<base>` sibling. Such a folder is indistinguishable from an ordinary skill whose name merely ends in a reserved code, and `hatch import` accepts its literal name.

A folded family's kind, version and description SHALL be taken from the plain `<base>` folder.

#### Scenario: A family with a harness variant

- **WHEN** the registry holds both `handover/` and `handover-cld/`
- **THEN** `handover` is listed once
- **AND** `handover-cld` is not listed as a separate entry
- **AND** the entry's version and description are the plain folder's

#### Scenario: A suffix-shaped name with no plain sibling

- **WHEN** the registry holds `claude-code-guide/` and no `claude-code/` folder exists
- **THEN** `claude-code-guide` is listed under its own literal name

### Requirement: Authentication and registry failure

`hatch list` SHALL require an authenticated session, because the registry is private. Where no session exists it SHALL authenticate the same way the other registry commands do, before reading anything.

Where the registry cannot be reached, the command SHALL report the registry unreachable and exit with a failure status, printing no partial listing.

Where the registry's root cannot be read with the current credentials, the command SHALL report that the credentials do not grant access to the registry and exit with a failure status. It SHALL NOT report this as a missing name: the registry root always exists, so the only reading is a credential without registry access.

Where an individual entry's metadata cannot be read while the root listing succeeded, the command SHALL still print the entries it could read and SHALL report the ones it could not by name, exiting with a failure status so an incomplete listing is never mistaken for a complete one.

#### Scenario: No session present

- **WHEN** `hatch list` is run with no authenticated session
- **THEN** the command authenticates before reading the registry
- **AND** prints the listing once authenticated

#### Scenario: Registry unreachable

- **WHEN** the registry cannot be reached
- **THEN** the command reports the registry unreachable
- **AND** prints no entries
- **AND** exits with a failure status

#### Scenario: Credentials without registry access

- **WHEN** the credentials in use cannot read the registry's root
- **THEN** the command reports that they do not grant access to the registry
- **AND** does not describe the result as a name that was not found
- **AND** exits with a failure status

#### Scenario: One entry unreadable

- **WHEN** the root listing succeeds but one entry's metadata cannot be read
- **THEN** every readable entry is printed
- **AND** the unreadable entry is reported by name
- **AND** the command exits with a failure status
