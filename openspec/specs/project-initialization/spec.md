## Purpose

Defines how an existing directory becomes a Hatch-managed project: the single command that writes the project manifest, records its harness selection, and places the self-documentation skill — and the resulting rule that no other command may create a manifest.

## Requirements

### Requirement: Initialize a project in place

The system SHALL provide a `hatch init` command that makes an existing directory Hatch-managed by writing `hatch.manifest.json` recording the selected harness(es), placing the self-documentation skill into every declared harness folder, and recording that skill and its version in the manifest.

The command SHALL operate on an existing directory only. It MUST NOT create the target directory, and it MUST NOT initialize a git repository. The target directory is the current working directory unless `--path <dir>` names another, matching `hatch import`'s existing convention.

#### Scenario: Initialize a plain existing directory

- **WHEN** `hatch init --harness claude` runs in an existing directory that has no `hatch.manifest.json`
- **THEN** `hatch.manifest.json` is written at that directory's root, recording `claude` as the project's only harness
- **AND** the self-documentation skill is placed under the `claude` harness's skill directory
- **AND** the skill and its version are recorded in the manifest
- **AND** the command exits `0`

#### Scenario: Initialize with multiple harnesses

- **WHEN** `hatch init --harness claude,codex` runs in an uninitialized directory
- **THEN** the manifest records both harnesses
- **AND** the self-documentation skill is placed once under each harness's skill directory, with identical content

#### Scenario: Target directory does not exist

- **WHEN** `hatch init --harness claude --path ./nonexistent` runs and `./nonexistent` does not exist
- **THEN** the system reports that the target project does not exist
- **AND** no directory is created
- **AND** the command exits non-zero

#### Scenario: Initialization does not create a git repository

- **WHEN** `hatch init --harness claude` runs in an existing directory that is not a git repository
- **THEN** no `.git` directory is created
- **AND** initialization otherwise completes successfully

### Requirement: Harness selection is required and validated

`hatch init` SHALL require `--harness <name[,name...]>` and SHALL validate every supplied harness against the system's known harness set before making any filesystem change. An absent, empty, or unrecognized selection SHALL abort the command with nothing created.

#### Scenario: Harness flag omitted

- **WHEN** `hatch init` runs with no `--harness` argument
- **THEN** the system reports that `--harness <name[,name...]>` is required
- **AND** no manifest is written and no content is placed
- **AND** the command exits non-zero

#### Scenario: Unrecognized harness

- **WHEN** `hatch init --harness bogus` runs
- **THEN** the system reports `bogus` as an unrecognized harness
- **AND** no manifest is written and no content is placed
- **AND** the command exits non-zero

#### Scenario: Validation precedes authentication

- **WHEN** `hatch init --harness bogus` runs in an environment with no registry credentials available
- **THEN** the system reports the unrecognized harness rather than an authentication failure
- **AND** no credential prompt or registry request is made

### Requirement: The self-documentation skill is always placed

`hatch init` SHALL always place the fixed self-documentation skill, once per declared harness. There SHALL be no flag, argument, or environment setting that skips it — a project cannot be initialized without it.

#### Scenario: Skill placed for every declared harness

- **WHEN** initialization succeeds for a project declaring two harnesses
- **THEN** the self-documentation skill is present under both harnesses' skill directories
- **AND** the manifest records it as a single skill entry with its registry version

#### Scenario: No opt-out is offered

- **WHEN** `hatch init` is invoked with an argument intended to skip the self-documentation skill
- **THEN** the system rejects the argument as unrecognized
- **AND** no initialization occurs

### Requirement: Initialization is atomic

`hatch init` SHALL leave the target directory exactly as it found it when any step fails. On failure no manifest, no placed skill content, and no commit SHALL persist, regardless of which step failed and regardless of whether the project is a git repository.

#### Scenario: Registry unreachable

- **WHEN** `hatch init --harness claude` runs and the registry cannot be reached while fetching the self-documentation skill
- **THEN** the system reports that the registry is unreachable
- **AND** no `hatch.manifest.json` exists in the target directory
- **AND** no skill content is present under any harness directory
- **AND** the command exits non-zero

#### Scenario: Authentication fails

- **WHEN** `hatch init --harness claude` runs and registry authentication fails
- **THEN** the system reports the authentication failure
- **AND** no filesystem change has been made to the target directory

#### Scenario: Placement fails partway

- **WHEN** initialization fails while placing the self-documentation skill into the second of two declared harnesses
- **THEN** content already written under the first harness is removed
- **AND** no manifest persists
- **AND** the command exits non-zero

### Requirement: An already-initialized project is not re-initialized

When `hatch.manifest.json` already exists in the target directory, `hatch init` SHALL NOT modify it. If the requested harnesses are all already declared, the command SHALL report that the project is already initialized and exit `0` without changes, matching how the system already treats other already-in-desired-state requests. If the request names any harness the project does not declare, the command SHALL exit non-zero and direct the caller to the harness-addition command rather than silently ignoring the request.

#### Scenario: Repeat initialization with the same harnesses

- **WHEN** `hatch init --harness claude` runs against a project whose manifest already declares exactly `claude`
- **THEN** the system reports that the project is already initialized
- **AND** the manifest is unchanged and no content is placed or re-fetched
- **AND** the command exits `0`

#### Scenario: Repeat initialization requesting an undeclared harness

- **WHEN** `hatch init --harness codex` runs against a project whose manifest declares only `claude`
- **THEN** the system reports that the project is already initialized and that adding a harness is done through the harness-addition command
- **AND** the manifest is unchanged and `codex` is not added
- **AND** the command exits non-zero

### Requirement: Manifest creation belongs exclusively to initialization

No command other than `hatch init` SHALL create `hatch.manifest.json`. Every project-scoped command SHALL require an existing manifest and SHALL fail, changing nothing, when none is present — reporting the condition and naming `hatch init` as the remedy. `hatch import` SHALL NOT accept a `--harness` argument for selecting a project's initial harnesses.

#### Scenario: Import into an uninitialized project

- **WHEN** `hatch import <name>` runs in a directory with no `hatch.manifest.json`
- **THEN** the system reports that the project is not initialized and names `hatch init` as the remedy
- **AND** nothing is fetched, placed, or written
- **AND** the command exits non-zero

#### Scenario: Import no longer accepts a harness selection flag

- **WHEN** `hatch import <name> --harness claude` runs
- **THEN** the system rejects `--harness` as an unrecognized argument
- **AND** nothing is fetched, placed, or written

#### Scenario: Harness addition into an uninitialized project

- **WHEN** `hatch import --add-harness codex` runs in a directory with no `hatch.manifest.json`
- **THEN** the system reports that the project is not initialized and names `hatch init` as the remedy
- **AND** the command exits non-zero

#### Scenario: Harness selection remains manifest-driven after initialization

- **WHEN** any import or removal runs against an initialized project
- **THEN** placement is governed solely by the harnesses recorded in the manifest, never by scanning the filesystem for existing harness directories
