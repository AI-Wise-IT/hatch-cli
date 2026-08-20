> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Not scoped, not designed, not scheduled — no specs, design or tasks exist, and the Capabilities section below is provisional. Nothing here is decided.

## Why

Registry CI enforces a growing set of rules about a skill's *place* in the registry: its name is permanent ([ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md)), it declares whether it is testing content ([ADR-0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md)), it claims no destination path another source claims ([ADR-0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md)), it bumps its version when it changes, and — once [`add-registry-listing`](../add-registry-listing/proposal.md) lands — it carries a description.

Nothing enforces that it is a usable skill. A folder with a `skill.json` and no `SKILL.md` at all satisfies every check that exists today. So does one whose frontmatter names something other than its folder, or whose description is a single word, or that reads as an unfinished draft. Every one of those publishes cleanly, becomes permanently named, and is importable.

Two things make this worth fixing rather than leaving to review. Publishing is irreversible in the way that matters: [ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) makes the name permanent, so a folder published half-finished stays in the namespace forever. And discovery raises the stakes — a listing turns every published folder into something a developer or agent is shown and invited to import, where before you had to already know its name to find it at all.

## What Changes

Sketch only — none of this is settled, least of all what the minimum actually is.

- A defined minimum a folder must meet to be valid, publishable skill content.
- A blocking registry CI check enforcing it, alongside the checks already there.
- Documented in the registry `README.md` as authoring guidance, so the bar is stated before it is enforced.

Candidate rules, listed to be argued with rather than adopted: a `SKILL.md` exists; its frontmatter parses; it carries `name` and `description`; the `name` matches the folder name; the description is a real sentence rather than a placeholder; a group carries its own description instead.

## Capabilities

Provisional. Registry-content rules currently live in `testing-skill-convention`, which is scoped to one specific classification rather than to content validity generally. Whether this extends that capability, creates a `registry-content-standards` capability, or something else, is a scoping decision.

### New Capabilities

- `registry-content-standards` (provisional, name included): what makes a folder valid, publishable content.

### Modified Capabilities

- None assumed.

## Open Questions

- **What the minimum actually is.** The whole substance of this change. A bar that only checks a file exists is not worth a CI job; a bar that tries to judge whether prose is good is not mechanically checkable. The useful line is somewhere between, and finding it is the scoping work.
- **How it applies to already-published content.** Every existing folder either meets the bar or does not. Bringing one up to it means editing it, which means a version bump, which publishes a new version of content that did not change in substance. Whether the check is retroactive or applies only to new and changed folders is a real decision with real cost either way.
- **Advisory first, or blocking immediately.** The name-permanence check ran in `warn` mode before the hardening cutover. A content check could follow the same path, which would let the registry be measured against the bar before the bar is enforced.
- **Whether groups have their own minimum.** A group has no `SKILL.md`; its validity is about its `members` list and its own description. Probably a separate set of rules under the same check.
- **Relationship to Tessl grading.** `intake/mvp-scope.md` defers showing a Tessl grade because no usable grading exists yet. A locally-defined minimum is a different thing — a floor rather than a score — but the two would eventually have to be reconciled rather than both applied independently.
- **Whether the CLI enforces anything.** Everything here is a registry-side publish-time check. Whether `hatch import` should also refuse or warn on content that fails the bar, or trust the registry entirely, is open — and leans towards trusting it, since versions published before the bar existed stay reachable through pins forever.
