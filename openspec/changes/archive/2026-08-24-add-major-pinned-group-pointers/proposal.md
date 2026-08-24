## Why

A group's pointer member has exactly two resolution modes today, and neither fits a member the group genuinely depends on. Unpinned resolves to `main`, so the member silently crosses a MAJOR boundary the moment a breaking version is published — every importer picks it up unattended. Exactly pinned freezes the member forever, so the group misses every fix and improvement until someone hand-edits the manifest and cuts a release.

The gap is live. The three project-material groups in `hatch-skills` each point at `prime-expert-context`, which they invoke to derive their record methodology. They need every improvement to it, and they must never be handed a breaking rewrite without a human deciding to take it. Expressing that today means choosing between "always break eventually" and "never improve".

Latest-within-MAJOR is already how this project behaves everywhere else, in code and not merely in prose: `isNewerCompatible` refuses to treat a new MAJOR as an auto-appliable update, and every non-exact re-import is gated through it. A standalone import gets that bound from the version recorded in the project manifest. A group pointer is resolved fresh on every unpack and never recorded, so it has no version to anchor the bound to — which is precisely why it must state the MAJOR itself. This change gives the pointer the mode the rest of the system already has, spelled the way the rest of the system already spells it.

## What Changes

- **New pointer resolution mode: pinned to the latest release within a MAJOR version.** A group may declare that a pointer member tracks the newest published version sharing a given MAJOR, taking minors and patches automatically and never crossing into the next MAJOR. It is spelled with a caret — `"^1.2.0"` — matching the standalone `hatch import <name>@^<version>` form.
- **The `version` field on a pointer member gains a grammar.** It currently accepts any string and is passed through verbatim as a git ref; the manifest format must now distinguish an exact pin from a caret constraint, and reject anything that is neither.
- **BREAKING (behavioral, not on published content): a malformed pointer `version` now fails at parse.** Today any string parses and fails later as a `not-found` fetch against a nonexistent tag. With a grammar, the failure moves to manifest parse with a message naming the offending entry. No currently published group carries a malformed value, so nothing in the registry changes behavior — but the failure mode and its message change for anyone authoring one.
- **Resolution gains tag enumeration.** Resolving "latest within MAJOR" requires discovering which `<name>@<version>` tags exist, which the CLI has never needed: today it fetches either `main` or one exactly known tag. This is a new registry read.
- **The pinned-pointer conflict rule extends to the new mode.** The existing rule covers exact pins only — same MAJOR resolves to the highest with a warning, differing MAJORs abort the import. It must now also settle a name reached by a major pin and an exact pin together, by two major pins on different MAJORs, and by a major pin alongside an unpinned pointer.
- **A decision record captures the change of semantics.** ADR-0016 fixed the pointer member's `{kind, name, version?}` shape and stated that `version` present means an exact pin. That reading no longer holds, so the change is recorded rather than quietly reinterpreted.

## Capabilities

### New Capabilities

- `registry-group-resolution`: How a group's member list resolves to concrete content — the pin modes a pointer member may declare, what each resolves to, how a name reached by several pointer paths is settled deterministically, and what aborts an import rather than guessing.

### Modified Capabilities

None. No existing spec under `openspec/specs/` states pointer resolution behavior; ADR-0013 and ADR-0016 carry it as decision records, and `docs/use-cases/import-content.md` carries it as alternate flows. Both are updated by this change as impact, not as spec deltas.

## Impact

**Code**

- `src/registry/group-resolve.ts` — member parsing gains a version grammar; the walk carries the pin mode rather than a bare version string; the pin-reconciliation pass gains the new cases.
- `src/registry/fetch.ts` — a new tag-enumeration read against the registry repository, the first call that lists refs rather than fetching a known path.
- `src/commands/import.ts` — surfaces any new warning and abort text.

**Documentation and decisions**

- `docs/architecture/decisions/` — a new ADR recording the extended pointer semantics, with ADR-0016 marked superseded or amended per whichever the record contract requires.
- `docs/use-cases/import-content.md` — AF-9 and the pinned-pointer business rules restated to cover the new mode. AF-12's claim that an unpinned standalone import resolves to "latest compatible version, same MAJOR" is corrected in the same pass: in code the MAJOR bound comes from comparing against the manifest's recorded version, so it governs a re-import and not a first import. These are MVP-scope artifacts and this one has drifted from the implementation.

**Registry**

- `hatch-skills` — group manifests may adopt the new pin. The three project-material groups (`gather-brand-material`, `gather-content-material`, `gather-legal-material`) are the intended first adopters for their `prime-expert-context` pointer; they currently declare it unpinned.
- No registry CI script reads member `version`, so `check-descriptions`, `check-testing-declarations`, `check-name-permanence` and `check-version-bump` are unaffected.

**Compatibility**

- Every already-published group keeps its current behavior: absent `version` still means latest on `main`, and an exact semver still means that exact tag.
- Rate and reliability: tag enumeration adds a registry round trip per major-pinned name, on a repository whose tag count grows with every version of every folder. Pagination and result size are a real constraint for the design phase, not an afterthought.
