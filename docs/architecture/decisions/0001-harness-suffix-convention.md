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

- The canonical harness registry — the single source of truth mapping each reserved code to its harness — lives in the Hatch CLI repo, per [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md), which settled the CLI's language and repo layout. It is two files with one job: `src/harness-registry.json` holds the data, and `src/harness-registry.ts` is the only module that reads it, exposing `knownHarnessNames`, `reservedHarnessCodes`, `isKnownHarness`, `getHarnessDefinition`, and `resolveSkillFolderName`. A record naming either path is naming the same registry — the `.json` when it means the data, the `.ts` when it means the accessor. `hatch import`'s resolution logic, the collision check, and any registry-browsing tooling all reach the reserved-code set through that module rather than hardcoding their own copy.
- `hatch import`'s resolution logic must implement "prefer `<name>-<H-code>/`, else `<name>/`, else unavailable" for its target harness, reading `<H-code>` from the harness registry, and must strip the harness-code suffix at deployment time.
- No lint flags a skill name merely for ending in a reserved code. [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) declines that check outright: a single snapshot cannot distinguish a coincidental suffix from a deliberate family variant, so the check would permanently false-positive on legitimate pairs already published. The residual misresolution risk is accepted rather than detected — see that record for the conditions under which it should be revisited.
- Tessl will grade and list each harness-suffixed family member as a fully independent registry entry with no merged identity — accepted and confirmed by the developer.
- How Hatch's own project-level manifest records which harness(es) a project uses is now settled by [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md) (an explicit, validated `--harness` flag on `hatch init`, the one command that creates the manifest). How a new harness would be onboarded end-to-end remains open for a later decision if needed.

## Agent Rules

- MUST place a harness-neutral skill at `<name>/SKILL.md` with no suffix.
- MUST place any harness-specific variant at `<name>-<code>/SKILL.md`, where `<code>` is read from the harness registry's reserved set — never an invented or ad hoc code.
- MUST NOT add a new harness code by editing this record — new codes are added to the harness registry; this record governs the mechanism, not the current membership of the set.
- MUST NOT rely on metadata or frontmatter to declare a skill's target harness — the folder name is the sole source of truth.
- `hatch import`'s resolution logic MUST read the current reserved codes from the harness registry at run time (never a hardcoded copy), prefer the suffixed variant over the unsuffixed default for its target harness, and MUST strip the harness-code suffix on deploy.
- MUST NOT build a lint that flags a skill name for ending in a reserved harness code — [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) rejects it as unsound against real registry content.

## Invariants

- **The harness-code reserved set only grows — a code, once reserved, is never removed or reused for something unrelated** (Consequences: "new codes are added, never removed"). Becomes irreversible once: any registry content or CLI resolution logic has shipped that assumes today's reserved-code set — reusing a retired code for something else could silently misresolve already-published content. Enforcement mechanism: none dedicated; [0014-registry-collision-detection](0014-registry-collision-detection.md)'s check assumes this invariant rather than verifying it directly. Current mode: not-yet-built.
- **MUST NOT rely on metadata or frontmatter to declare a skill's target harness — the folder name is the sole source of truth.** Becomes irreversible once: a real project's placed content, and any tooling built around it, assumes folder-name-based resolution — switching to metadata-based resolution later would require re-resolving every already-placed skill. Enforcement mechanism: none — an unenforced convention in `hatch import`'s implementation today. Current mode: not-yet-built.

## Machine Check

- **context:** cli-repo

What this record still asserts and a machine can still verify is the single-source-of-truth rule: every consumer reaches the reserved codes through the harness registry module, and no module carries its own copy.

```bash
matches=$(grep -rnE "[\"'](cld|cdx|csr)[\"']" src/ --include=*.ts | grep -v "^src/harness-registry" | grep -v "\.test\.ts")
if [ -n "$matches" ]; then echo "$matches"; exit 1; fi
echo "no hardcoded harness codes: correct"
```

Expected result: the "no hardcoded harness codes" line, exit 0. Any path printed is a module holding a literal reserved code instead of reading it from `src/harness-registry.ts`, which is what this record forbids — test files are excluded because a test asserting resolution behavior legitimately names the codes it is testing.

The codes in the pattern are today's reserved set and must be extended by hand when the registry grows; this check verifies that consumers read from the registry, not that the registry's own membership is correct. Name-shape checking is deliberately absent — see Consequences and [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md).

## Precedence

- [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) resolves this record's harness-registry-location TODO — see updated Consequences above.
- [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) extends this record: group internal structure and name-permanence policy, both left open here, are settled there without contradicting this record.
- [0014-registry-collision-detection](0014-registry-collision-detection.md) implements a required check against this record's resolution algorithm and harness registry.
- [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md) resolves this record's own deferred open item on manifest-level harness recording.
- [0024-registry-collision-predicate](0024-registry-collision-predicate.md) settles the concrete predicate that check evaluates, and establishes that `resolveSkillFolderName` always deploys under the literal name it was queried with.
- [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) governs the suffix-shape lint this record once required: it is rejected as unsound, and the underlying misresolution risk is accepted rather than detected.
- [0027-testing-skill-convention](0027-testing-skill-convention.md) reserves a leading `_` in the same flat namespace this record governs, for content that is exempt from name permanence and never importable.
- [0028-registry-discovery-live-walk](0028-registry-discovery-live-walk.md) reads this record's reserved codes to decide when a `<base>-<code>` folder is folded into `<base>` in a listing.
- No known conflicting decision records.
