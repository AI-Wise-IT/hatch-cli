# Harness-targeting via flat, suffixed skill folders

## Metadata

- **id:** 0001-harness-suffix-convention
- **component:** skill-registry-harness-targeting
- **status:** accepted
- **applies_to:** every skill folder under the skill registry's source tree; `hatch import`'s resolution and deployment logic; the registry's duplicate-destination-path publish lint
- **decision_record:** `docs/architecture/decisions/0001-harness-suffix-convention.md`

## Decision

Skill folders in the registry are flat and top-level — never nested inside a shared parent.

A harness-neutral skill (identical behavior across every supported harness) lives at `<name>/SKILL.md`, with no suffix.

A harness-differentiated or harness-exclusive variant lives at a sibling folder `<name>-<code>/SKILL.md`, where `<code>` is always the final hyphen-segment of the folder name and is drawn from a closed, abbreviated set of reserved harness codes. That set is not enumerated here — it is maintained as a single canonical registry in the Hatch CLI codebase (see Consequences), so adding a harness later is a registry change, not a change to this record.

A family may mix an unsuffixed default with a single harness-specific override (e.g. `handover/` as the default, plus `handover-cdx/` overriding only Codex).

`hatch import <name>` resolves per target harness `H` by preferring `<name>-<H-code>/`, falling back to the unsuffixed `<name>/` if no override exists, and reporting the skill unavailable for `H` if neither exists. Deployment strips the harness-code suffix, so the resolved source always lands under the plain name `<name>` inside that harness's own skill directory (e.g. `handover-cdx/SKILL.md` deploys to `.codex/skills/handover/SKILL.md`).

## Context

The registry's skills must be independently discoverable and gradable by Tessl.io. Direct inspection of an existing Tessl-indexed skill (`linuxfoundation/crowd.dev`'s `adr` skill) confirmed Tessl discovers and registers a skill from a flat, harness-specific path (`.claude/skills/adr/SKILL.md`) under a single flat registry name (`adr`) — there is no evidence Tessl recognizes or merges nested per-harness variant folders into one identity. Tessl's own documentation states its skills are "agent-agnostic... adapted to each [agent] on install," a feature this project has deliberately decided not to rely on: Hatch owns both placement (`hatch import`) and any harness-specific rewriting itself, because harness divergence can run deeper than wording. Direct inspection of `flex-exp` (this project's own prior global-skills repo) showed its real `handover` skill needed three fully independent rewrites — Claude task chips, Codex threads, Cursor's prompt-paste-only flow are genuinely different primitives, not a shared script with per-harness word substitutions.

The PRD (`intake/product-requirements.md`, "For the architecture step" and Must-scope items) had already settled two constraints this decision must satisfy: harness-targeting must be expressed structurally, via folder placement or naming, never via metadata in a skill's own manifest; and the registry must already enforce that no two skills claim the same destination path, via Hatch's own scannable tooling rather than a check placed in every target project.

flex-exp's actual mechanism — a shared root `skills/<name>/SKILL.md` plus nested `.targets/<claude|codex|cursor>/SKILL.md` overrides — was inspected directly and found incompatible with Tessl's flat, one-folder-one-identity discovery model, which is what motivated this decision to diverge from that precedent.

The three harnesses in scope today are Claude, Codex, and Cursor, with abbreviated codes chosen over the full words specifically to avoid reserving meaningful, unremarkable English-adjacent words (see Alternatives Considered). Those codes are deliberately not fixed in this record: onboarding a future harness must not require superseding this decision, only extending the registry this record points to.

## Alternatives Considered

- **flex-exp's nested `.targets/<harness>/SKILL.md` mechanism**, reused as-is. Not chosen: nested variants are not independently discoverable or gradable by Tessl, and may be invisible to it entirely beyond whichever single path convention it happens to recognize.
- **Relying on Tessl's own "agent-agnostic, adapted on install" feature** — author one harness-neutral `SKILL.md` per skill and let Tessl adapt it per agent at install time. Not chosen: Hatch does not use Tessl for placement or for this adaptation feature; some harness divergences are plausibly too deep (different tool primitives, not just wording) for automatic adaptation to produce correctly.
- **Full harness words as the reserved suffix token** (`claude`, `codex`, `cursor`). Not chosen: these are real, unremarkable words or name-fragments — a skill named `claude-code-guide`, for reasons unrelated to being a harness variant, already exists in this ecosystem — making accidental collision with a legitimate skill name far more likely than with the chosen abbreviations.
- **Prefix instead of suffix** (`claude-handover`, `codex-handover`). Not chosen: a flat alphabetical listing should group by skill family — the axis both a human browsing the repo and `hatch import`'s own resolution logic care about — not by harness; suffix achieves that, prefix doesn't.

