## MODIFIED Requirements

### Requirement: A check that cannot be automated is declared, not simulated

A decision whose verification requires judgment about what code means, rather than a fact a command can establish, SHALL declare its check as requiring judgment instead of presenting a command that appears to verify it. A record SHALL NOT carry a command whose success is unrelated to the property the record asserts.

Such a record SHALL declare either that no reviewer performs that judgment, or the reviewer that does. Where no reviewer is named, the runner SHALL report the record as unverified. Where a reviewer is named, the record SHALL additionally carry an executable check establishing that its delegation to that reviewer is intact, and the runner SHALL report the record under an outcome distinct from both a verified pass and an unverified record.

No record whose verification requires judgment SHALL be reported as a plain pass, so that a green run never overstates what was actually checked. The strongest claim a delegated record supports is that the judgment is still being asked for — not that the decision holds.

#### Scenario: A judgment-type decision declares itself

- **WHEN** a record's verification depends on assessing whether code means the right thing, and no reviewer performs that judgment
- **THEN** the record declares that its check requires review
- **AND** the runner reports it as unverified rather than as passed

#### Scenario: A judgment-type decision delegates to a reviewer

- **WHEN** a record's verification depends on assessing whether code means the right thing, and a named reviewer performs that judgment continuously
- **THEN** the record names that reviewer
- **AND** the record carries an executable check that the delegation is intact
- **AND** the record states what the reviewer must establish

#### Scenario: A delegated record is not reported as verified

- **WHEN** a record delegates its judgment and its delegation check succeeds
- **THEN** the report distinguishes it from a record whose check verified the decision itself
- **AND** the summary counts it under its own outcome

#### Scenario: A check stands in for a property it does not establish

- **WHEN** a record's check succeeds on the presence of a comment or phrase rather than on the behavior the record asserts
- **THEN** the record is reported as non-conforming

### Requirement: Every machine check runs continuously and blocks on failure

The machine checks SHALL be executed automatically on every pull request in both the CLI repository and the registry repository, and SHALL block a pull request that fails one.

The run SHALL report per record, so a failure names which decision is no longer true. A check that cannot be located, parsed, or executed SHALL be treated as a failure rather than skipped silently, so that a record dropping out of coverage is visible.

A check establishing that a delegated record's reviewer is still configured is a machine check like any other: it runs in the same run, on the same trigger, and blocks on failure.

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
- **AND** the report accounts for every record, including those reported as unverified and those whose judgment is delegated

## ADDED Requirements

### Requirement: A delegated judgment's link to its reviewer is verified continuously

Where a record delegates its judgment to a named reviewer, the link between the record and that reviewer's standards SHALL be established by an executable check rather than assumed.

The check SHALL establish that the reviewer's standards carry a rule bound to that record, that the rule is active, and that the rule names the record. A missing, inactive, or unbound rule SHALL fail the check and block the pull request.

A record that claims a judge it no longer has is a worse state than a record that declares itself unverified: the first reads as covered and is not, while the second is honest about what it does not know. The check exists to make the first state impossible to reach quietly.

#### Scenario: The reviewer's rule is in place

- **WHEN** the reviewer's standards carry an active rule bound to the record and naming it
- **THEN** the delegation check passes
- **AND** the record is reported as delegated rather than as verified

#### Scenario: The reviewer's rule is removed

- **WHEN** the rule bound to a delegating record is deleted from the reviewer's standards
- **THEN** the delegation check fails
- **AND** the report names the record that lost its reviewer
- **AND** the pull request is blocked from merging

#### Scenario: The reviewer's rule is deactivated

- **WHEN** the rule bound to a delegating record is present but no longer active
- **THEN** the delegation check fails, as it does for a removed rule

#### Scenario: The binding between record and rule is broken

- **WHEN** a record's identifier or a rule's binding changes so that the two no longer refer to each other
- **THEN** the delegation check fails
- **AND** the report names the record whose delegation could not be resolved
