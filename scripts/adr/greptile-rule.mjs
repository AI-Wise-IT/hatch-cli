#!/usr/bin/env node
// Establishes that a decision record's delegation to the reviewer is intact:
// that the root configuration carries a rule bound to the record, that the
// rule is active, and that it names the record. It does not establish the
// decision — only that the judgment is still being asked for.
//
//   node scripts/adr/greptile-rule.mjs 0024-registry-collision-predicate

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";

export const CONFIG_PATH = ".greptile/config.json";

/** The rule identifier a record's delegation is bound to. */
export function ruleIdFor(recordId) {
  return `adr-${recordId}`;
}

/** Everything a rule's text may be read from, joined so one scan covers it. */
function ruleText(rule) {
  const parts = [];
  for (const key of ["rule", "description", "text", "title", "name"]) {
    if (typeof rule[key] === "string") parts.push(rule[key]);
  }
  return parts.join("\n");
}

/**
 * Why a record's delegation does not resolve, or null when it does.
 *
 * `source` is the configuration file's text, or null when the file is absent.
 * A rule is read as active unless it is explicitly disabled, because that is
 * how the reviewer itself reads the file — a stricter reading here would fail
 * a configuration the reviewer honours.
 */
export function delegationProblem(source, recordId, path = CONFIG_PATH) {
  const id = ruleIdFor(recordId);
  if (source === null) {
    return `no reviewer configuration at \`${path}\`, so record \`${recordId}\` declares a judge that cannot be resolved`;
  }

  let config;
  try {
    config = JSON.parse(source);
  } catch (error) {
    return `\`${path}\` is not valid JSON (${error.message}), so no rule can be resolved from it`;
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return `\`${path}\` does not hold a JSON object`;
  }
  if (!Array.isArray(config.rules)) {
    return `\`${path}\` declares no \`rules\` array`;
  }

  const rule = config.rules.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      candidate.id === id,
  );
  if (rule === undefined) {
    return `\`${path}\` carries no rule \`${id}\`, so record \`${recordId}\` has lost its judge`;
  }
  if (
    Array.isArray(config.disabledRules) &&
    config.disabledRules.includes(id)
  ) {
    return `rule \`${id}\` is listed in \`disabledRules\` in \`${path}\`, so record \`${recordId}\`'s judgment is no longer being asked for`;
  }
  if (rule.enabled === false) {
    return `rule \`${id}\` is present in \`${path}\` but disabled, so record \`${recordId}\`'s judgment is no longer being asked for`;
  }
  if (!ruleText(rule).includes(recordId)) {
    return `rule \`${id}\` in \`${path}\` does not name record \`${recordId}\`, so the binding between the two is broken`;
  }
  return null;
}

/** Reads the configuration file, or null when it is not there. */
export function readConfig(path = CONFIG_PATH) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function main(argv) {
  let recordId = null;
  let path = CONFIG_PATH;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config") {
      path = argv[i + 1];
      i += 1;
    } else if (recordId === null) {
      recordId = argv[i];
    }
  }
  if (!recordId) {
    console.error(
      "usage: node scripts/adr/greptile-rule.mjs <record-id> [--config <path>]",
    );
    return 2;
  }
  const problem = delegationProblem(readConfig(path), recordId, path);
  if (problem !== null) {
    console.error(`delegation broken: ${problem}`);
    return 1;
  }
  console.log(
    `delegation intact: \`${ruleIdFor(recordId)}\` is active in \`${path}\` and names \`${recordId}\`.`,
  );
  return 0;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(main(argv.slice(2)));
}
