## Purpose

Defines what makes a piece of registry content a testing skill — content that exists only to exercise the CLI — and the rules that follow from that classification: it is exempt from name permanence, it is never importable into an ordinary project, and it is otherwise treated exactly like real content.

## Requirements

### Requirement: Every published folder declares whether it is testing content

Every top-level registry folder's `skill.json` SHALL carry a boolean `testing` field. The field is mandatory on all content, testing or not: real content declares `"testing": false`, testing content declares `"testing": true`. The registry's content checks SHALL reject any top-level folder whose `skill.json` omits the field or gives it a non-boolean value.

A folder is a testing skill when its top-level folder name begins with `_` **and** its `skill.json` declares `"testing": true`. The two markers SHALL agree: the checks SHALL reject a `_`-prefixed folder declaring `false` and a folder declaring `true` without the prefix.

The leading `_` character SHALL be reserved: no skill or group intended as real, importable content may use a top-level folder name beginning with `_`.

The requirement to declare applies to top-level folders only — a group's nested member carries no `skill.json` of its own and inherits its group's classification.

#### Scenario: Correctly marked testing skill

- **WHEN** the registry contains `_reimport-fixture/` whose `skill.json` declares `"testing": true`
- **THEN** the content checks pass
- **AND** the folder is treated as a testing skill by every rule in this capability

#### Scenario: Correctly marked real content

- **WHEN** a real skill folder named `prd-elicitation/` declares `"testing": false`
- **THEN** the content checks pass
- **AND** the folder is treated as ordinary, importable content

#### Scenario: Field omitted entirely

- **WHEN** any top-level folder's `skill.json` carries no `testing` field
- **THEN** the content checks report the folder as undeclared
- **AND** the check exits non-zero

#### Scenario: Field present but not a boolean

- **WHEN** a top-level folder's `skill.json` gives `testing` a non-boolean value
- **THEN** the content checks report the folder as undeclared
- **AND** the check exits non-zero

#### Scenario: Prefix contradicts the declaration

- **WHEN** a folder named `_some-fixture/` declares `"testing": false`
- **THEN** the content checks report the folder's markers as disagreeing
- **AND** the check exits non-zero

#### Scenario: Declaration without the prefix

- **WHEN** a folder named `some-fixture/` declares `"testing": true`
- **THEN** the content checks report the folder's markers as disagreeing
- **AND** the check exits non-zero

#### Scenario: New content cannot be published undeclared

- **WHEN** a pull request adds a new top-level folder whose `skill.json` omits the `testing` field
- **THEN** the content checks report the new folder as undeclared
- **AND** the check exits non-zero, so no folder can enter the registry without a classification

### Requirement: Testing skills are exempt from name permanence

The name-permanence rule — a published top-level folder name is never deleted and never renamed — SHALL NOT apply to a testing skill. A testing skill's folder MAY be renamed or deleted through an ordinary pull request at any time, including after the enforcement cutover that makes the rule blocking for all other content.

The rule SHALL continue to apply, unchanged, to every top-level folder that is not a testing skill, regardless of the enforcement mode in effect.

#### Scenario: Deleting a testing skill is allowed

- **WHEN** a pull request deletes a top-level folder that was marked a testing skill at the base commit
- **AND** the name-permanence check runs in blocking mode
- **THEN** the check reports no violation for that folder
- **AND** the check exits zero

#### Scenario: Renaming a testing skill is allowed

- **WHEN** a pull request renames `_old-fixture/` to `_new-fixture/`
- **AND** the name-permanence check runs in blocking mode
- **THEN** the check reports no violation
- **AND** the check exits zero

#### Scenario: Deleting real content is still blocked

- **WHEN** a pull request deletes a top-level folder that carries no testing marker
- **AND** the name-permanence check runs in blocking mode
- **THEN** the check reports the missing name as a violation
- **AND** the check exits non-zero

#### Scenario: Classification is read from the base commit

- **WHEN** a pull request deletes a folder, so no `skill.json` exists for it at the head commit
- **THEN** the check determines whether that folder was a testing skill from its state at the base commit
- **AND** allows or blocks the deletion on that basis

### Requirement: Real content can never be reclassified as a testing skill

Marking an already-published real folder as a testing skill SHALL require renaming it to a `_`-prefixed name, which the name-permanence rule forbids. The registry's content checks SHALL therefore reject any change that flips a top-level folder's declaration from `false` to `true` when that folder already existed at the base commit.

