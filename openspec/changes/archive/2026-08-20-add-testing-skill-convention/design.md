## Context

See [proposal.md](proposal.md) — Why. The constraints that shape the approach:

- **The registry CI sees paths, not content, when something is deleted.** `check-name-permanence.mjs` diffs `git ls-tree` output between base and head. A deleted folder has no `skill.json` at head, so any classification the exemption depends on must be resolvable from the base commit or from the name itself.
- **`hatch import` reports a missing name in two shapes.** An exact-pin request names the ref; an unpinned one names the harness whose folder resolution failed. Anything that wants to be indistinguishable from a miss has to produce those same two strings, at the same point in the command's sequence.
- **Fifteen top-level folders already exist** — twelve fixtures, all already `_`-prefixed, and three real skills/groups (`hatch-usage`, `prd-elicitation`, `architecture-decisions`). Whatever marker is chosen has to be applied to already-published content, and every touched folder needs a version bump because `version-check` is blocking. No folder has any nested `skill.json`, so the rule has exactly one level to reach.
- **The manifest already has a migration chain** ([ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md)) whose v1→v2 and v2→v3 steps are both identity functions for purely additive optional fields.
- **The name-permanence check is advisory today** (`NAME_PERMANENCE_ENFORCEMENT=warn`) and flips to blocking at the hardening cutover. This change must be correct in both modes and must not itself perform the flip.

## Goals / Non-Goals

**Goals:**

- One classification rule that is cheap to evaluate everywhere it is needed: in a name-only git diff, in the CLI, and by a human reading a folder listing.
- Make the dangerous direction structurally impossible rather than merely forbidden — real content must not be able to escape the permanence rule.
- Land the whole convention while the permanence check is still advisory, so applying it to already-published fixtures costs nothing.

**Non-Goals:**

- Treating the test-project opt-in as a security boundary. It stops an accident, not a determined user editing their own manifest.
- Hiding testing skills from any listing or discovery surface — none exists, and [intake/backlog-0003](../../../intake/backlog-0003-registry-search-list.md) will have to account for the convention when it does.
- Reworking the fixtures themselves, or changing what any of them tests.

## Decisions

### Dual marker, with each half authoritative for a different consumer

The `_` prefix is the marker every consumer branches on first: the CLI decides on it without a fetch, the permanence check reads it straight off a deleted path, and a human sees it in a directory listing. `"testing": true` is a declaration that makes the classification explicit in the folder's own manifest — the same place `version`, `members` and `removed` already live — so a fixture is not classified by a naming accident alone.

Registry CI cross-validates the pair, which is what keeps two sources of truth from drifting.

*Alternatives considered.* Prefix only — simplest, but a fixture's own manifest would say nothing about what it is, and `removed`'s precedent is that status belongs in `skill.json`. Field only — cannot be read from a deleted path without an extra base-commit lookup, and would make every refusal depend on a successful fetch, so a registry outage would change which failure a caller sees.

### The declaration is mandatory on every folder, not just fixtures

`testing` is required on all fifteen top-level folders — `false` on real content, `true` on fixtures — and CI rejects an omitted or non-boolean value. Making it optional-and-absent-means-real would mean the safe classification is the one you get by forgetting, which is exactly backwards for a rule whose whole job is to keep test scaffolding out of real projects: an author who copies an existing fixture, drops the prefix and forgets the field ends up with importable content and no check that notices. With the field mandatory, every publish states its classification and every omission is a build failure rather than a silent default.

It also gives CI a check that runs against content rather than against a diff: the consistency check evaluates the whole registry on every pull request, so a folder that somehow reached `main` unclassified is caught on the next PR rather than never.

*Alternative considered.* Requiring the field only on `_`-prefixed folders. Rejected for the reason above — it leaves "no field" meaning "importable", which is the failure mode worth designing out.

### A refusal is indistinguishable from "no such thing"

The CLI does not tell an ordinary project that it asked for testing content. It reports the registry's ordinary not-found result — `"<name>" was not found in the registry for harness "<harness>"`, or the pinned-ref variant — and nothing else. Both message shapes are extracted into helpers shared by the genuine not-found paths and the refusal, so the two cannot drift into distinguishable wording.

