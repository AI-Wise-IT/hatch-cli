#!/usr/bin/env node
// Establishes that the reviewer's configuration has the shape the adoption
// record settles: exactly one root form, nothing nested, no status posted, and
// a rule and a review-context entry for every accepted record.
//
// It says nothing about whether a rule still reaches the code it governs. That
// is deliberate, and named as a known hole in the adoption record.
//
//   node scripts/adr/greptile-shape.mjs [--root <path>] [--records <dir>]

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { ruleIdFor } from "./greptile-rule.mjs";
import { RECORDS_DIR, loadRecords } from "./records.mjs";

const CONFIG_DIR = ".greptile";
const LEGACY_FORM = "greptile.json";
const SKIP = new Set(["node_modules", ".git", "dist", "coverage"]);

/** Every `.greptile` directory and `greptile.json` file below a root. */
function findConfigurationForms(root) {
  const found = { directories: [], legacy: [] };
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        if (entry.name === CONFIG_DIR) {
          found.directories.push(relative(root, full) || CONFIG_DIR);
          continue;
        }
        walk(full);
      } else if (entry.name === LEGACY_FORM) {
        found.legacy.push(relative(root, full));
      }
    }
  };
  walk(root);
  return found;
}

function readJson(path) {
  if (!existsSync(path)) return { missing: true };
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error: error.message };
  }
}

/** Everything about the reviewer's configuration that breaks its recorded shape. */
export function shapeProblems({ root = ".", records = RECORDS_DIR } = {}) {
  const problems = [];
  const configDir = join(root, CONFIG_DIR);

  // 1 & 2 — exactly one form, at the root, and nothing nested anywhere.
  const { directories, legacy } = findConfigurationForms(root);
  if (!directories.includes(CONFIG_DIR)) {
    problems.push(
      `no \`${CONFIG_DIR}/\` at the repository root; the reviewer's standards must be declared there`,
    );
  }
  for (const dir of directories) {
    if (dir === CONFIG_DIR) continue;
    problems.push(
      `\`${dir.split(sep).join("/")}/\` is reviewer configuration outside the repository root; directory-level configuration nests, and a nested file can deactivate a rule inherited from the root`,
    );
  }
  for (const file of legacy) {
    const where = file.split(sep).join("/");
    problems.push(
      `\`${where}\` is a second root configuration form; \`${CONFIG_DIR}/\` takes precedence and \`${where}\` would be silently ignored`,
    );
  }

  // 3 — the advisory posture, made readable by posting no status at all.
  const config = readJson(join(configDir, "config.json"));
  if (config.missing) {
    problems.push(`\`${CONFIG_DIR}/config.json\` is absent`);
  } else if (config.error) {
    problems.push(
      `\`${CONFIG_DIR}/config.json\` is not valid JSON (${config.error})`,
    );
  } else if (config.value.statusCheck !== false) {
    problems.push(
      `\`${CONFIG_DIR}/config.json\` declares \`statusCheck\` as ${JSON.stringify(config.value.statusCheck)}; it must be \`false\`, so that there is no status for branch protection to require`,
    );
  }

  const accepted = loadRecords(records)
    .filter((record) => record.status === "accepted")
    .map((record) => record.name.replace(/\.md$/, ""));

  // 4 — every accepted record reaches the reviewer as context, and nothing else does.
  const files = readJson(join(configDir, "files.json"));
  if (files.missing) {
    problems.push(`\`${CONFIG_DIR}/files.json\` is absent`);
  } else if (files.error) {
    problems.push(
      `\`${CONFIG_DIR}/files.json\` is not valid JSON (${files.error})`,
    );
  } else {
    const entries = Array.isArray(files.value?.files) ? files.value.files : [];
    const referenced = new Set(
      entries
        .map((entry) => entry?.path)
        .filter((path) => typeof path === "string")
        .map((path) => path.split("/").pop().replace(/\.md$/, "")),
    );
    for (const id of accepted) {
      if (!referenced.has(id)) {
        problems.push(
          `\`${CONFIG_DIR}/files.json\` carries no entry for accepted record \`${id}\`, so the reviewer never reads it`,
        );
      }
    }
    for (const id of referenced) {
      if (!accepted.includes(id)) {
        problems.push(
          `\`${CONFIG_DIR}/files.json\` references \`${id}\`, which is not an accepted record`,
        );
      }
    }
  }

  // 5 — every accepted record has a rule bound to it.
  if (!config.missing && !config.error) {
    const rules = Array.isArray(config.value.rules) ? config.value.rules : [];
    const ids = new Set(
      rules
        .filter((rule) => rule !== null && typeof rule === "object")
        .map((rule) => rule.id),
    );
    for (const id of accepted) {
      if (!ids.has(ruleIdFor(id))) {
        problems.push(
          `\`${CONFIG_DIR}/config.json\` carries no rule \`${ruleIdFor(id)}\` for accepted record \`${id}\``,
        );
      }
    }
  }

  return problems;
}

function main(args) {
  const options = { root: ".", records: RECORDS_DIR };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--root") {
      options.root = args[i + 1];
      i += 1;
    } else if (args[i] === "--records") {
      options.records = args[i + 1];
      i += 1;
    }
  }
  if (
    !existsSync(options.records) ||
    !statSync(options.records).isDirectory()
  ) {
    console.error(`no decision records under ${options.records}`);
    return 1;
  }
  const problems = shapeProblems(options);
  if (problems.length > 0) {
    console.error("reviewer configuration does not have its recorded shape:");
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(
    "reviewer configuration has its recorded shape: one root form, nothing nested, no status posted, every accepted record carrying a rule and reaching the reviewer as context.",
  );
  return 0;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(main(argv.slice(2)));
}
