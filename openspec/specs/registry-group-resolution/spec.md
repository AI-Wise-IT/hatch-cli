## Purpose

Defines how a group's declared members resolve to concrete registry content: the version constraint each pointer member may express, what each constraint resolves to, how a skill reached by several pointer paths is settled deterministically, and which situations abort an import rather than resolve to a guess.

## Requirements

### Requirement: A pointer member declares one of three version constraints

A pointer member SHALL express its version constraint in exactly one of three forms: none, an exact version (`X.Y.Z`), or a caret constraint (`^X.Y.Z`) naming a MAJOR and a floor within it. A nested member SHALL NOT express a version constraint of any kind.

#### Scenario: No constraint declared

- **WHEN** a group's pointer member declares no version
- **THEN** the member resolves to the registry's current published content for that name
- **AND** a later import of the same group picks up any newer version, including one in a higher MAJOR

#### Scenario: Exact version declared

- **WHEN** a group's pointer member declares an exact version
- **THEN** the member resolves to exactly that published version
- **AND** no newer version is selected, in that MAJOR or any other

#### Scenario: Caret constraint declared

- **WHEN** a group's pointer member declares `^1.2.0`
- **THEN** the member resolves to the newest published version whose MAJOR is `1` and which is not below `1.2.0`
- **AND** no version in any other MAJOR is selected

#### Scenario: Nested member carries no constraint

- **WHEN** a group's member is nested
- **THEN** it resolves to the content in that group's own folder at the group's own version
- **AND** any version constraint declared on it is rejected

### Requirement: A caret-constrained pointer tracks forward within its MAJOR only

A caret-constrained pointer SHALL resolve to the highest published version whose MAJOR equals the constraint's MAJOR and which is not below the constraint's floor, evaluated against the registry at resolution time. It SHALL NOT resolve to a version in a higher or lower MAJOR under any circumstance.

#### Scenario: A newer version exists within the constrained MAJOR

- **WHEN** the constraint is `^1.0.0` and versions `1.0.0`, `1.1.0` and `1.1.4` are published
- **THEN** the member resolves to `1.1.4`

#### Scenario: A newer MAJOR has been published

- **WHEN** the constraint is `^1.0.0`, and both `1.4.0` and `2.0.0` are published
- **THEN** the member resolves to `1.4.0`
- **AND** the existence of `2.0.0` does not affect the outcome and raises no warning

#### Scenario: Every version in the MAJOR is below the floor

- **WHEN** the constraint is `^1.5.0` and the highest published version in MAJOR `1` is `1.4.0`
- **THEN** the import is aborted, naming the member and the constraint that could not be satisfied
- **AND** nothing is placed in the target project

#### Scenario: Resolution reflects the registry at import time

- **WHEN** a group is imported, a newer version within the constrained MAJOR is subsequently published, and the same group is imported again
- **THEN** the second import resolves the member to the newer version without any edit to the group's own content

#### Scenario: No published version matches the constrained MAJOR

- **WHEN** a caret-constrained pointer names a MAJOR for which no version is published
- **THEN** the import is aborted, naming the member and the constraint that could not be satisfied
- **AND** nothing is placed in the target project

### Requirement: An unrecognized version constraint is rejected before any content is fetched

A version constraint that matches none of the supported forms SHALL be rejected while the group's member list is being read, before any registry content is fetched on its behalf. The rejection SHALL name the group and identify the offending member.

#### Scenario: Version constraint in an unsupported form

- **WHEN** a group declares a pointer member whose version is a string matching no supported form
- **THEN** the import is aborted with a message naming the group and the offending member
- **AND** no fetch is attempted for that member

#### Scenario: Version constraint of a non-string type

- **WHEN** a group declares a pointer member whose version is not a string
- **THEN** the import is aborted with a message naming the group and the offending member

### Requirement: A name reached by several pointer paths resolves deterministically

When resolving one group, a skill name reached through two or more pointer paths SHALL resolve to a single version determined by a fixed rule, never by traversal order. An unconstrained path SHALL express no opinion and SHALL NOT prevent a constrained path from governing the outcome.

#### Scenario: Constrained and unconstrained paths reach the same name

- **WHEN** one pointer path declares a constraint on a name and another declares none
- **THEN** the declared constraint governs the resolved version
- **AND** no warning is raised

#### Scenario: Two constraints agree on MAJOR

- **WHEN** two or more pointer paths reach the same name with constraints that all resolve within one MAJOR
- **THEN** the highest resolved version among them is selected
- **AND** a warning names every conflicting constraint and which version was used

#### Scenario: Constraints disagree on MAJOR

- **WHEN** two or more pointer paths reach the same name with constraints resolving to different MAJOR versions
- **THEN** the import is aborted, naming the skill and every conflicting constraint
- **AND** nothing is placed in the target project, no manifest entry is written, and no commit is made

#### Scenario: All paths agree exactly

- **WHEN** every pointer path reaching a name expresses the same constraint
- **THEN** that constraint governs and no warning is raised

### Requirement: A group re-import resolves its members before concluding nothing changed

A re-import of a group SHALL resolve its member graph before deciding whether the project is already up to date. It SHALL NOT infer from the group's own unchanged version that no member changed. This applies to every group, whatever constraint forms its members declare.

When the group's own version is unchanged, no pin changed, and every member resolves to the version the project already records, the import SHALL report no change, leave the manifest untouched and make no commit.

#### Scenario: A member moved while the group stood still

- **WHEN** a group whose own version is unchanged is imported again
- **AND** one of its caret-constrained members now resolves to a higher version within its MAJOR
- **THEN** the member is updated and the change is reported
- **AND** no edit to the group's own content was needed to make that happen

#### Scenario: Nothing moved

- **WHEN** a group is imported again and every member resolves to the version already recorded
- **THEN** the import reports the group is already up to date
- **AND** the manifest is unchanged and no commit is made

#### Scenario: A group with no constrained members

- **WHEN** a group whose members declare no version constraints is imported again
- **THEN** its member graph is still resolved before the no-op is reported
- **AND** the outcome is the same no-op it produced before this behavior existed

### Requirement: A group's pointer constraint is resolved fresh and never becomes a project-level pin

A version constraint declared inside a group SHALL be resolved each time that group is unpacked and SHALL NOT be recorded in the target project as a sticky pin governing later imports. A project-level pin, recorded when a developer pins a standalone import, SHALL remain a distinct mechanism.

#### Scenario: Re-import re-resolves the constraint

- **WHEN** a group carrying a caret-constrained pointer is imported a second time
- **THEN** the constraint is resolved again against the registry's current state
- **AND** the outcome is not read from a pin recorded by the earlier import

#### Scenario: Group constraint does not pin the placed skill

- **WHEN** a skill is placed as a caret-constrained pointer member of a group
- **AND** the developer later imports that same skill by name with no version
- **THEN** the group's constraint does not govern that import
