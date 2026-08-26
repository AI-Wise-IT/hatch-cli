# Harness-targeting via flat, suffixed skill folders, with each harness's directory as registry data

## Metadata

- **id:** 0033-harness-suffix-convention-and-registry-directories
- **component:** skill-registry-harness-targeting
- **status:** accepted
- **applies_to:** every skill folder under the skill registry's source tree; `hatch import`'s resolution, placement and deployment logic; the registry's duplicate-destination-path publish lint
- **decision_record:** `docs/architecture/decisions/0033-harness-suffix-convention-and-registry-directories.md`
- **supersedes:** `0001-harness-suffix-convention`

## Decision

Skill folders in the registry are flat and top-level — never nested inside a shared parent.

A harness-neutral skill (identical behavior across every supported harness) lives at `<name>/SKILL.md`, with no suffix.

A harness-differentiated or harness-exclusive variant lives at a sibling folder `<name>-<code>/SKILL.md`, where `<code>` is always the final hyphen-segment of the folder name and is drawn from a closed, abbreviated set of reserved harness codes. That set is not enumerated here — it is maintained as a single canonical registry in the Hatch CLI codebase (see Consequences), so adding a harness later is a registry change, not a change to this record.

A family may mix an unsuffixed default with a single harness-specific override (e.g. `handover/` as the default, plus `handover-cdx/` overriding only Codex).

`hatch import <name>` resolves per target harness `H` by preferring `<name>-<H-code>/`, falling back to the unsuffixed `<name>/` if no override exists, and reporting the skill unavailable for `H` if neither exists. Deployment strips the harness-code suffix, so the resolved source always lands under the plain name `<name>` inside that harness's own skill directory (e.g. `handover-cdx/SKILL.md` deploys to `.agents/skills/handover/SKILL.md`).

A harness's skill directory is registry data, independent of both its name and its reserved code. The directory a harness places into is recorded beside its code in the same canonical registry, and may change without its name or its code changing with it — a directory move alters where content lands and nothing else: no registry folder is renamed, no reserved code is reassigned, and no project manifest records a directory to be rewritten. No command carries its own copy of a harness's directory path, exactly as no command carries its own copy of the reserved code set.

Because a directory can move, the registry also records the directory a harness previously occupied, for as long as some project may still hold content there. Moving a harness's directory carries the content already placed there across to the new one: `hatch import` migrates that directory for every declared harness carrying one, over the entries the project's manifest records. An entry present in the previously occupied directory and absent from the current one is **moved** on disk into the current one — moved rather than fetched again, so the entry's recorded version, pin and content hash are carried across unchanged and a local edit arrives intact. An entry present in both is **reclaimed**: the current directory's copy is authoritative and the previous one's is removed. Anything the manifest does not record is left in place, and the previously occupied directory and its parent are retired only when doing so leaves nothing behind.

The migration runs ahead of the checks that decide whether an import has anything to do, so those checks read the directory the content actually lives in rather than an empty one. It is part of the import operation — covered by its rollback, recorded in its commit — never a step of its own; where an import would otherwise change nothing, the migration is still carried out, reported, and recorded in a single commit of its own. Removing the recorded previous directory retires the behaviour with no code change.

## Context

The registry's skills must be independently discoverable and gradable by Tessl.io. Direct inspection of an existing Tessl-indexed skill (`linuxfoundation/crowd.dev`'s `adr` skill) confirmed Tessl discovers and registers a skill from a flat, harness-specific path (`.claude/skills/adr/SKILL.md`) under a single flat registry name (`adr`) — there is no evidence Tessl recognizes or merges nested per-harness variant folders into one identity. Tessl's own documentation states its skills are "agent-agnostic... adapted to each [agent] on install," a feature this project has deliberately decided not to rely on: Hatch owns both placement (`hatch import`) and any harness-specific rewriting itself, because harness divergence can run deeper than wording. Direct inspection of `flex-exp` (this project's own prior global-skills repo) showed its real `handover` skill needed three fully independent rewrites — Claude task chips, Codex threads, Cursor's prompt-paste-only flow are genuinely different primitives, not a shared script with per-harness word substitutions.

The PRD (`intake/product-requirements.md`, "For the architecture step" and Must-scope items) had already settled two constraints this decision must satisfy: harness-targeting must be expressed structurally, via folder placement or naming, never via metadata in a skill's own manifest; and the registry must already enforce that no two skills claim the same destination path, via Hatch's own scannable tooling rather than a check placed in every target project.

