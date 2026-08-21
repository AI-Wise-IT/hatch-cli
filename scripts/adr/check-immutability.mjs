#!/usr/bin/env node
// Fails a pull request that edits a frozen section of an accepted decision record.
//
//   node scripts/adr/check-immutability.mjs --base <ref> --head <ref> [--records <dir>]

import {
  describe,
  frozenViolations,
  mergeBase,
  readRecordsAtRef,
} from "./immutability.mjs";
import { RECORDS_DIR } from "./records.mjs";

function parseArguments(argv) {
  const options = { base: null, head: "HEAD", records: RECORDS_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base") options.base = argv[i + 1];
    else if (argv[i] === "--head") options.head = argv[i + 1];
    else if (argv[i] === "--records") options.records = argv[i + 1];
    else continue;
    i += 1;
  }
  if (!options.base) throw new Error("--base <ref> is required");
  return options;
}

const options = parseArguments(process.argv.slice(2));
const base = mergeBase(options.base, options.head);

const violations = frozenViolations(
  readRecordsAtRef(base, options.records),
  readRecordsAtRef(options.head, options.records),
);

console.log(
  `Frozen-section immutability — ${base.slice(0, 8)}..${options.head}`,
);
if (violations.length === 0) {
  console.log("  no frozen section of an accepted record was edited");
  process.exit(0);
}
console.log(describe(violations));
console.log("");
console.log(`${violations.length} frozen-section violation(s).`);
process.exit(1);
