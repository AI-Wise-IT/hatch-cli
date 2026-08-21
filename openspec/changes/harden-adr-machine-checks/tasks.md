## 1. Define the contract

- [x] 1.1 Write the decision-record contract into `docs/architecture/decisions/README.md`: the required sections, the `status` values (`concept` / `accepted` / `superseded`), the frozen set (Decision, Agent Rules, Invariants), and the rule that an accepted decision is superseded rather than edited. Verify by reading it back against `specs/decision-record-convention/spec.md` — every SHALL in the spec is stated in the contract.
- [x] 1.2 Define the machine-check declaration format: one fenced `bash` block under `## Machine Check`, plus a context line naming what the check needs (CLI repo / registry checkout / both / live GitHub configuration / review-only). Verify by hand-applying it to 0002 (CLI-only), 0027 (registry checkout) and 0024 (both) and confirming each reads naturally in a markdown viewer.

## 2. Normalize the existing records

- [x] 2.1 Review all 28 records and assign each a status, treating "does this record describe a decision that is actually settled" as the question rather than defaulting to `accepted`. Verify every record carries exactly one permitted value and record the reasoning for any that becomes `concept`.
- [x] 2.2 Add the context declaration to all 28 machine-check sections, correcting 0024's — it is written as though it runs from the registry repo while its neighbours assume the CLI repo. Verify the extraction script reports 28 of 28 parsed with a context on each.
- [x] 2.3 Mark the five judgment-type records (0014, 0021, 0023, 0024, 0025) and the two live-configuration records (0004, 0008) as review-only, replacing any command whose success is unrelated to the asserted property. Verify 0024 no longer greps for a phrase in a comment.
- [x] 2.4 Confirm normalization touched only editable sections, so no record needed superseding. Verify with a diff showing no changes under Decision, Agent Rules or Invariants in any record.

## 3. Build the runner

- [x] 3.1 Implement extraction: locate each record's machine-check block and context declaration, and fail on a record that is missing either. Verify with unit tests over a conforming record, a record with no fence, and a record with no context.
- [x] 3.2 Implement execution: run each check in its declared context, capture exit status and output, and report per record. Verify against the real corpus that the run reproduces the review's manual results — every executable check passing.
- [x] 3.3 Implement honest reporting: review-only records are reported as unverified with their reason, superseded records as skipped by status, and a check that cannot be located, parsed or executed as a failure. Verify the summary accounts for all 28 records with the three categories totalling the corpus.
- [x] 3.4 Implement the conformance check across the whole corpus rather than only changed records. Verify by introducing a record missing a required section and confirming it is named and fails.

## 4. Build the immutability check

- [x] 4.1 Implement frozen-section comparison between the merge base and the pull-request head, keyed on the record's status at the base commit. Verify with unit tests over synthetic git history covering: an edited Decision, an edited Machine Check, an added Precedence reference, and a record flipped to `concept` and back in one commit.
- [x] 4.2 Ensure the failure report names the record, the section, and supersession as the remedy. Verify by reading the message produced for an edited Agent Rules section.

## 5. Wire CI

- [x] 5.1 Add the CLI repo's job: runs the conformance check, the immutability check, and every check whose context is the CLI repo or both, checking out the registry with the existing read-scoped `HATCH_SKILLS_READ_TOKEN`. Verify the job passes on a branch with no record changes.
- [x] 5.2 Add the registry repo's job: checks out the CLI repo at its latest release tag, resolved at run time, and runs every check whose context is a registry checkout or both. Verify the job passes against the registry's current `main`, and that it obtains both the runner and the records — installing the published package would supply neither, since `files: ["dist"]` excludes them.
- [x] 5.3 Confirm no credential was widened or added. Verify the registry token's scope is still Contents-read only, that no Administration-scoped token was introduced, and that the registry job needs no credential at all to read the public CLI repo.
- [x] 5.4 Update the Invariants of every record whose enforcement this runner now provides — several read "Enforcement mechanism: none" for rules it checks — naming the job and its mode. This must land here, while the jobs exist and are named but before 6.1 makes the immutability check blocking, because Invariants is a frozen section and this edit would otherwise require superseding each affected record. Verify each updated Invariant names its job, and that the immutability check is not yet a required status check.

## 6. Make it blocking

- [ ] 6.1 Add the new checks as required status checks on `main` in both repositories, per [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md). Verify with `gh api` that each repo's required-checks list contains the new contexts.
- [ ] 6.2 Confirm a violation actually blocks: open a throwaway pull request editing an accepted record's Decision section and verify it cannot merge, then close it.

## 7. Close the loop

- [x] 7.1 Update the `capture-adrs` skill to write the status field and the context declaration, and to route a changed decision to a superseding record rather than an edit. Verify by capturing a new record and confirming it conforms without hand-editing.
- [x] 7.2 Narrow `openspec/changes/adopt-greptile-invariant-review/proposal.md`: its open question about whether a Machine Check is the better hook is answered, and its remaining scope is the judgment-type and live-configuration residue. Verify the proposal no longer poses a question this change settled.