flex-exp's actual mechanism — a shared root `skills/<name>/SKILL.md` plus nested `.targets/<claude|codex|cursor>/SKILL.md` overrides — was inspected directly and found incompatible with Tessl's flat, one-folder-one-identity discovery model, which is what motivated this decision to diverge from that precedent.

The three harnesses in scope today are Claude, Codex, and Cursor, with abbreviated codes chosen over the full words specifically to avoid reserving meaningful, unremarkable English-adjacent words (see Alternatives Considered). Those codes are deliberately not fixed in this record: onboarding a future harness must not require superseding this decision, only extending the registry this record points to.

What forced this record rather than an edit to [0001-harness-suffix-convention](0001-harness-suffix-convention.md) is the directory half. 0001's Decision names `.codex/skills/` in its deployment example, and a frozen section is superseded rather than corrected. Codex's default location is `.agents/skills/`, which is also where other tooling used alongside Hatch — OpenSpec's own skills among it — already places content. Placing Hatch's Codex content elsewhere split a project's skills across two directories, so a workflow combining Hatch skills with skills from another source could not see both in one place. Nothing about the suffix convention was wrong; only the directory the `codex` harness mapped to, which is why this record restates that convention unchanged and adds the property that made the move a data change: the directory was already read from the registry by every consumer, so moving it was a one-line edit to the registry's data rather than a change to any command.

## Alternatives Considered

- **flex-exp's nested `.targets/<harness>/SKILL.md` mechanism**, reused as-is. Not chosen: nested variants are not independently discoverable or gradable by Tessl, and may be invisible to it entirely beyond whichever single path convention it happens to recognize.
- **Relying on Tessl's own "agent-agnostic, adapted on install" feature** — author one harness-neutral `SKILL.md` per skill and let Tessl adapt it per agent at install time. Not chosen: Hatch does not use Tessl for placement or for this adaptation feature; some harness divergences are plausibly too deep (different tool primitives, not just wording) for automatic adaptation to produce correctly.
- **Full harness words as the reserved suffix token** (`claude`, `codex`, `cursor`). Not chosen: these are real, unremarkable words or name-fragments — a skill named `claude-code-guide`, for reasons unrelated to being a harness variant, already exists in this ecosystem — making accidental collision with a legitimate skill name far more likely than with the chosen abbreviations.
- **Prefix instead of suffix** (`claude-handover`, `codex-handover`). Not chosen: a flat alphabetical listing should group by skill family — the axis both a human browsing the repo and `hatch import`'s own resolution logic care about — not by harness; suffix achieves that, prefix doesn't.
- **Tying a harness's directory to its name or its code**, deriving `.<harness>/skills` rather than recording it. Not chosen: `.agents/skills` is derivable from neither `codex` nor `cdx`, and a derivation would make any future move a code change in every consumer rather than a data change in one file.
- **Hardcoding the legacy `.codex` path in `hatch import` for the reclamation.** Not chosen: it would be the only harness path in the codebase living outside the registry — precisely the arrangement this record's machine check exists to prevent — and would make retiring the reclamation a code change rather than the deletion of a registry field.
- **A one-shot manifest schema migration to trigger the reclamation.** Not chosen: [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md) defines migrations as pure functions over the manifest object, and giving one a filesystem side effect would break that contract for every future migration, to buy a self-retiring trigger a registry field already provides.
- **Leaving the stale copy for the developer to delete, documented in release notes.** Not chosen on the strength of the failure mode rather than the effort: the stale copy is silently discovered by the harness, and `hatch remove` would report success while leaving it in place.

## Trade-offs Accepted

