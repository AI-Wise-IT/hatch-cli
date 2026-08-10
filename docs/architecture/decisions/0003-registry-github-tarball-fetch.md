# Registry fetch model: per-subdirectory GitHub tarball fetch, no local clone or cache

## Metadata

- **id:** 0003-registry-github-tarball-fetch
- **component:** registry-data
- **status:** accepted
- **applies_to:** the Hatch CLI's registry-fetch layer; the skill-content repo it targets
- **decision_record:** `docs/architecture/decisions/0003-registry-github-tarball-fetch.md`

## Decision

The skill-content registry is a single private GitHub repository, with flat top-level skill/group folders per [0001-harness-suffix-convention](0001-harness-suffix-convention.md). Hatch CLI fetches named content by calling GitHub's contents/tarball API for the specific skill or group subdirectory being requested, extracting only that subtree. The CLI never performs a full `git clone` of the registry repo, and never persists fetched content beyond the single import operation it was fetched for — no local caching of registry content, per the PRD's "No" list.

The per-project manifest that `hatch new` and `hatch import` write and update is a JSON file, `hatch.manifest.json`, at the target project's root.

## Context

ADR 0001 already fixed the registry's on-disk shape (flat, suffix-based skill folders). This record decides how `hatch import`/`hatch new` reach that content over the network. The PRD's Constraints require registry access to be "reachable over the open internet, gated by a single personal password" without building "a public, multi-user app with account management," and its Context states that if the system sits untouched for six months, "the main foreseeable risk is credential expiry" — implying no second system (a custom server) should need to be kept alive. The PRD's "No" list explicitly rules out local caching of fetched content. [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) settled Node.js/TypeScript as the CLI runtime in the same conversation, which this decision builds on.

Current practice for "pull one named subdirectory from a private repo into another repo without a full clone" is a well-established idiom (tools such as `giget`/`degit`) built on GitHub's tarball/contents API with token auth — directly fitting the shape of a per-skill or per-group fetch.

## Alternatives Considered

- **Git sparse/shallow clone of the registry repo via system git.** Not chosen: a clone leaves `.git` metadata behind unless carefully cleaned up, risking exactly the "local caching" the PRD's "No" list rules out; sparse-checkout is also a less common git idiom with historically rougher edges than a plain tarball fetch.
- **A bespoke HTTP server in front of the registry repo, handling the shared-password auth itself.** Not chosen: introduces a second system (custom protocol, hosting, patching, uptime) that a solo, six-months-untouched project would have to keep alive — directly working against the PRD's stated expectation that credential expiry, not infrastructure failure, is the main foreseeable risk.

## Trade-offs Accepted

- **Prompt coherence:** high — GitHub's tarball/contents API for a named subdirectory is a purpose-built, well-documented idiom; nothing bespoke for an agent to learn.
- **Failure surface:** depends on a GitHub personal access token with appropriate repo scope; if the token or repo access breaks, the failure mode is a well-understood GitHub auth error, not a custom protocol's ad hoc error surface.
- **Reversibility:** the fetch mechanism is isolated to an adapter layer — moving to a different git host or a blob store later would mean changing that adapter, not the CLI's higher-level import logic.
- **Operational simplicity:** highest of the options considered — GitHub hosts and serves the content; there is no infrastructure of Hatch's own to run or maintain.

## Consequences

- Hatch CLI needs a GitHub personal access token (scoped to the registry repo) as its registry credential — how that token is obtained, stored, and supplied across local-desktop and cloud-agent contexts is settled in [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md).
- The registry-fetch adapter must extract exactly the requested skill or group subdirectory and discard everything else — no partial or full local mirror of the registry repo is retained after an import completes.
- Every skill/group's placement is recorded as an entry in `hatch.manifest.json`, including its version — this is the manifest UC-1, UC-3, and UC-4 all read and update.

## Agent Rules

- MUST fetch registry content via GitHub's contents/tarball API, scoped to the specific skill or group subdirectory being imported.
- MUST NOT perform a full `git clone` of the skill-content registry repo.
- MUST NOT persist fetched registry content on disk beyond the files placed into the target project by the current import operation.

## Machine Check

```bash
grep -rE "git clone.*(skill-content|registry)" src/ || true
```

Expected result: no matches — the registry-fetch code path never invokes `git clone` against the registry repo. A match indicates a violation of this record.

## Precedence

- Builds on [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (registry's on-disk shape) and [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) (runtime this fetch layer is implemented in).
- [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md) settles how the GitHub PAT this record depends on is obtained, stored, and supplied.
- No known conflicting decision records.
