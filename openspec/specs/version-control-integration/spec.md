## Purpose

Defines how every Hatch command relates to the target project's version control: that Hatch never creates a repository, records each operation as a single commit when one is present, and stays fully functional — with a standing warning — when one is not.

## Requirements

### Requirement: Hatch never creates a git repository

No Hatch command SHALL initialize a git repository in a target project. Whether a project is under version control is the developer's decision, made outside Hatch.

#### Scenario: Initialization in a non-repository

- **WHEN** `hatch init --harness claude` completes in a directory that is not a git repository
- **THEN** no `.git` directory exists in that directory afterwards

#### Scenario: Import into a non-repository

- **WHEN** `hatch import <name>` completes in an initialized project that is not a git repository
- **THEN** no `.git` directory is created
- **AND** the imported content and updated manifest are present on disk

### Requirement: Version control is recognized only at the project root

A project SHALL be treated as version-controlled if and only if the project directory is itself a git repository root. A project directory that merely sits inside an enclosing repository's work tree SHALL be treated as not version-controlled: Hatch SHALL NOT commit into a repository whose root it does not own. Every reference to a project being version-controlled elsewhere in this capability means exactly this.

#### Scenario: Project is a repository root

- **WHEN** a command runs in a project directory that is a git repository root
- **THEN** the project is treated as version-controlled and the command commits its effect

#### Scenario: Project is a subdirectory of an enclosing repository

- **WHEN** a command runs in a project directory that is not itself a repository root but lies inside an enclosing repository's work tree
- **THEN** the project is treated as not version-controlled
- **AND** the missing-version-control warning is emitted
- **AND** no commit is made to the enclosing repository

#### Scenario: No repository anywhere

- **WHEN** a command runs in a project directory with no git repository at or above it
- **THEN** the project is treated as not version-controlled
- **AND** the missing-version-control warning is emitted

### Requirement: Exactly one commit per operation in a version-controlled project

When the target project is a git repository root, each mutating command SHALL record its entire effect — placed or removed content together with the updated manifest — as exactly one commit. A command SHALL NOT produce more than one commit, and SHALL NOT leave part of its effect uncommitted.

#### Scenario: Initialization commits its scaffold

- **WHEN** `hatch init --harness claude` succeeds in a directory that is already a git repository
- **THEN** exactly one new commit exists
- **AND** that commit contains both the manifest and the placed self-documentation skill

#### Scenario: Import commits once

- **WHEN** an import succeeds in a version-controlled project
- **THEN** exactly one new commit exists, containing the placed content and the updated manifest
- **AND** the working tree has no uncommitted changes left by the command

#### Scenario: Removal commits once

- **WHEN** a removal succeeds in a version-controlled project
- **THEN** exactly one new commit exists, containing the removed content and the updated manifest

### Requirement: Operations succeed without version control

Every command SHALL complete its work normally in a project that is not a git repository, skipping only the commit. Absence of version control SHALL NOT cause a command to fail, refuse, or partially apply its effect.

#### Scenario: Import without version control

- **WHEN** `hatch import <name>` runs in an initialized project that is not a git repository
- **THEN** the content is placed and the manifest updated exactly as it would be in a version-controlled project
- **AND** no commit is attempted
- **AND** the command exits `0`

#### Scenario: Removal without version control

- **WHEN** `hatch remove <name>` runs in a project that is not a git repository
- **THEN** the content is removed and the manifest updated
- **AND** no commit is attempted
- **AND** the command exits `0`

### Requirement: Missing version control is warned on every invocation

When the target project is not a git repository, every command SHALL emit a warning saying so, on every invocation. The warning SHALL NOT be suppressed after a first occurrence, and SHALL NOT be conditional on the operation being destructive.

#### Scenario: Warning on each of successive commands

- **WHEN** two imports run in succession in a project that is not a git repository
- **THEN** both invocations emit the missing-version-control warning

#### Scenario: Warning does not affect the exit code

- **WHEN** a command emits the missing-version-control warning and otherwise succeeds
- **THEN** the command exits `0`

#### Scenario: Warning precedes a destructive removal

- **WHEN** `hatch remove <name> --force-all` runs in a project that is not a git repository
- **THEN** the missing-version-control warning is emitted
- **AND** the removal proceeds

### Requirement: The unchanged-on-failure guarantee holds without version control

Every command's "nothing was changed" contract SHALL hold independently of whether the project is a git repository. A command SHALL restore any content it placed or removed using its own record of what it changed, never by relying on a version-control operation to recover it.

#### Scenario: Import fails partway without version control

- **WHEN** an import fails partway through placing content in a project that is not a git repository
- **THEN** every file the command wrote is removed
- **AND** the manifest is byte-identical to its state before the command ran
- **AND** the command exits non-zero

#### Scenario: Removal fails partway without version control

- **WHEN** a removal fails partway through deleting content in a project that is not a git repository
- **THEN** every file the command deleted is restored with its original content
- **AND** the manifest is byte-identical to its state before the command ran
- **AND** the command exits non-zero

#### Scenario: Failure in a version-controlled project creates no commit

- **WHEN** any command fails in a version-controlled project
- **THEN** no new commit exists
- **AND** the working tree matches its state before the command ran

#### Scenario: Manifest and disk never diverge on failure

- **WHEN** any command fails in any project, version-controlled or not
- **THEN** the manifest's recorded content and what is present on disk describe the same state
