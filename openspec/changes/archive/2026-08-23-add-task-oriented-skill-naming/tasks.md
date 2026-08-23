## 1. Convention

- [x] 1.1 Apply the modified `skill-content-convention` requirement to `openspec/specs/skill-content-convention/spec.md` on archive; verify the requirement reads as one coherent rule rather than an original rule with an amendment appended.
- [x] 1.2 Add a short authoring note to the `AI-Wise-IT/hatch-skills` `README.md` stating the verb-first form for plain skills, the exclusion of names describing a skill's output, and the group carve-out; verify it states the form without restating the whole spec requirement, and that it sits alongside the existing convention sections rather than opening a parallel account of naming.

## 2. Verification

- [x] 2.1 Verify every plain skill published from this point carries a verb-first name by checking the four skills ported in this working session — `organise-thoughts`, `evaluate-decision`, `prime-expert-context`, `strip-editing-residue` — each leads with a verb and none names its own output.
- [x] 2.2 Verify no already-published name is renamed by this change: confirm `prd-elicitation`, `hatch-usage`, `capture-adrs`, `architecture-decisions` and every `_`-prefixed fixture are untouched in the registry, and that `check-name-permanence.mjs` reports no violation.
