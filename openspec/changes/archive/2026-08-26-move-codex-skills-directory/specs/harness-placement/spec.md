## Purpose

Defines which directory a declared harness's skill content is placed in, that a harness's directory is independent of its name and its reserved suffix code, and how a harness whose directory has moved carries its content across to the new one and reclaims the one it used to occupy — so a project is never left with a skill the harness cannot find, and never left with two copies of the same skill.

## ADDED Requirements

### Requirement: Each harness places content in its own recorded directory

The system SHALL place imported content into a directory recorded for each declared harness, and SHALL place one copy per declared harness. The directory a harness uses is recorded centrally; no command may carry its own copy of a harness's directory path.

The `codex` harness's directory SHALL be `.agents/skills`.

#### Scenario: Content is placed in the codex harness's directory

- **WHEN** a skill is imported into a project whose manifest declares `codex`
- **THEN** the skill's content is placed under `.agents/skills/<name>/`
- **AND** no content is placed under `.codex/skills/<name>/`

#### Scenario: Each declared harness gets its own copy

- **WHEN** a skill is imported into a project whose manifest declares both `claude` and `codex`
- **THEN** the skill's content is placed under `.claude/skills/<name>/` and under `.agents/skills/<name>/`
- **AND** both copies carry the same content

#### Scenario: A harness the project does not declare is never placed into

- **WHEN** a skill is imported into a project whose manifest declares only `claude`, and `.agents/skills/` already exists in that project
- **THEN** no content is placed under `.agents/skills/`
- **AND** the existing directory is left untouched

### Requirement: A harness's directory is independent of its name and reserved code

The system SHALL keep a harness's recorded directory separate from its name and from its reserved suffix code. Changing where a harness's content is placed MUST NOT change which registry folder resolves for that harness, and MUST NOT change the name recorded in a project's manifest.

#### Scenario: A suffixed registry variant resolves unchanged

- **WHEN** a skill with both a plain folder and a `-cdx` sibling is imported into a project declaring `codex`
- **THEN** the `-cdx` variant's content is the content placed
- **AND** it is placed under `.agents/skills/<plain-name>/`, with the suffix stripped

#### Scenario: The manifest records the harness name, not its directory

- **WHEN** a project is initialized declaring `codex`
- **THEN** the manifest records the harness as `codex`
- **AND** the manifest records no directory path for it

### Requirement: A harness whose directory has moved carries its content across

Content the system placed in a harness's previously occupied directory SHALL be relocated into that harness's current directory, so that moving a harness's directory never leaves a recorded item unavailable to the harness and never requires the developer to move anything by hand.

Relocation SHALL apply to an item the project's manifest records whose content is present in the previously occupied directory and absent from the current one. It SHALL move the content already on disk rather than fetching it again, so the item's recorded version, pin, and content are carried across unchanged and an item the developer has edited locally arrives with that edit intact.

An item present in both directories is not relocated; it is reclaimed, per the requirement below.

#### Scenario: A recorded item is carried across on import

- **WHEN** `hatch import <name>` runs in a project that declares `codex`, whose manifest records `alpha`, whose content sits at `.codex/skills/alpha/` with nothing at `.agents/skills/alpha/`
- **THEN** `alpha`'s content is present at `.agents/skills/alpha/`
- **AND** it is byte-for-byte what sat at `.codex/skills/alpha/`
- **AND** `.codex/skills/alpha/` is gone
- **AND** the manifest's recorded version, pin, and content hash for `alpha` are unchanged

#### Scenario: Relocation precedes the staleness and local-edit checks

- **WHEN** `hatch import alpha` runs in a project whose recorded `alpha` is at its current version and whose content sits only in the previously occupied directory
- **THEN** `alpha` is not reported as having local edits
- **AND** the import reports the outcome it would report for an item already at its current version

#### Scenario: A locally edited item is carried across with its edit

- **WHEN** relocation moves an item whose content in the previously occupied directory differs from what the manifest recorded
- **THEN** the edited content is what arrives in the current directory
- **AND** the import reports that item as having local edits, as it would for an edit made in the current directory