## Trade-offs Accepted

- **Prompt coherence:** an agent or developer scanning the repo sees family members adjacent to each other (`handover`, `handover-<code>`, …), at the cost of the harness identity being a terse abbreviated code rather than a readable word.
- **Failure surface:** a reserved-token collision with an organically-named skill is possible but judged low-probability given the chosen abbreviations; caught by the registry lint as a backstop, not prevented by construction.
- **Reversibility:** onboarding a future harness means adding a code to the harness registry and making sure the resolution and lint logic read from it — an improvement over flex-exp's closed `.targets` set, which needed a code change to the sync logic itself for every new harness. Externalizing the codes to a registry this record points to, rather than enumerating them here, means this specific decision never needs to be superseded just because the reserved set grew.
- **Operational simplicity:** no manifest or metadata field has to be kept in sync with the folder name (metadata is disallowed by the PRD regardless) — the folder name alone is authoritative, simpler to reason about, but also the only source of truth, so a wrong folder name has no second signal to catch it.

## Consequences

- **Required for the MVP, not yet built:** a canonical harness registry — a single source of truth mapping each reserved code to its harness — does not exist yet anywhere in this project. `hatch import`'s resolution logic, the registry publish lint, and any registry-browsing tooling all depend on reading their reserved-code set from this one place rather than each hardcoding their own copy. Its path is `src/harness-registry.json` in the Hatch CLI repo, per [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md), which settled the CLI's language and repo layout. Treat standing this registry up as part of the initial CLI build, not an afterthought — every rule below assumes it exists.
- `hatch import`'s resolution logic must implement "prefer `<name>-<H-code>/`, else `<name>/`, else unavailable" for its target harness, reading `<H-code>` from the harness registry, and must strip the harness-code suffix at deployment time.
- The registry's "no duplicate destination path" publish lint must be extended to flag any skill name ending in a code from the harness registry's reserved set, for human review before publishing, whether or not it's an intentional variant.
- Tessl will grade and list each harness-suffixed family member as a fully independent registry entry with no merged identity — accepted and confirmed by the developer.
- Not yet covered by this record, and left open for a later decision if needed: how Hatch's own project-level manifest records which harness(es) a project uses, and how a new harness would be onboarded end-to-end.

## Agent Rules

- MUST place a harness-neutral skill at `<name>/SKILL.md` with no suffix.
- MUST place any harness-specific variant at `<name>-<code>/SKILL.md`, where `<code>` is read from the harness registry's reserved set — never an invented or ad hoc code.
- MUST NOT add a new harness code by editing this record — new codes are added to the harness registry; this record governs the mechanism, not the current membership of the set.
- MUST NOT rely on metadata or frontmatter to declare a skill's target harness — the folder name is the sole source of truth.
- `hatch import`'s resolution logic MUST read the current reserved codes from the harness registry at run time (never a hardcoded copy), prefer the suffixed variant over the unsuffixed default for its target harness, and MUST strip the harness-code suffix on deploy.
- The registry's publish lint MUST read the same harness registry and flag any skill name ending in one of its reserved codes for human review before publishing.

## Machine Check

No automated registry tooling exists yet; this is the smallest concrete manual check until one does. It deliberately reads the reserved codes from the harness registry rather than hardcoding them, so the check stays correct as the registry grows.

```bash
CODES=$(<read the harness registry's reserved codes, joined with "|">)
find skills -maxdepth 1 -type d -regextype posix-extended -regex ".*-($CODES)$"
```

Expected result: every path listed is a deliberate harness-specific variant, confirmed against this record. Any path in the output that is not an intentional variant is a naming collision and must be renamed before publishing — this check fails by producing an unexplained entry, not by a non-zero exit code.

## Precedence

- [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) resolves this record's harness-registry-location TODO — see updated Consequences above.
- No known conflicting decision records.