That makes testing content invisible rather than forbidden, which is a stronger property than a refusal message: a project that has not opted in cannot use `hatch import` to discover that a fixture exists, or learn that an opt-in exists at all.

It follows that the check belongs **after** authentication, not before it. An unauthenticated caller is asked to authenticate exactly as it would for any other import, because being told "not found" without a credential prompt — when every real not-found demands one — would itself be the tell. The refusal therefore sits where resolution would report a missing name: after `authenticate()` and after AF-4's warnings, before the classify fetch.

*Alternative considered.* Refusing before authentication, with an explicit "this is testing content" message. Rejected by the developer: authenticating first costs nothing, and an explicit message both advertises that the content exists and invites the reader to go looking for the way to import it.

### The CLI consults both markers, and tolerates neither being present

Two checks, at the two moments each marker becomes available:

- **the name**, once the manifest and harness list are known — the common case;
- **the declaration**, on the `skill.json` `hatch import` already fetches to tell a group from a plain skill — the backstop for a folder that reached the registry without the prefix.

Both report through the same helpers, so they are indistinguishable from each other as well as from a real miss.

A fetched `skill.json` with no `testing` field reads as ordinary content rather than as an error. Every version published before this change lacks the field, and those versions stay reachable forever through exact and range pins — treating absence as a failure would strand pinned imports on historical tags. The mandatory-field rule is a registry-authoring gate, enforced where authoring happens; the CLI stays permissive about what it finds in the wild.

### Group members: pointers only

A pointer at testing content fails with the wording a pointer at a genuinely missing name produces, which import's existing atomic abort path already turns into "nothing placed, no manifest change, no commit".

Nested members need no check. A nested member has no `skill.json` of its own and inherits its group's classification, so a non-testing group's nested members are ordinary content by definition — and the registry-side membership check rejects a non-testing group that lists testing content as a nested member anyway. Adding a runtime check there would mean inventing a not-found wording for a case that has none, which is exactly the kind of distinguishable message this design avoids.

### The prefix is what makes reclassification impossible

Because the marker includes the folder name, marking published real content as a testing skill requires renaming it, and renaming real content is exactly what the permanence rule forbids. The rule that a published unmarked name may not acquire `"testing": true` is therefore a restatement of name permanence, not a new invariant — so it is enforced by the same script, under the same `NAME_PERMANENCE_ENFORCEMENT` mode, and relaxes with it pre-launch.

Marker consistency and the group-membership restriction are different in kind: neither locks a name in, so both are blocking from the day they land. This distinction matters for the pre-launch audit, which flags blocking enforcement with no recorded cutover as drift — these two are not irreversibility invariants and should be recorded as such in the ADR so a later audit reads them correctly.

### One module in the CLI, holding both halves of the classification

A single module exporting the I/O-free name predicate and the declaration check over an already-parsed `skill.json`, and deliberately no message of its own — message construction belongs with the not-found wording in `import.ts`. It is consulted at:

1. `hatch import`, after authentication — the primary target, on its name;
2. the classify fetch `hatch import` already makes — the same target, on its declaration;
3. pointer resolution in the member graph — surfaced as a resolve failure, which import's existing atomic abort handles with no new rollback code, the same shape AF-9's cross-MAJOR conflict already uses;
4. nothing in `check-collisions` — testing skills stay in the collision namespace, so that command needs no change at all.

The gate at every point is the manifest's `testProject`, read through `migrateManifest` like every other manifest field. `group-resolve.ts`'s existing `GroupSkillJson` parse gains `testing` alongside `removed`, which is the only parsing change any of this needs.

*Alternative considered.* Filtering testing skills out of group resolution silently, instead of refusing. Rejected: a real group listing a fixture is a registry authoring bug, and silently succeeding with a member missing would hide it from the person best placed to fix it.

### `testProject` as a v4 identity migration

`CURRENT_SCHEMA_VERSION` goes to 4 with `3: (manifest) => manifest`, following exactly what v1→v2 and v2→v3 did for additive optional fields. Nothing is backfilled; a manifest written before this change reads as an ordinary project.

*Alternative considered.* Adding the field without bumping the schema version. Rejected: [ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md)'s chain is only useful if every shape change is represented in it, and the two existing entries set the precedent that "additive and identity" still earns a version.

### The permanence check's live proof becomes a script test