Publishing a testing skill's content as real content SHALL be done by adding a new, unprefixed folder. The originating testing skill SHALL remain a testing skill and SHALL remain deletable.

#### Scenario: Flipping published real content to testing

- **WHEN** a pull request changes `prd-elicitation/skill.json` from `"testing": false` to `"testing": true`, a folder that existed at the base commit
- **THEN** the content checks report the reclassification as a violation
- **AND** the check exits non-zero

#### Scenario: Promoting a fixture to real content

- **WHEN** a pull request adds a new unprefixed folder whose content originated in a testing skill, leaving the testing skill in place
- **THEN** the content checks pass
- **AND** the new folder is ordinary importable content
- **AND** the original testing skill remains exempt from name permanence

### Requirement: A testing skill may not be a member of non-testing content

A group that is not itself a testing skill SHALL NOT list a testing skill among its members, whether as a nested member or as a pointer. The registry's content checks SHALL reject such a group. A group that is itself a testing skill MAY list testing skills as members.

#### Scenario: Real group pointing at a testing skill

- **WHEN** a group with no testing marker lists a pointer member whose name begins with `_`
- **THEN** the content checks report the membership as a violation
- **AND** the check exits non-zero

#### Scenario: Testing group composed of testing skills

- **WHEN** a group marked as a testing skill lists pointer members that are themselves testing skills
- **THEN** the content checks pass

#### Scenario: Testing group pointing at real content

- **WHEN** a group marked as a testing skill lists a pointer member that is ordinary, non-testing content
- **THEN** the content checks pass
- **AND** the real member's own classification is unaffected by being pointed at

### Requirement: A project must opt in before it can import testing skills

The project manifest SHALL support an optional boolean `testProject` field. `testProject: true` marks the project as a test project; an absent or `false` field marks an ordinary project. The field SHALL be additive to the existing manifest schema, requiring no change to any field already recorded.

`hatch init` SHALL accept a flag that writes `testProject: true` into the manifest it creates. That flag SHALL NOT appear in the README or in the command's user-facing usage summary.

The opt-in SHALL NOT be applicable retroactively: `hatch init` never modifies an existing manifest. When the flag is given for a project that is already initialized and does not already record the opt-in, the system SHALL warn that the flag had no effect and that the manifest was left unchanged, without altering the command's exit code. Naming the flag in that warning is permitted — the caller has just typed it — unlike the import failures, which never name it.

#### Scenario: Initializing a test project

- **WHEN** `hatch init` runs with the test-project flag in an uninitialized directory
- **THEN** the manifest records `testProject: true` alongside the harness selection
- **AND** the command otherwise behaves exactly as an ordinary initialization

#### Scenario: Ordinary initialization records no field

- **WHEN** `hatch init --harness claude` runs without the test-project flag
- **THEN** the manifest carries no `testProject` field, or records it as `false`
- **AND** the project is treated as an ordinary project

#### Scenario: The flag cannot be applied to an already-initialized project

- **WHEN** `hatch init` runs with the test-project flag in a project that is already initialized and does not record the opt-in
- **THEN** the system warns that the flag had no effect and the manifest was left unchanged
- **AND** the manifest is byte-identical to what it was before
- **AND** the command's exit code is what it would have been without the flag

#### Scenario: No warning when the project already opted in

- **WHEN** `hatch init` runs with the test-project flag in a project whose manifest already records `testProject: true`
- **THEN** no such warning is emitted, since the recorded state already matches the request

#### Scenario: Existing manifests keep working

- **WHEN** a command reads a manifest written before this field existed
- **THEN** the manifest is accepted and upgraded to the current schema version
- **AND** the project is treated as an ordinary project
- **AND** no recorded skill, version, pin, or harness value is altered

### Requirement: Testing content does not exist to a project that has not opted in

`hatch import <name>` SHALL fail — exit non-zero, nothing placed, no manifest change, no commit — when the target is testing content and the project is not a test project.

The failure SHALL be reported with the same message the system uses for a name the registry does not have, and SHALL be indistinguishable from that case: the output SHALL NOT reveal that the content exists, SHALL NOT describe it as testing content, and SHALL NOT name the manifest field or flag that would permit the import.

The check SHALL happen after authentication, at the point where resolution reports a missing name — an unauthenticated caller SHALL be asked to authenticate exactly as it would for any other import. The system SHALL apply the same treatment whether the target is identified as testing content by its name or by its own fetched declaration.

#### Scenario: A testing skill reports exactly what a missing name reports

