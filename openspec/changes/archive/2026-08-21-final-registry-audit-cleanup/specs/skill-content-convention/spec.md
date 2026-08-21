## ADDED Requirements

### Requirement: Registry content carries discoverable metadata in the expected place

Every top-level registry folder that represents real or testing content SHALL carry a parseable JSON object at `skill.json`. The object SHALL include a semantic `version` and a boolean `testing` declaration.

A plain skill SHALL carry its discoverable name and description in `SKILL.md` frontmatter. The frontmatter `name` SHALL match the top-level import name, except for a deliberate harness-specific variant whose folder suffix is stripped on import. A plain skill SHALL NOT carry a `description` in `skill.json`.

A group SHALL carry its description in its own `skill.json`, alongside `version`, `testing`, and `members`. A group SHALL NOT rely on a group-level `SKILL.md` for its description.

#### Scenario: Plain skill metadata is coherent

- **WHEN** the registry contains a top-level plain skill
- **THEN** the skill's `skill.json` carries `version` and `testing`
- **AND** the skill's `SKILL.md` frontmatter carries a `name` matching its import name
- **AND** the frontmatter carries a non-empty `description`
- **AND** the skill's `skill.json` carries no `description`

#### Scenario: Group metadata is coherent

- **WHEN** the registry contains a top-level group
- **THEN** the group's `skill.json` carries `version`, `testing`, `description`, and `members`
- **AND** the group description describes the bundle rather than copying a member skill's description

### Requirement: Registry names are stable, task-oriented import handles

A real skill or group's top-level folder name SHALL be the name a user or agent passes to `hatch import`, subject only to the harness-suffix resolution rule. The name SHALL be kebab-case and task-oriented enough that it can stand alone in `hatch list`.

A real top-level name SHALL be permanent and SHALL NOT be renamed or deleted.

#### Scenario: Skill name describes the task

- **WHEN** a plain skill is accepted as real importable content
- **THEN** its import name describes the task the skill performs
- **AND** its frontmatter name matches that import name

#### Scenario: Group name describes the bundled workflow

- **WHEN** a group is accepted as real importable content
- **THEN** its import name describes the bundled workflow or capability users receive by importing the group
- **AND** the group name does not imply that one member skill is importable when it is only nested inside the group

### Requirement: Reusable skills are standalone; dependent workflows are groups

A skill that is useful on its own SHALL live as a top-level plain skill. A group SHALL use a pointer member for any skill or group that is useful outside that group. A nested member SHALL be used only for content that exists solely as part of its containing group.

A standalone plain skill SHALL NOT semantically require another skill in order to complete its own workflow. If a skill's normal successful use depends on another skill being present, the dependent workflow SHALL be published as a group that includes the required skill as a member. Any required skill that is useful on its own SHALL be included as a pointer member. Any dependent member with no useful standalone role MAY be nested inside the group.

Groups SHALL unpack into flat individual member entries in the target project. A group SHALL NOT be used as the only way to access a reusable standalone skill.

#### Scenario: Reusable skill is included by pointer

- **WHEN** a group includes a member skill that is also useful when imported alone
- **THEN** the member lives as a top-level plain skill
- **AND** the group lists it as a pointer member

#### Scenario: Dependent member is nested

- **WHEN** a workflow step has no useful standalone role because it depends on another member to complete the workflow
- **THEN** that step may live as a nested group member
- **AND** the group includes the required standalone skill as a pointer member when that required skill is independently useful

#### Scenario: Standalone skill does not require another skill

- **WHEN** a plain skill is published as a top-level import target
- **THEN** the skill can complete useful work without assuming another Hatch skill was imported alongside it
- **AND** any optional handoff to another skill is described as optional or follow-on work rather than required for success

### Requirement: Skill instructions define responsibility, inputs, outputs, and handoffs

Every real importable plain skill's `SKILL.md` SHALL state:

- what work the skill owns
- when it should be used
- what inputs it reads or requires
- what output or durable artifact it produces
- what work it deliberately does not own
- how it hands off to any later skill or workflow

The instruction text SHALL keep skill-specific workflow details in the skill itself. Specs SHALL capture registry behavior and cross-skill conventions; specs SHALL NOT encode the exact conversational flow of any individual skill.

#### Scenario: Skill-specific flow remains skill content

- **WHEN** a skill's conversational or procedural flow changes
- **THEN** the revised flow is authored in that skill's `SKILL.md`
- **AND** the skill-content convention spec is not expanded with that skill's specific phases, prompts, or process details

#### Scenario: Handoff boundary is explicit

- **WHEN** a skill expects later work to be performed by another skill or workflow
- **THEN** its instructions name the handoff and the artifact or decision being handed off
- **AND** the skill does not silently perform work it says belongs to another skill or workflow

### Requirement: References and assets live with the content that owns them

A supporting reference or asset SHALL live inside the top-level skill folder or group member folder that owns and uses it. When content moves, its owned references and assets SHALL move with it, and internal links SHALL be updated.

A group SHALL NOT own a reference or asset that only one pointer member uses, unless the reference describes the group-level bundle rather than a member skill's behavior.

#### Scenario: Owned asset moves with skill content

- **WHEN** a skill or nested member is renamed or moved
- **THEN** the references and assets it alone owns move with that content
- **AND** the content's internal links point at the moved paths

#### Scenario: Group-level reference belongs to the group

- **WHEN** a reference describes how a group-level workflow combines its members
- **THEN** the reference may live in the group folder
- **AND** member-specific references remain with the member that uses them

### Requirement: Skill content is reviewable by checklist

Registry content SHALL be reviewed against the skill-content convention before it is accepted as real importable content. The review SHALL record whether each entry passes, needs content edits, must be restructured as a group or standalone skill, is removed, or remains fixture-only.

A real importable entry SHALL NOT be accepted merely because its files satisfy registry metadata checks. The content review SHALL also check that responsibilities are bounded, outputs are inspectable, required dependencies are represented by group membership, handoffs are named, and instructions do not silently claim work owned by another skill.

#### Scenario: Metadata-valid skill still needs content review

- **WHEN** a skill has valid `skill.json` and `SKILL.md` frontmatter
- **AND** its body does not clearly state what artifact or outcome it produces
- **THEN** the content review marks it as needing content edits before acceptance

#### Scenario: Metadata-valid group still needs content review

- **WHEN** a group has valid `skill.json` metadata and member declarations
- **AND** its member structure does not match the semantic dependencies of the workflow
- **THEN** the content review marks it as needing structure or content edits before acceptance