#### Scenario: An item present in both directories is not relocated

- **WHEN** a recorded item's content is present in both the previously occupied and the current directory
- **THEN** the current directory's copy is left exactly as it is
- **AND** the previously occupied directory's copy is removed by reclamation

### Requirement: A harness reclaims a directory it no longer occupies

When a harness's recorded directory has changed, the system SHALL remove from the directory that harness previously occupied the content Hatch placed there, so a project is not left with a second, permanently stale copy that the harness would still discover.

Reclamation SHALL run as part of `hatch import`, and SHALL apply to every item recorded in the project's manifest — not only the item that import was asked for. It SHALL apply only to a project that declares the harness in question.

Reclamation SHALL remove only the entries the manifest records. Anything else in the previously occupied directory MUST be left in place.

Having removed those entries, the system SHALL remove the previously occupied directory, and its parent, only when doing so leaves nothing behind.

#### Scenario: Legacy content is reclaimed on import

- **WHEN** `hatch import <name>` runs in a project that declares `codex`, whose manifest records `alpha` and `beta`, and which has content at `.codex/skills/alpha/` and `.codex/skills/beta/`
- **THEN** `.codex/skills/alpha/` and `.codex/skills/beta/` are removed
- **AND** `.codex/skills/` and `.codex/` are removed, having been left empty
- **AND** the requested import completes as it otherwise would

#### Scenario: Reclamation covers items the import was not asked for

- **WHEN** `hatch import beta` runs in a project that declares `codex` and has legacy content for both `alpha` and `beta`
- **THEN** the legacy content for `alpha` is removed as well as for `beta`

#### Scenario: Content Hatch did not place is left alone

- **WHEN** reclamation runs in a project whose legacy directory holds `.codex/skills/alpha/` (recorded in the manifest) and `.codex/skills/unrelated/` (not recorded)
- **THEN** `.codex/skills/alpha/` is removed
- **AND** `.codex/skills/unrelated/` is left in place
- **AND** `.codex/skills/` and `.codex/` are retained, not being empty

#### Scenario: A project with no legacy directory is unaffected

- **WHEN** `hatch import <name>` runs in a project that declares `codex` and has no `.codex/` directory
- **THEN** the import behaves exactly as it would if reclamation did not exist
- **AND** no directory is created for the legacy location

#### Scenario: A project that does not declare the harness is unaffected

- **WHEN** `hatch import <name>` runs in a project that declares only `claude`, in a directory that happens to contain `.codex/skills/`
- **THEN** nothing under `.codex/` is removed

### Requirement: Relocation and reclamation are part of the import operation, not separate ones

Relocation and reclamation SHALL be covered by the same all-or-nothing guarantee as the rest of `hatch import`: if any part of the operation fails, the project is left exactly as it was, including anything that had already been moved or removed. In a version-controlled project they SHALL be recorded in the import's single commit rather than commits of their own.

Where the import would otherwise change nothing, a relocation or reclamation SHALL still be carried out, reported, and — in a version-controlled project — recorded in a single commit of its own.

#### Scenario: A failed import restores moved and reclaimed content

- **WHEN** an import that would relocate and reclaim content fails partway through
- **THEN** the moved content is back in the previously occupied directory
- **AND** the reclaimed content is restored
- **AND** the manifest is unchanged
- **AND** no commit is made

#### Scenario: Relocation and reclamation share the import's commit

- **WHEN** an import that relocates and reclaims content completes in a version-controlled project
- **THEN** exactly one commit is made
- **AND** it contains the placed content, the relocation, and the reclamation

#### Scenario: An otherwise unchanged import still commits the migration

- **WHEN** an import relocates or reclaims content in a version-controlled project, and makes no other change to the project
- **THEN** exactly one commit is made
- **AND** it contains the relocation and the reclamation

#### Scenario: Relocation and reclamation are reported

- **WHEN** an import relocates or reclaims content
- **THEN** the summary states what was moved into the harness's current directory
- **AND** the summary states what was removed from the previously occupied directory
