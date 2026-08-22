## 1. Establish how the reviewer actually behaves

Nothing downstream is written against an assumption the documentation leaves ambiguous. This group runs on a throwaway branch and produces answers, not artifacts.

- [x] 1.1 Connect `hatch-cli` to Greptile Cloud and verify the repository reports as indexed and a pull request on it receives a review
- [x] 1.2 On a throwaway branch, reference one decision record from `.greptile/files.json` by both a root-relative and a `.greptile/`-relative path, open a pull request, and determine from the review which base resolves; record the answer in design.md's Risks entry
- [x] 1.3 On the same throwaway pull request, add a rule carrying an `id` and a `scope`, violate it deliberately, and verify the review flags it — establishing that rules are read before twenty-eight are written
- [ ] 1.4 Connect `hatch-skills`, verify it reports as indexed, and determine which cross-repository mechanism delivers `hatch-cli`'s record text to a review there; record which one worked
- [x] 1.5 Close the throwaway pull request and delete its branch, leaving no configuration behind in either repository

## 2. Extend the record contract

- [x] 2.1 Add `greptile-review` to the context table in `docs/architecture/decisions/README.md`, stating what a delegating record carries and what the runner reports for it; verify the section matches `specs/decision-record-convention/spec.md`
- [x] 2.2 Add conformance tests to `scripts/adr/records.test.mjs` for the new context — missing reviewer bullet, missing fenced block, missing `Expected result:`, carrying a `reason` bullet, and the well-formed case — and verify they fail against the current parser
- [x] 2.3 Add `greptile-review` to the context sets in `scripts/adr/records.mjs` and branch `conformanceProblems` three ways; verify `npm test` passes including the tests from 2.2

## 3. Runner and delegation helper

- [x] 3.1 Write `scripts/adr/greptile-rule.mjs`, which resolves the rule bound to a record id in the root configuration and exits non-zero with a message naming what failed
- [x] 3.2 Add unit tests for the helper covering absent configuration, malformed configuration, missing rule, inactive rule, a rule that does not name its record, and the passing case; verify `npm test` passes
- [x] 3.3 Add the `delegated` outcome to `classify` and `report` in `scripts/adr/run.mjs` with the label `JUDGE` and its own summary bucket; verify the summary still accounts for every record
- [x] 3.4 Add tests covering classification and reporting of a `greptile-review` record in both the passing and failing case, and verify a failing delegation reports `FAIL` rather than `JUDGE`

## 4. Configuration in `hatch-cli`

- [x] 4.1 Create `.greptile/config.json` with `statusCheck: false` and one rule per accepted record, identified `adr-<record-id>`, scoped to the paths that record governs, citing the record rather than restating it
- [x] 4.2 Create `.greptile/files.json` with one entry per accepted record, using the base path established in 1.2
- [x] 4.3 Create `.greptile/rules.md` carrying orientation on how the record corpus is organised, and verify it states no rules of its own
- [x] 4.4 Verify `greptile.json` is absent and that no `.greptile` directory exists anywhere outside the repository root
- [x] 4.5 Write the configuration-shape check — single root form, no nested configuration, `statusCheck` false, `files.json` entries equal to the accepted-record set, every accepted record carrying a rule — and verify it fails when each of those five properties is broken in turn

## 5. Convert the five delegating records

- [x] 5.1 Rewrite `## Machine Check` in [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md), [0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md), [0023](../../../docs/architecture/decisions/0023-remove-harness-drop-unconditional.md), [0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md) and [0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md) to `greptile-review`, each with its reviewer bullet, helper invocation, `Expected result:`, and prose naming what the reviewer must establish
- [x] 5.2 Run `node scripts/adr/check.mjs` and verify all five report `JUDGE` and none reports `PASS`
- [x] 5.3 Run `node scripts/adr/check-immutability.mjs --base main` and verify it passes, confirming no frozen section was touched

## 6. Configuration in `hatch-skills`

- [ ] 6.1 Create `.greptile/config.json` in `hatch-skills` with rules for the registry-side records and cross-repository context to `hatch-cli` by the mechanism established in 1.4; verify a pull request review there cites a record
- [x] 6.2 Verify no decision record file has been copied into `hatch-skills`, and that its rules reach the records in the repository that owns them

## 7. Decision records

- [x] 7.1 Write the adoption record — reviewer, cloud deployment, both repositories indexed, findings advisory, configuration at the root only — with the check from 4.5 as its machine check
- [x] 7.2 Write the contract-extension record — the `greptile-review` context and what a delegating record carries — with a check asserting every delegating record's rule resolves and that no `review-only` record carries a rule without declaring its judge
- [x] 7.3 Add both records to the index table in `docs/architecture/decisions/README.md` and verify the conformance run reports every record conforming

## 8. End-to-end verification

- [x] 8.1 Run `node scripts/adr/check.mjs --registry ../hatch-skills` and verify five records report `JUDGE`, exactly [0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md) and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md) report unverified, and nothing is non-conforming
- [x] 8.2 Open a pull request deleting one rule from `.greptile/config.json`, verify `decision-records` fails and names the record that lost its judge, then close it unmerged
- [x] 8.3 Open a pull request adding a `.greptile/` directory in a subdirectory, verify the configuration-shape check fails and names it, then close it unmerged
- [x] 8.4 Run `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build`, and verify all four pass