- **Prompt coherence:** an agent or developer scanning the repo sees family members adjacent to each other (`handover`, `handover-<code>`, …), at the cost of the harness identity being a terse abbreviated code rather than a readable word.
- **Failure surface:** a reserved-token collision with an organically-named skill is possible but judged low-probability given the chosen abbreviations; caught by the registry lint as a backstop, not prevented by construction.
- **Shared ground:** `.agents/skills/` is not Codex-private — other tooling places content there under the same flat names. A name conflict with something Hatch did not place moves from rare to routine. No new mechanism answers it: `hatch import`'s destination-occupied handling already skips a file it did not place, or suffixes it when interactive, and reports the outcome. What changes is that the report matters more often. The registry-side collision check ([0014-registry-collision-detection](0014-registry-collision-detection.md), [0024-registry-collision-predicate](0024-registry-collision-predicate.md)) cannot see a name claimed by another tool at all, so it is not a backstop for this class of conflict and is not extended to pretend otherwise.
- **Reversibility:** onboarding a future harness means adding a code and a directory to the harness registry and making sure the resolution and lint logic read from it — an improvement over flex-exp's closed `.targets` set, which needed a code change to the sync logic itself for every new harness. Externalizing the codes and the directories to a registry this record points to, rather than enumerating them here, means this specific decision never needs to be superseded just because the reserved set grew or a directory moved.
- **Operational simplicity:** no manifest or metadata field has to be kept in sync with the folder name (metadata is disallowed by the PRD regardless) — the folder name alone is authoritative, simpler to reason about, but also the only source of truth, so a wrong folder name has no second signal to catch it.
- **Cost of the migration:** permanent code answering a transient condition. Its cost when there is nothing to migrate is one `existsSync` per declared harness carrying a previous directory, and there is no way to observe it having run.
- **A no-op import can now commit:** a developer who expects `already up to date` to change nothing sees a commit the first time they import into a project holding content at a previously occupied directory. Accepted: the alternative is leaving the project mid-migration, the summary names everything moved and removed, and it happens once per project.
- **Residual risk of the migration:** a developer's own content sitting at a previously occupied directory under a name the manifest also records is moved into the current directory, or deleted when the current directory already holds that name. Accepted: that path under that exact name is where Hatch placed content, so it is overwhelmingly likely to be Hatch's, and the operation is one commit in a version-controlled project and snapshot-restorable where it is not.

## Consequences

- The canonical harness registry — the single source of truth mapping each reserved code to its harness and to the directory that harness places into — lives in the Hatch CLI repo, per [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md), which settled the CLI's language and repo layout. It is two files with one job: `src/harness-registry.json` holds the data, and `src/harness-registry.ts` is the only module that reads it, exposing `knownHarnessNames`, `reservedHarnessCodes`, `isKnownHarness`, `getHarnessDefinition`, and `resolveSkillFolderName`. A record naming either path is naming the same registry — the `.json` when it means the data, the `.ts` when it means the accessor. `hatch import`'s resolution logic, the collision check, and any registry-browsing tooling all reach the reserved-code set and the per-harness directories through that module rather than hardcoding their own copy.
- `hatch import`'s resolution logic must implement "prefer `<name>-<H-code>/`, else `<name>/`, else unavailable" for its target harness, reading `<H-code>` from the harness registry, and must strip the harness-code suffix at deployment time.
- `hatch import`, `hatch init` and `hatch remove` read each declared harness's directory from `getHarnessDefinition(...)`, so moving a directory is an edit to `src/harness-registry.json` alone. A project manifest records harness *names* and never a directory, so no migration follows a move.
- The migration lives in `src/commands/import.ts`, driven by the registry's record of a harness's previously occupied directory, and is covered by the import's existing snapshot/rollback bookkeeping and its commit. It runs only for a harness the project declares, moves or removes only manifest-recorded entries, and retires the previously occupied directory and its parent only when emptied. Running it ahead of the staleness and local-edit checks is what those checks depend on: hashing a harness's current directory for an entry that still sits in the previous one would otherwise read as a local edit nobody made. An import that finds nothing else to do therefore now has something to commit, on paths that previously committed nothing.
- No lint flags a skill name merely for ending in a reserved code. [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) declines that check outright: a single snapshot cannot distinguish a coincidental suffix from a deliberate family variant, so the check would permanently false-positive on legitimate pairs already published. The residual misresolution risk is accepted rather than detected — see that record for the conditions under which it should be revisited.
- Tessl will grade and list each harness-suffixed family member as a fully independent registry entry with no merged identity — accepted and confirmed by the developer.
- How Hatch's own project-level manifest records which harness(es) a project uses is settled by [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md) (an explicit, validated `--harness` flag on `hatch init`, the one command that creates the manifest). How a new harness would be onboarded end-to-end remains open for a later decision if needed.

## Agent Rules

