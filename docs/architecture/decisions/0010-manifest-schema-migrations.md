# Manifest schema evolution: versioned field + automatic in-code migration on read

## Metadata

- **id:** 0010-manifest-schema-migrations
- **component:** data-migrations
- **status:** accepted
- **applies_to:** `hatch.manifest.json` read/write logic in the Hatch CLI
- **decision_record:** `docs/architecture/decisions/0010-manifest-schema-migrations.md`

## Decision

`hatch.manifest.json` carries a `schemaVersion` integer field. Whenever any Hatch CLI command reads the manifest, it runs the parsed object through an ordered chain of small, versioned migration functions up to the CLI's current schema version, then rewrites the manifest at that command's next write (the same commit-per-operation already established elsewhere). There is no separate `hatch migrate` command — migration is transparent and automatic on every read.

## Context

[0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) fixed `hatch.manifest.json` as the per-project manifest, written by whatever version of Hatch CLI is currently installed. Hatch CLI itself is expected to keep shipping new versions (per [0006-npm-public-distribution](0006-npm-public-distribution.md) and [0007-github-actions-deployment](0007-github-actions-deployment.md)), and several deferred Want items already imply the manifest's shape will keep changing — recording which recipe and CLI version produced the current state, and harness removal dropping fields. The PRD's Constraints state "a project must never become stuck or unable to continue because the skills it depends on moved forward and broke the sequence" — this record applies that same bar to a newer CLI reading an older project's manifest.

UC-3 and UC-4's business rule that every `hatch import`/`hatch remove` operation is its own single commit means a target project's manifest history is always recoverable via ordinary git history in that project — this gave the automatic-migration approach a safety net that a from-scratch data store wouldn't have.

## Alternatives Considered

- **Schemaless, additive-only fields with tolerant parsing (no version field).** Not chosen: works only as long as every future change is purely additive; the moment a field needs renaming or restructuring, there's no clean way to signal that, forcing permanent compatibility shims instead of a real migration.
- **An explicit `hatch migrate` command the developer runs manually.** Not chosen: relies on the developer remembering to run it before other commands behave correctly, risking exactly the "stuck project" the PRD's Constraints rule out. It also breaks the pattern already established elsewhere in this project of avoiding extra required manual steps (no pre-commit hook, no uncommitted-changes gate).

## Trade-offs Accepted

- **Prompt coherence:** high — `schemaVersion` states exactly what shape a manifest is in; migration functions are small and individually testable.
- **Failure surface:** a buggy migration function is real risk, but it's contained, testable code, and every prior manifest state is recoverable from the target project's own git history since each Hatch operation is already its own commit.
- **Reversibility:** high — nothing about this is a one-way door; a bad migration is a normal bug to fix and re-release, recoverable via git.
- **Operational simplicity:** fully automatic — no extra step for the developer, on top of commands they were already running.

## Consequences

- `hatch.manifest.json`'s JSON schema must always include `schemaVersion`, starting at `1` for the format first written when a project is initialized.
- The Hatch CLI repo needs an ordered migration-function registry (e.g. `src/manifest-migrations/`), one function per schema version bump, applied in sequence.
- Every command that reads the manifest must route through this migration chain before using its contents — not just `hatch init`/`hatch import`, but any future command that reads it too.
- The chain as shipped today runs to schema version **4**, every step of it an additive-field bump whose migration function is the identity:
  - v1 → v2, optional per-entry `group` and group entries recorded in `skills` ([0017-manifest-schema-v2-group-membership](0017-manifest-schema-v2-group-membership.md));
  - v2 → v3, optional per-entry `contentHash` and `pin` ([0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md), [0020-standalone-version-pin-manifest-and-parsing](0020-standalone-version-pin-manifest-and-parsing.md));
  - v3 → v4, the optional top-level `testProject` marking a project that may import testing content ([0027-testing-skill-convention](0027-testing-skill-convention.md)).
  Nothing is backfilled at any step: a manifest written before a given field existed simply doesn't carry it, and reads as the field's documented default.

## Agent Rules

- MUST include a `schemaVersion` integer field in `hatch.manifest.json`.
- MUST run the manifest through the ordered migration-function chain on every read, up to the CLI's current schema version.
- MUST rewrite the manifest at that command's next write once migrated.
- MUST NOT implement a separate manual `hatch migrate` command in this MVP.

## Invariants

- **MUST run every manifest read through the ordered migration-function chain up to the CLI's current schema version.** Becomes irreversible once: any real project has a manifest at a schema version older than the CLI's current version — removing or reordering an already-shipped migration function would strand that project, unable to read its own manifest, directly violating the PRD's own "must never become stuck" constraint. Enforcement mechanism: `hatch-cli`'s CI `decision-records` job, which executes this record's Machine Check on every pull request — it reads `src/manifest-migrations/index.ts` and fails on any gap between schema version 1 and the current one, which is exactly the historical-chain regression check this invariant needs. Current mode: blocking.

## Machine Check

- **context:** cli-repo

Run from the `hatch-cli` checkout. This asserts the invariant above directly — every historically-shipped migration key is still registered — reading the source rather than a built artifact or a project's manifest, so it runs in any checkout without a build step.

```bash
node -e "const s=require('fs').readFileSync('src/manifest-migrations/index.ts','utf8');const cur=+/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/.exec(s)[1];const keys=new Set(s.split(/\r?\n/).map(l=>l.trim()).filter(l=>/^\d+:/.test(l)).map(l=>parseInt(l)));const gaps=[];for(let v=1;v<cur;v++)if(!keys.has(v))gaps.push(v);console.log(gaps.length?'missing migration from: '+gaps.join(','):'chain intact to v'+cur);process.exit(gaps.length?1:0)"
```

Expected result: `chain intact to v<N>`, exit 0 — a migration is registered from every schema version between 1 and the current one. Any version printed as missing is one a real project could be sitting on with no way forward, which is exactly the stranding this record exists to prevent.

## Precedence

- Builds on [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) (manifest file format), [0006-npm-public-distribution](0006-npm-public-distribution.md) and [0007-github-actions-deployment](0007-github-actions-deployment.md) (ongoing CLI releases that motivate schema evolution).
- No known conflicting decision records.
