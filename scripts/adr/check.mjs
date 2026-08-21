#!/usr/bin/env node
// Entry point for the decision-record checks. Verifies that the whole record
// set conforms to the contract in docs/architecture/decisions/README.md, then
// executes every check this repository's run is responsible for.
//
//   node scripts/adr/check.mjs [--repo cli|registry|all] [--records <dir>] [--registry <path>]

import { resolve } from "node:path";
import { RECORDS_DIR, conformanceProblems, loadRecords } from "./records.mjs";
import { REPOS, report, runAll } from "./run.mjs";

function parseArguments(argv) {
  const options = {
    repo: "all",
    records: RECORDS_DIR,
    cli: process.cwd(),
    registry: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--repo") options.repo = value;
    else if (flag === "--records") options.records = value;
    else if (flag === "--cli") options.cli = resolve(value);
    else if (flag === "--registry") options.registry = resolve(value);
    else continue;
    i += 1;
  }
  if (!REPOS.includes(options.repo)) {
    throw new Error(
      `--repo must be one of ${REPOS.join(", ")}; got ${options.repo}`,
    );
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const records = loadRecords(options.records);

if (records.length === 0) {
  console.error(`No decision records found under ${options.records}.`);
  process.exit(1);
}

console.log(`Conformance — ${records.length} records under ${options.records}`);
let nonConforming = 0;
for (const record of records) {
  const problems = conformanceProblems(record);
  if (problems.length === 0) continue;
  nonConforming += 1;
  console.log(`  ${record.name}`);
  for (const problem of problems) console.log(`    - ${problem}`);
}
console.log(
  nonConforming === 0
    ? "  every record conforms"
    : `  ${nonConforming} non-conforming records`,
);
console.log("");

console.log("Machine checks");
const results = runAll(records, {
  repo: options.repo,
  roots: { cli: options.cli, registry: options.registry },
});
console.log(report(results, { repo: options.repo }));

const failed = results.filter((result) => result.outcome === "failed").length;
if (nonConforming > 0 || failed > 0) {
  console.log("");
  console.log(
    `Decision records: ${nonConforming} non-conforming, ${failed} failing checks. A failing check names a decision that is no longer true — repair the record's check if it has rotted, or supersede the record if the decision has changed.`,
  );
  process.exit(1);
}