- **WHEN** `hatch import _reimport-fixture` runs in a project whose manifest has no `testProject: true`
- **THEN** the system reports the name as not found in the registry, in the same wording it uses for a name that does not exist
- **AND** the message says nothing about testing content, `testProject`, or the flag that would permit the import
- **AND** nothing is placed, the manifest is unchanged, no commit is made, and the command exits non-zero

#### Scenario: A pinned testing target reports a missing ref

- **WHEN** `hatch import _reimport-fixture@1.0.0` runs in a project that has not opted in
- **THEN** the system reports that ref as not found in the registry, exactly as it reports a version tag that does not exist
- **AND** nothing is placed, the manifest is unchanged, and the command exits non-zero

#### Scenario: Authentication is required first

- **WHEN** `hatch import _reimport-fixture` runs in a project that has not opted in and no credentials are available
- **THEN** the system asks for credentials exactly as it would for any other import
- **AND** the outcome after authenticating is the not-found failure above

#### Scenario: Declared testing content without the prefix

- **WHEN** `hatch import some-name` runs in a project that has not opted in and the fetched folder's `skill.json` declares `"testing": true`
- **THEN** the system reports the same not-found failure
- **AND** nothing is placed, the manifest is unchanged, and the command exits non-zero

#### Scenario: A version published before the convention

- **WHEN** an import resolves to a published version whose `skill.json` carries no `testing` field, for a name that is not `_`-prefixed
- **THEN** the content is treated as ordinary and the import proceeds normally
- **AND** the missing field is not reported as an error

#### Scenario: Importing testing content into a test project

- **WHEN** `hatch import _reimport-fixture` runs in a project whose manifest records `testProject: true`
- **THEN** the import proceeds exactly as it would for ordinary content — resolution, placement, manifest recording, versioning, pinning, and commit behavior all unchanged

#### Scenario: An ordinary name is unaffected

- **WHEN** `hatch import prd-elicitation` runs in an ordinary project
- **THEN** the import proceeds normally, with no testing-related check affecting the outcome

### Requirement: A group never carries testing content into a project that has not opted in

When resolving a group's member graph in a project that is not a test project, the system SHALL fail the entire operation — nothing placed, no manifest change, no commit — if any pointer member names testing content or resolves to a folder declaring itself testing content.

The failure SHALL be reported as a pointer whose target the registry does not have, in the same wording used for a pointer at a name that genuinely does not exist, and SHALL NOT reveal that the target is testing content.

A nested member requires no such check: it carries no `skill.json` of its own and inherits its group's classification, so a non-testing group's nested members are ordinary content by definition. Registry-side checks reject a non-testing group that lists testing content as a nested member.

#### Scenario: A pointer at testing content

- **WHEN** `hatch import some-group` runs in a project that has not opted in and the group points at a testing skill
- **THEN** the system reports that pointer's target as not found in the registry
- **AND** the message does not describe the target as testing content
- **AND** no member of the group is placed, the manifest is unchanged, no commit is made, and the command exits non-zero

#### Scenario: A pointer at declared testing content without the prefix

- **WHEN** the pointed-at folder's own `skill.json` declares `"testing": true` though its name has no `_` prefix
- **THEN** the system reports the same not-found failure for that pointer, and places nothing

#### Scenario: Group resolution in a test project

- **WHEN** the same group is imported in a project recording `testProject: true`
- **THEN** resolution and placement proceed normally for every member, testing or not

### Requirement: Testing skills are otherwise treated as ordinary registry content

Being a testing skill SHALL change nothing about a folder's treatment beyond the rules stated in this capability. In particular:

- Destination-path collision detection SHALL include testing skills in the same destination namespace as all other content, so a destination name claimed by a testing skill and by any other source is reported as a collision.
- The version-bump requirement SHALL apply to a testing skill exactly as to real content: any change to its folder requires bumping its own `version`, and its `<name>@<version>` tag is published on merge as for any other folder.
- Fetch, resolution, placement, harness-suffix resolution, pinning, and the `removed` flag SHALL behave identically for a testing skill once an import is permitted.

#### Scenario: A testing skill collides with real content

- **WHEN** a testing skill's destination name is also claimed by another registry source
- **THEN** the collision check reports a collision naming both sources
- **AND** the check exits non-zero

#### Scenario: Changing a testing skill without bumping its version

- **WHEN** a pull request changes a testing skill's content and leaves its `version` untouched
- **THEN** the version-bump check reports the offending folder
- **AND** the check exits non-zero
