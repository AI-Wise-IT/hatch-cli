## Purpose

Defines how an external reviewer that judges what code means is used in this project: where its standards live, how a standard derived from a decision record is bound to that record, and why its findings inform a change rather than gate it.

## Requirements

### Requirement: The reviewer's standards live in the repository under version control

Every standard the reviewer enforces SHALL be held in files committed to the repository it reviews. Standards held only in the reviewer's own hosted settings SHALL NOT be relied on.

Configuration that lives outside a checkout cannot be diffed, reviewed, or read by a machine check, so it can be changed without a trace and can rot without anything noticing. A standard that is not in the repository is not a standard this project keeps.

#### Scenario: A standard is added or changed

- **WHEN** a standard the reviewer enforces is added, changed, or removed
- **THEN** it arrives as a change to a committed file
- **AND** it is subject to the same review and history as any other change to the repository

#### Scenario: A standard exists only in hosted settings

- **WHEN** a standard is configured only in the reviewer's hosted settings, outside the repository
- **THEN** the project does not depend on it
- **AND** no decision record cites it as the mechanism enforcing a rule

### Requirement: Exactly one root configuration form is present

Where the reviewer accepts more than one form of repository-root configuration and the presence of one causes another to be ignored, the repository SHALL carry exactly one of them.

Two forms present at once means part of the configuration is silently inert. Nothing in the reviewer's output distinguishes a standard that was evaluated and passed from a standard that was never read.

#### Scenario: A second configuration form is introduced

- **WHEN** a change adds a root configuration form alongside the one already present
- **THEN** the change is rejected
- **AND** the report names which form would have been ignored

#### Scenario: The single configuration form is in place

- **WHEN** the repository carries exactly one root configuration form
- **THEN** every standard it declares is read by the reviewer

### Requirement: Standards are declared in one place per repository

All standards SHALL be declared in the repository's root configuration. Directory-level configuration SHALL NOT be used, and a standard that applies to part of the tree SHALL express that by scoping the standard to those paths rather than by living beside them.

Where configuration nests, a child can deactivate a standard inherited from the root — so a rule enforcing a decision record could be present and active at the root while inert exactly where the decision applies, and a check reading the root would not see it. Keeping the declaration in one place is what makes the delegation check's own correctness establishable.

#### Scenario: A standard applies to part of the tree

- **WHEN** a standard is meant to apply only to some directories or file types
- **THEN** it is declared in the root configuration
- **AND** it names the paths it applies to

#### Scenario: Directory-level configuration is introduced

- **WHEN** a change adds reviewer configuration in a subdirectory
- **THEN** the change is rejected
- **AND** the report names the file and the root configuration it would have modified

#### Scenario: A record's standard is resolved

- **WHEN** a delegation check establishes whether a record's standard is present and active
- **THEN** it reads the root configuration alone
- **AND** no traversal of the directory tree is required to know what applies

### Requirement: A standard derived from a decision record cites the record rather than restating it

Where the reviewer enforces a decision already recorded in an architecture decision record, the record itself SHALL be supplied to the reviewer as review context, and the standard SHALL identify the record and state what the reviewer must establish — not reproduce the record's rules.

This holds across repositories. Where a repository's standards enforce decisions whose records live in another repository, the records remain the source the reviewer reads; a copy of a record placed alongside the standards that cite it is exactly the duplicate this requirement forbids.

A restatement is a second copy of a decision that has to be kept in agreement with the first. This project has twice rejected an index whose contents could drift from their source, and a reviewer's rule set restating the records would be the same failure in a new place.

#### Scenario: A record's rules are amended

- **WHEN** a decision record's rules change through the record's own lifecycle
- **THEN** the reviewer enforces the amended rules
- **AND** no standard file needs editing to keep the two in agreement

#### Scenario: A standard reproduces a record's rules

- **WHEN** a standard restates the content of a decision record's rules rather than citing the record
- **THEN** the standard is rejected as a duplicate of its source

#### Scenario: The standards and the records live in different repositories

- **WHEN** a repository's standards enforce decisions recorded in another repository
- **THEN** the reviewer reads those records from the repository that owns them
- **AND** no copy of a record is held in the repository whose standards cite it

### Requirement: A standard that enforces a decision record is bound to it by the record's identifier

Every standard that exists to enforce a decision record SHALL carry a stable identifier derived from that record's own identifier, and SHALL be individually addressable by it.

The identifier is what makes the link machine-checkable in both directions: a record can assert that its standard exists, and a standard can be traced to the decision that justifies it. A standard without one cannot be found, cannot be selectively disabled, and cannot be verified to still exist.

#### Scenario: A record's standard is located

- **WHEN** a check looks for the standard enforcing a given decision record
- **THEN** it locates the standard by the record's identifier alone
- **AND** requires no search of the standard's text

#### Scenario: A standard carries no identifier

- **WHEN** a standard enforcing a decision record carries no identifier binding it to that record
- **THEN** the standard is rejected

### Requirement: The reviewer's findings are advisory

The reviewer's findings SHALL NOT block a pull request from merging, and its status SHALL NOT be configured as a required check.

The same change reviewed twice can produce different findings. A gate whose verdict is not reproducible is a gate that fails changes for reasons its author cannot act on and cannot re-run to clear. The deterministic checks remain the merge gate; the reviewer informs the change rather than deciding it.

#### Scenario: The reviewer reports a finding

- **WHEN** the reviewer reports a finding on a pull request
- **THEN** the finding is visible on the change
- **AND** the pull request remains eligible to merge on the strength of its deterministic checks

#### Scenario: The reviewer is unavailable

- **WHEN** the reviewer does not run, errors, or produces no review
- **THEN** no pull request is blocked from merging as a result

### Requirement: The repositories the reviewer indexes are a recorded decision

The set of repositories submitted to the reviewer SHALL be stated in an architecture decision record, and adding a repository to that set SHALL be a change to that record.

Submitting a repository to an external reviewer sends its contents outside the project's control. Where a repository is private, that is a decision about its confidentiality, and a decision of that kind belongs in the record set rather than in a settings page.

#### Scenario: A repository is submitted to the reviewer

- **WHEN** a repository is indexed by the reviewer
- **THEN** an accepted decision record names it as part of the reviewed set

#### Scenario: A repository is added to the reviewed set

- **WHEN** a repository not named by any record is to be reviewed
- **THEN** the record naming the reviewed set is amended or superseded first
