## Purpose

Defines the structure, lifecycle and verification contract every architecture decision record follows, so that a settled decision cannot be quietly rewritten and the checks the records carry are executed continuously rather than merely described.

## ADDED Requirements

### Requirement: Every decision record declares a lifecycle status

Every architecture decision record SHALL declare a `status` of exactly one of `concept`, `accepted`, or `superseded`.

A `concept` record is working material: its content is freely editable, and nothing may depend on it as settled. An `accepted` record states a decision the project is operating under. A `superseded` record SHALL name the record that replaces it.

A record whose status is absent, or is a value outside that set, SHALL be rejected.

#### Scenario: A record declares an accepted decision

- **WHEN** a decision record declares `status: accepted`
- **THEN** the record is treated as settled
- **AND** its frozen sections are immutable per the immutability requirement

#### Scenario: A record declares working material

- **WHEN** a decision record declares `status: concept`
- **THEN** every section of the record may be edited freely
- **AND** no other record and no agent rule may cite it as a settled decision

#### Scenario: A record is missing a status

- **WHEN** a decision record declares no `status`, or declares one outside the permitted set
- **THEN** the record is reported as non-conforming
- **AND** the check that evaluates record structure fails

### Requirement: An accepted decision is superseded, never edited

The **Decision**, **Agent Rules** and **Invariants** sections of an `accepted` record SHALL be immutable. Changing what any of them states SHALL require a new record that supersedes the original, never an edit in place.

Every other section — including **Context**, **Alternatives Considered**, **Trade-offs Accepted**, **Consequences**, **Machine Check**, **Precedence**, and explicitly-marked post-acceptance correction sections — MAY be edited, because repairing a check that has rotted, correcting a fact that has since changed, and adding a cross-reference to a later record are all maintenance of an unchanged decision.

An edit to an editable section SHALL NOT change what a frozen section mandates. A correction that would alter the decision itself SHALL be made as a superseding record.

#### Scenario: A frozen section is edited

- **WHEN** a change modifies the Decision, Agent Rules, or Invariants section of a record whose status is `accepted`
- **THEN** the change is rejected
- **AND** the report names the record, the section, and supersession as the remedy

#### Scenario: A rotted check is repaired in place

- **WHEN** a change modifies only the Machine Check section of an accepted record
- **THEN** the change is permitted

#### Scenario: A later record is cross-referenced

- **WHEN** a change adds a reference to a newer record in an accepted record's Precedence section
- **THEN** the change is permitted

#### Scenario: A decision genuinely changes

- **WHEN** a decision recorded in an accepted record no longer holds
- **THEN** a new record is added that supersedes it
- **AND** the original record's status becomes `superseded` and names its replacement
- **AND** the original record's frozen sections remain byte-for-byte as accepted

#### Scenario: A concept record is revised

- **WHEN** a change modifies any section of a record whose status is `concept`
- **THEN** the change is permitted, including to Decision, Agent Rules and Invariants

### Requirement: A record's machine check is expressed so it can be executed

Every decision record SHALL carry a machine check in a form a runner can locate and execute without human interpretation: a single fenced shell block in the record's designated check section, accompanied by a stated expected result.

A check SHALL be executable as written. It SHALL NOT contain unexpanded placeholders standing in for a path or value the reader is expected to substitute, and SHALL NOT be constructed so that it reports success regardless of what it finds.

A check SHALL declare which repository it runs against, since the records live in one repository and some checks inspect the other.

#### Scenario: A check is executable as written

- **WHEN** a record's machine check is extracted by the runner
- **THEN** it runs without further substitution
- **AND** its outcome distinguishes pass from fail by exit status

#### Scenario: A check carries an unexpanded placeholder

- **WHEN** a record's machine check contains a placeholder standing in for a value the reader must supply
- **THEN** the record is reported as non-conforming

#### Scenario: A check cannot fail

- **WHEN** a record's machine check is written so that it exits successfully regardless of what it finds
- **THEN** the record is reported as non-conforming

### Requirement: A check that cannot be automated is declared, not simulated

A decision whose verification requires judgment about what code means, rather than a fact a command can establish, SHALL declare its check as requiring review instead of presenting a command that appears to verify it.

The runner SHALL report such records as unverified rather than passing them, so that a green run never overstates what was actually checked. A record SHALL NOT carry a command whose success is unrelated to the property the record asserts.

#### Scenario: A judgment-type decision declares itself

- **WHEN** a record's verification depends on assessing whether code means the right thing
- **THEN** the record declares that its check requires review
- **AND** the runner reports it as unverified rather than as passed

#### Scenario: A check stands in for a property it does not establish

- **WHEN** a record's check succeeds on the presence of a comment or phrase rather than on the behavior the record asserts
- **THEN** the record is reported as non-conforming

### Requirement: Every machine check runs continuously and blocks on failure

The machine checks SHALL be executed automatically on every pull request in both the CLI repository and the registry repository, and SHALL block a pull request that fails one.

The run SHALL report per record, so a failure names which decision is no longer true. A check that cannot be located, parsed, or executed SHALL be treated as a failure rather than skipped silently, so that a record dropping out of coverage is visible.

Enforcement SHALL be blocking from the moment it lands. This protects the integrity of the decision record set itself rather than a pre-launch cleanup window, so it requires no advisory period.

#### Scenario: A decision stops being true

- **WHEN** a change causes a record's machine check to fail
- **THEN** the run fails
- **AND** the report names the record whose decision no longer holds
- **AND** the pull request is blocked from merging

#### Scenario: A check cannot be run

- **WHEN** a record's machine check cannot be located, parsed, or executed
- **THEN** the run fails and names that record
- **AND** the outcome is not reported as a pass

#### Scenario: Every check passes

- **WHEN** every record's machine check succeeds
- **THEN** the run succeeds
- **AND** the report accounts for every record, including those declared as requiring review

### Requirement: The record set has a conforming structure

Every decision record SHALL carry the sections the contract requires, so that a runner can locate a record's status, its frozen sections, and its check by structure rather than by guessing.

Conformance SHALL be evaluated across the whole record set rather than only the records a change touches, so that a record cannot drift out of conformance without a change that names it.

#### Scenario: A record omits a required section

- **WHEN** a record is missing a section the contract requires
- **THEN** the record is reported as non-conforming and named
- **AND** the check fails

#### Scenario: An unrelated change is made

- **WHEN** a pull request modifies no decision record
- **THEN** conformance is still evaluated across the whole record set