`check-name-permanence.mjs` gets a test using `node --test` (already in Node 22, no new dependency) that builds throwaway git repositories in a temp directory and asserts the three interesting outcomes: an unmarked deletion exits non-zero in block mode, a marked deletion exits zero, and an unmarked deletion exits zero with a warning in warn mode. This runs on every pull request, which the hand-crafted-deletion-PR proof never did.

`_registry-integrity-fixture` is deleted once that test is green. Its stated purpose — to be a folder that can never be deleted — is now served better by the test, and the exemption makes the folder both deletable and meaningless as a demonstration.

## Risks / Trade-offs

- **The two markers drift out of agreement in a working branch** → the consistency check is blocking from the moment it lands, evaluates every top-level folder rather than only the ones a pull request touches, and rejects the undeclared case as well as the disagreeing one.
- **Every future publish must remember a field that most authors will always set to `false`** → accepted, and the point: a forgotten field fails CI loudly instead of quietly producing importable content. The registry README documents it and the check names the offending folder.
- **`_` is reserved forever, and the reservation is invisible to anyone who has not read the convention** → the registry README documents it, and the consistency check rejects a `_`-prefixed folder that did not mean to be a fixture, so the mistake surfaces at PR time rather than in a project. No published folder uses the character today, so the reservation costs nothing retroactively.
- **A user can hand-edit `testProject: true` and import fixtures into a real project** → accepted and explicitly not defended against. The refusal reveals nothing about the field's existence, so nobody arrives at it by accident, and importing a fixture into one's own project harms only that project.
- **"Not found" is a confusing answer for someone who can see the folder in the registry** → the accepted cost of indistinguishability. Anyone in that position is a registry author working in a test project, where the import succeeds; anyone else has no reason to expect the name to resolve. The registry README documents the convention for the case where it does confuse someone.
- **Declaring all fifteen folders produces fifteen new `<name>@<version>` tags** → additive only; the existing tags the pin fixtures (`_group-fixture-versioned`, `_reimport-fixture`, `_harness-suffix-fixture-cld`) rely on are untouched, so every pin test keeps resolving what it resolved before. Worth re-running those flows once after the bumps land.
- **A pinned import of a real skill at a pre-convention version fetches a `skill.json` with no declaration** → by design, absence reads as ordinary content in the CLI; the mandatory-field rule binds authors, not already-published tags.
- **Acceptance testing gets one extra step** — a throwaway project must be initialized with the test-project flag before it can import fixtures → a single flag on a command that was already being run.
- **The pre-launch audit's §5 classification goes stale the moment this lands** → left deliberately alone; the audit is a snapshot that each run overwrites, and a re-run belongs to the hardening pass.

## Migration Plan

Order matters, because the checks must not land against content that does not yet satisfy them, and the integrity fixture must not be deleted before its replacement exists.

1. **Registry, PR 1 — declare.** Add the field to all fifteen top-level folders — `true` on the twelve `_`-prefixed fixtures, `false` on `hatch-usage`, `prd-elicitation` and `architecture-decisions` — each with a PATCH version bump. This must precede PR 2: the consistency check evaluates the whole registry, so it would fail on its own pull request if the declarations were not already in place. No checks exist yet, so nothing can fail here; `version-check` is satisfied by the bumps.
2. **Registry, PR 2 — enforce.** The permanence exemption and the reclassification rule in `check-name-permanence.mjs`, the new marker-consistency and group-membership checks, and the script test. Both new jobs become required status checks on `main` (a branch-protection change, not just a workflow edit).
3. **Registry, PR 3 — clean up.** Delete `_registry-integrity-fixture`, which the exemption from PR 2 now permits and PR 2's test makes redundant.
4. **CLI** — the predicate, the two refusals, `--test-project`, and the v4 migration. Independent of the registry sequence: it changes no behavior for existing content, and `hatch-skills`' collision-check job installs `@ai-wise/hatchcli@latest` but is unaffected because the collision namespace does not change.
5. **ADRs** — the new convention record, plus the [0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) and [0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md) edits, written alongside the code they describe rather than after it.

Rollback: each registry PR reverts cleanly on its own. The CLI change is additive — reverting it restores unconditional importability without touching any manifest, since a `testProject` field left behind is simply ignored by a CLI that does not know about it.
