## Purpose

Defines the repository-wide conventions that make registry skills and groups understandable, reviewable, and safe to import as durable Hatch content.

## MODIFIED Requirements

### Requirement: Registry names are stable, task-oriented import handles

A real skill or group's top-level folder name SHALL be the name a user or agent passes to `hatch import`, subject only to the harness-suffix resolution rule. The name SHALL be kebab-case and task-oriented enough that it can stand alone in `hatch list`.

A plain skill's name SHALL be a verb-first task phrase: a verb naming the work the skill performs, followed by the object it acts on where one is needed to make the work clear. A plain skill's name SHALL NOT be a noun phrase naming the artifact the skill produces, or naming a quality or property of its output.

A group's name SHALL describe the bundled workflow or capability a user receives by importing it. A group name is not required to take the verb-first form, because a group is a bundle of work rather than a single action.

A real top-level name SHALL be permanent and SHALL NOT be renamed or deleted. Permanence outranks the naming form: the form binds a name at the moment it is first published, and a name already published SHALL NOT be renamed to comply with it.

#### Scenario: Skill name describes the task

- **WHEN** a plain skill is accepted as real importable content
- **THEN** its import name describes the task the skill performs
- **AND** its frontmatter name matches that import name

#### Scenario: Skill name takes the verb-first form

- **WHEN** a plain skill is proposed as real importable content
- **THEN** its import name leads with a verb naming the work the skill performs
- **AND** the name reads as an action an agent takes rather than as a document or result a user receives

#### Scenario: Name proposed for the skill's output is rejected before publication

- **WHEN** a plain skill is proposed under a noun-phrase name that describes the artifact it produces or a quality of its output
- **THEN** the content review rejects the name before the skill is published
- **AND** the review requires a verb-first task phrase in its place

#### Scenario: Already-published name is not renamed to comply

- **WHEN** a plain skill published before this form was required carries a noun-phrase name
- **THEN** the name is left unchanged
- **AND** the name-permanence rule governs, because renaming published content is forbidden

#### Scenario: Group name describes the bundled workflow

- **WHEN** a group is accepted as real importable content
- **THEN** its import name describes the bundled workflow or capability users receive by importing the group
- **AND** the group name does not imply that one member skill is importable when it is only nested inside the group
- **AND** the group name is not required to lead with a verb
