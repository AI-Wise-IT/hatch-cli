## Why

Every project-scoped command reads `hatch.manifest.json` with a bare `JSON.parse`. When the file is not valid JSON, the parse throws and nothing catches it, so the developer gets a raw Node stack trace instead of a Hatch message:

```
<anonymous_script>:1
﻿{
^

SyntaxError: Unexpected token '﻿', "﻿{
  "sche"... is not valid JSON
    at JSON.parse (<anonymous>)
    at runImport (file:///.../dist/commands/import.js:419:51)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

That output names an internal function and a compiled path, states no remedy, and does not say which file is at fault. It is also the one failure mode a developer is most likely to cause by hand, since the manifest is a plain JSON file they can open — the trace above came from a UTF-8 BOM written by Windows PowerShell 5.1's `Set-Content -Encoding utf8`, which is what that shell does by default.

Every other failure this CLI has — registry unreachable, authentication failed, unknown harness, destination occupied — is reported as one `hatch <command>: <what happened> — nothing was changed.` line. An unreadable manifest is the gap in that contract, and it is the case where a developer most needs to be told what to fix.

## What Changes

- Reading the project manifest becomes a single guarded operation shared by every command that reads it, rather than a bare `JSON.parse` repeated at each call site. An unparseable manifest is reported in the CLI's ordinary voice, naming the manifest's path, and exits non-zero having changed nothing.
- A byte order mark is tolerated rather than reported. A BOM is invisible in an editor, is written by common Windows tooling, and carries no meaning in JSON — refusing it teaches the developer nothing and blocks work for a difference they cannot see. This is the one malformation worth accepting rather than reporting.
- The report distinguishes a manifest that is absent (which several commands already handle, naming `hatch init`) from one that is present but unreadable. These are different problems with different remedies and currently produce very different quality of output.

**Not in scope**: validating the manifest's *shape* once it parses — an unknown `schemaVersion`, a missing `skills` key, a malformed entry. That is schema validation, it interacts with [ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md)'s migration chain, and it deserves its own change. This one is confined to the file being unparseable as JSON at all.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-initialization`: `hatch init`'s existing already-initialized check reads the manifest to report the project's harnesses; it gains the guarded read's behaviour when that file cannot be parsed.

Other affected commands (`import`, `list`, `remove`) have no capability spec of their own today, so their requirements would be introduced by whichever change first specs them rather than modified here.

## Impact

**hatch-cli — code**

Unguarded manifest parses, all of which would route through the shared read:

- `src/commands/import.ts:637` and `:1353`
- `src/commands/init.ts:281`
- `src/commands/list.ts:316`
- `src/commands/remove.ts:240` and `:470`

Two further bare parses read *registry* content rather than the project manifest — `src/commands/import.ts:497`/`:584` and `src/commands/init.ts:104`, which parse a fetched `skill.json`. They fail on a malformed registry payload rather than on anything the developer controls, and are worth reviewing in the same pass, but they are a different failure with a different audience.

**Records**

Likely none. The CLI's error-reporting contract is convention rather than a decision record, and this change conforms to it rather than altering it. If the BOM tolerance is judged to be a decision rather than an implementation detail, it warrants a short record of its own.

## Open Questions

- Whether the guarded read belongs in a new `src/project/` module alongside the manifest's other concerns, or on `migrateManifest`'s own boundary in `src/manifest-migrations/`. The call sites are identical either way; the question is which module owns "reading the manifest" as opposed to "migrating one".
- Whether an unreadable manifest should suggest a remedy beyond naming the file — recovering from version control is the realistic fix in a Hatch-managed project, and every such project is version-controlled often enough for that to be worth saying.
