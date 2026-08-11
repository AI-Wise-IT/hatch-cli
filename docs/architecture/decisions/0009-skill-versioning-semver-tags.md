# Skill/group versioning: semver per folder, CI-enforced bumps, automatic version tags

## Metadata

- **id:** 0009-skill-versioning-semver-tags
- **component:** registry-versioning
- **status:** accepted
- **applies_to:** every skill/group folder in the skill-content repo; that repo's CI workflow; the Hatch CLI's version-comparison and ref-resolution logic
- **decision_record:** `docs/architecture/decisions/0009-skill-versioning-semver-tags.md`

## Decision

Every skill and group folder in the registry carries its own independent version number, recorded in a per-folder metadata file (e.g. `<name>/skill.json`, containing at minimum a `version` field), using semantic versioning (MAJOR.MINOR.PATCH). Each skill/group's version history is entirely independent of every other's — there is no repo-wide version number, only many independent per-folder sequences.

"Newer compatible version" (UC-3 AF-2) means the same MAJOR, with a higher MINOR or PATCH, than the version recorded in the target project's manifest. A new MAJOR version is never auto-applied by `hatch import`'s update path in this MVP. A group has one version number for the group as a whole; individual member skills inside a group are not independently version-tracked for import/update purposes, consistent with UC-3's existing rule that a group always updates atomically.

CI enforces, as a required status check on every PR (per [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md)), that any skill/group folder whose content changed also had its metadata file's `version` field changed in the same PR. On merge to `main`, CI automatically pushes a `<name>@<version>` git tag at the merge commit for every skill/group whose version changed in that merge — no manual publish step.

`hatch import` fetches "latest" by resolving `ref=main` (today's mechanism, per [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md)) when no version is pinned. Fetching a specific historical version resolves to `ref=<name>@<version>`, via the same GitHub tarball/contents API — a ref-parameterized call, not a new mechanism. Actually exposing a pinned-version option in `hatch import`'s own UX is explicitly deferred alongside recipes (per [mvp-scope.md](../../../intake/mvp-scope.md)); this record establishes only the underlying retrieval mechanism, so that capability requires no redesign whenever it returns.

## Context

UC-3's re-import flows (AF-1 "already up to date," AF-2 "update available") require comparing two version identifiers and knowing which is newer — nothing in the PRD or use cases defined that comparison until now. The deferred Want item ("recipe steps can pin an exact skill version... a permanent pin would conflict with" the auto-update Must) already assumed an ordered, comparable version scheme without specifying one.

[0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) established that Hatch fetches a subdirectory's tarball at a given ref, defaulting to `main` — that mechanism is ref-parameterized already, so nothing about fetching a non-default ref required new plumbing, only something to point the ref at. [0007-github-actions-deployment](0007-github-actions-deployment.md) and [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) already established a required-status-check gate on every PR to the skill-content repo — the version-bump check added here is a new job inside that same existing gate, not a new mechanism.

During this cluster's conversation, two retrieval approaches were directly compared: hand-searching commit history for the commit where a folder's metadata `version` field matched a requested value, versus a git tag pointing directly at that commit. Git tags were chosen as the native, O(1) mechanism — a commit-history search would need a linear scan of commits touching that path per lookup, and is fragile if commits don't map cleanly one-to-one onto version bumps.

## Alternatives Considered

- **Resolve an older version by walking commit history** (list commits touching the folder's path, check the metadata file's version at each until a match is found). Not chosen: an O(n) linear scan per lookup instead of an O(1) tag reference, and fragile if a commit touches the file without changing its version.
- **A separate version-to-commit index file** (root-level or per-skill), maintained either by hand or by CI. Not chosen: even if CI-maintained, it's a second file that must always agree with the tags and the tree — no benefit over git's own native tag mechanism, which needs no file of its own.
- **Leave retrieval of non-latest versions unsupported in this MVP**, revisiting only if/when recipes and pinning return. This was the initial proposal in this conversation. Superseded once the tag-based mechanism was worked out during this same cluster: it costs a few lines in an already-existing CI workflow to support now, so there was no reason to defer it.

## Trade-offs Accepted

- **Prompt coherence:** high — an agent editing a skill sees its version right next to the content; "did I bump the version" is a mechanical, CI-checkable fact rather than something that has to be remembered or reviewed by hand.
- **Failure surface:** the version-bump check cannot distinguish a meaningful content change from a trivial one (e.g. a typo fix) — any change to a skill/group folder requires a version bump, with no exemption path. Accepted as a simple, unambiguous rule over the alternative of trying to classify "meaningful" vs. "trivial" changes.
- **Reversibility:** tags are additive and non-destructive; this scheme could be extended later (e.g. with a browsable index for the deferred "list/browse" Nice item) without breaking anything already published.
- **Operational simplicity:** the version-check and tag-push logic live entirely inside the CI workflow already established by [0007-github-actions-deployment](0007-github-actions-deployment.md) — no new service, no new file format beyond one field in a per-folder metadata file that this record introduces.

## Consequences

- Every skill/group folder needs a metadata file (e.g. `<name>/skill.json`) carrying at least a `version` field — [0001-harness-suffix-convention](0001-harness-suffix-convention.md) fixed the folder-naming shape but didn't specify this file; this record adds it.
- `hatch.manifest.json` (per [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md)) already records each imported skill/group's version string — this record is what makes that recorded value meaningful for ordering comparisons and, later, fetchable by ref.
- The skill-content repo's CI workflow gains two new steps: a version-bump-check (PR-time, required status check) and a tag-push step (merge-time, one tag per skill/group whose version changed in that merge).
- `hatch import`'s own UX for requesting a pinned/older version is not designed in this MVP — only the underlying ref-based retrieval mechanism is established here.

## Agent Rules

- MUST record each skill/group's version in a per-folder metadata file using semantic versioning (MAJOR.MINOR.PATCH).
- MUST treat a "compatible" newer version as same-MAJOR with a higher MINOR or PATCH; MUST NOT auto-apply a MAJOR version bump via `hatch import`'s update path.
- MUST enforce, as a required CI status check, that any skill/group folder whose content changed in a PR also has a changed `version` field in its metadata file.
- MUST push a `<name>@<version>` git tag at the merge commit, automatically in CI on merge to `main`, for every skill/group whose version changed in that merge.
- MUST NOT introduce a separate hand-maintained version-to-commit index file.

## Machine Check

```bash
git tag -l "*@*" | head -5
```

Expected result: tags of the form `<name>@<version>` exist in the registry repo — at least one per published skill/group version. An empty result indicates the CI tag-push step isn't wired up.

## Precedence

- Builds on [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (per-folder shape) and [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) (ref-parameterized fetch mechanism this record extends).
- Plugs into the required-status-check gate established by [0007-github-actions-deployment](0007-github-actions-deployment.md) and [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).
- No known conflicting decision records.