- MUST place a harness-neutral skill at `<name>/SKILL.md` with no suffix.
- MUST place any harness-specific variant at `<name>-<code>/SKILL.md`, where `<code>` is read from the harness registry's reserved set — never an invented or ad hoc code.
- MUST NOT add a new harness code, or change where a harness places content, by editing this record — codes and directories both live in the harness registry; this record governs the mechanism, not the current membership of either set.
- MUST NOT rely on metadata or frontmatter to declare a skill's target harness — the folder name is the sole source of truth.
- `hatch import`'s resolution logic MUST read the current reserved codes from the harness registry at run time (never a hardcoded copy), prefer the suffixed variant over the unsuffixed default for its target harness, and MUST strip the harness-code suffix on deploy.
- Every command that places, reads or removes harness content MUST read that harness's directory from the harness registry at run time — MUST NOT carry a literal harness directory path, current or historical, anywhere outside that registry.
- MUST derive a harness's directory from the registry's recorded value alone — MUST NOT derive it from the harness's name or from its reserved code.
- When a harness's directory moves, the directory it previously occupied MUST be recorded in the harness registry, and the migration MUST touch only manifest-recorded entries in it, MUST leave anything else in place, and MUST retire that directory and its parent only when doing so leaves nothing behind.
- A recorded entry present in the previously occupied directory and absent from the current one MUST be moved on disk into the current one — MUST NOT be fetched again, so that its recorded version, pin and content hash carry across unchanged and a local edit survives. A recorded entry present in both MUST be reclaimed from the previously occupied directory, leaving the current one's copy untouched.
- The migration MUST run before the checks that decide whether the import has anything to place, so those checks read the harness's current directory once the content is in it.
- The migration MUST run only for a harness the project declares, MUST be covered by the import's own rollback, and MUST land in the import's commit — MUST NOT be a command or a best-effort step of its own. Where the import would otherwise change nothing, the migration MUST still be carried out, reported, and recorded in exactly one commit.
- MUST NOT build a lint that flags a skill name for ending in a reserved harness code — [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) rejects it as unsound against real registry content.

## Invariants

- **The harness-code reserved set only grows — a code, once reserved, is never removed or reused for something unrelated** (Consequences: "new codes are added, never removed"). Becomes irreversible once: any registry content or CLI resolution logic has shipped that assumes today's reserved-code set — reusing a retired code for something else could silently misresolve already-published content. Enforcement mechanism: none dedicated; [0014-registry-collision-detection](0014-registry-collision-detection.md)'s check assumes this invariant rather than verifying it directly. Current mode: not-yet-built.
- **MUST NOT rely on metadata or frontmatter to declare a skill's target harness — the folder name is the sole source of truth.** Becomes irreversible once: a real project's placed content, and any tooling built around it, assumes folder-name-based resolution — switching to metadata-based resolution later would require re-resolving every already-placed skill. Enforcement mechanism: none — an unenforced convention in `hatch import`'s implementation today. Current mode: not-yet-built.
- **A harness's directory is read from the registry, never restated in a consumer.** Becomes irreversible once a second consumer carries its own copy: a directory move then silently splits a project's content across two locations, with no single edit that corrects it. Enforcement mechanism: this record's Machine Check, which fails on any harness identifier held outside the registry module. Current mode: **blocking** — it runs in the `decision-records` job on every pull request, as it did under [0001-harness-suffix-convention](0001-harness-suffix-convention.md).

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

- **Supersedes [0001-harness-suffix-convention](0001-harness-suffix-convention.md)**, whose Decision names `.codex/skills/` as the Codex harness's deployment example. That example no longer holds. Everything else 0001 settled stands and is restated here in full — the flat suffixed-folder convention, the prefer-suffixed-then-plain resolution order, the deploy-time suffix strip, and the reserved-set-only-grows invariant — so a citation of 0001 resolves through this record without loss.
- [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) settles where the harness registry lives — see Consequences above.
- [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) extends this record: group internal structure and name-permanence policy, both left open here, are settled there without contradicting this record.
- [0014-registry-collision-detection](0014-registry-collision-detection.md) implements a required check against this record's resolution algorithm and harness registry.
- [0015-import-harness-selection-flag](0015-import-harness-selection-flag.md) resolves this record's own deferred open item on manifest-level harness recording.
- [0024-registry-collision-predicate](0024-registry-collision-predicate.md) settles the concrete predicate that check evaluates, and establishes that `resolveSkillFolderName` always deploys under the literal name it was queried with. Its predicate is destination-*name* based and so is unaffected by which directory a harness places into.
- [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) governs the suffix-shape lint this record's predecessor once required: it is rejected as unsound, and the underlying misresolution risk is accepted rather than detected.
- [0027-testing-skill-convention](0027-testing-skill-convention.md) reserves a leading `_` in the same flat namespace this record governs, for content that is exempt from name permanence and never importable.
- [0028-registry-discovery-live-walk](0028-registry-discovery-live-walk.md) reads this record's reserved codes to decide when a `<base>-<code>` folder is folded into `<base>` in a listing.
- No known conflicting decision records.
