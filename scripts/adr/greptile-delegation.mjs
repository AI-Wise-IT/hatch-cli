#!/usr/bin/env node
// Establishes that the record set's delegations and its reviewer configuration
// still agree with each other: every record that names a judge can resolve one,
// and no record that declares nobody judges it has quietly acquired one.
//
// The second half is the direction that rots silently. A record declaring
// `review-only` is reported unverified — honest about knowing nothing. If a rule
// bound to it appears in the configuration, the reviewer is in fact judging it,
// and the record is understating its own coverage while reading as unchecked.
//
//   node scripts/adr/greptile-delegation.mjs [--config <path>] [--records <dir>]

import { existsSync } from "node:fs";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  CONFIG_PATH,
  delegationProblem,
  readConfig,
  ruleIdFor,
} from "./greptile-rule.mjs";
import { DELEGATING_CONTEXTS, RECORDS_DIR, loadRecords } from "./records.mjs";

const UNJUDGED_CONTEXT = "review-only";

/** Rule identifiers present in the configuration, whatever their state. */
function declaredRuleIds(source) {
  if (source === null) return new Set();
  let config;
  try {
    config = JSON.parse(source);
  } catch {
    return new Set();
  }
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  return new Set(
    rules
      .filter((rule) => rule !== null && typeof rule === "object")
      .map((rule) => rule.id)
      .filter((id) => typeof id === "string"),
  );
}

/** Everywhere a record and the reviewer's configuration disagree. */
export function delegationProblems({
  records = RECORDS_DIR,
  config = CONFIG_PATH,
} = {}) {
  const problems = [];
  const source = readConfig(config);
  const declared = declaredRuleIds(source);

  for (const record of loadRecords(records)) {
    if (record.status === "superseded") continue;
    const id = record.name.replace(/\.md$/, "");

    if (DELEGATING_CONTEXTS.includes(record.context)) {
      const problem = delegationProblem(source, id, config);
      if (problem !== null) {
        problems.push(`\`${id}\` names a judge but ${problem}`);
      }
      continue;
    }

    if (record.context === UNJUDGED_CONTEXT && declared.has(ruleIdFor(id))) {
      problems.push(
        `\`${id}\` declares context \`${UNJUDGED_CONTEXT}\`, meaning no reviewer judges it, yet \`${config}\` carries the rule \`${ruleIdFor(id)}\`; a record that has a judge declares \`greptile-review\` and names it`,
      );
    }
  }

  return problems;
}

function main(args) {
  const options = { records: RECORDS_DIR, config: CONFIG_PATH };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--records") {
      options.records = args[i + 1];
      i += 1;
    } else if (args[i] === "--config") {
      options.config = args[i + 1];
      i += 1;
    }
  }
  if (!existsSync(options.records)) {
    console.error(`no decision records under ${options.records}`);
    return 1;
  }
  const problems = delegationProblems(options);
  if (problems.length > 0) {
    console.error("record set and reviewer configuration disagree:");
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(
    "every delegating record resolves its rule, and no record declaring itself unjudged carries one.",
  );
  return 0;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(main(argv.slice(2)));
}
