// Executes each decision record's machine check in the context the record
// declares, and reports per record. A record nothing verified is reported as
// unverified rather than passed, so a green run never overstates its coverage.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DELEGATING_CONTEXTS, EXECUTABLE_CONTEXTS } from "./records.mjs";

export const REPOS = ["cli", "registry", "all"];

// A delegating check reads the CLI repository's own reviewer configuration, so
// it runs wherever `cli-repo` runs and nowhere else.
const RUNNABLE_CONTEXTS = [...EXECUTABLE_CONTEXTS, ...DELEGATING_CONTEXTS];

const CONTEXTS_BY_REPO = {
  cli: ["cli-repo", "both", ...DELEGATING_CONTEXTS],
  registry: ["registry-checkout", "both"],
  all: RUNNABLE_CONTEXTS,
};

/** Where a record's check belongs in this run, before anything is executed. */
export function classify(record, repo) {
  if (record.status === "superseded") return "skipped";
  if (!RUNNABLE_CONTEXTS.includes(record.context)) return "unverified";
  if (!CONTEXTS_BY_REPO[repo].includes(record.context)) return "deferred";
  return "execute";
}

function workingDirectory(context, roots) {
  if (context === "registry-checkout") return roots.registry;
  return roots.cli;
}

/** Runs one record's check, or explains why it could not be run. */
export function execute(record, roots) {
  const needsRegistry =
    record.context === "registry-checkout" || record.context === "both";
  if (needsRegistry && !roots.registry) {
    return {
      outcome: "failed",
      output: `context \`${record.context}\` needs a hatch-skills checkout; none was given (pass --registry <path>)`,
    };
  }
  if (needsRegistry && !existsSync(roots.registry)) {
    return {
      outcome: "failed",
      output: `registry checkout not found at ${roots.registry}`,
    };
  }
  const scriptDir = mkdtempSync(join(tmpdir(), "adr-check-"));
  const scriptPath = join(scriptDir, "check.sh");
  writeFileSync(scriptPath, `${record.command}\n`);
  const result = spawnSync("bash", [scriptPath], {
    cwd: workingDirectory(record.context, roots),
    encoding: "utf8",
    env: { ...process.env, HATCH_REGISTRY: roots.registry ?? "" },
  });
  if (result.error) {
    return {
      outcome: "failed",
      output: `could not execute the check: ${result.error.message}`,
    };
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  return { outcome: result.status === 0 ? "passed" : "failed", output };
}

/** Runs every record's check that belongs in this repository's run. */
export function runAll(records, { repo, roots }) {
  return records.map((record) => {
    const placement = classify(record, repo);
    if (placement !== "execute")
      return { record, outcome: placement, output: "" };
    const { outcome, output } = execute(record, roots);
    // A passing delegation check establishes that the record's judge is still
    // configured, never that the decision holds, so it is never a plain pass.
    // A failing one is an ordinary failure and blocks like any other.
    if (outcome === "passed" && DELEGATING_CONTEXTS.includes(record.context)) {
      return { record, outcome: "delegated", output };
    }
    return { record, outcome, output };
  });
}

const LABELS = {
  passed: "PASS ",
  failed: "FAIL ",
  delegated: "JUDGE",
  unverified: "UNVER",
  skipped: "SKIP ",
  deferred: "DEFER",
};

const SUMMARY_ORDER = [
  "passed",
  "failed",
  "delegated",
  "unverified",
  "skipped",
  "deferred",
];

const OTHER_REPO = {
  "cli-repo": "the CLI repository's job",
  "registry-checkout": "the registry repository's job",
  both: "the other repository's job",
  "greptile-review": "the CLI repository's job",
};

/** Renders the per-record report and the summary that accounts for every record. */
export function report(results, { repo }) {
  const lines = [];
  const width = Math.max(...results.map((r) => r.record.name.length));
  for (const { record, outcome, output } of results) {
    let suffix = `(${record.context})`;
    if (outcome === "skipped")
      suffix = `(superseded by ${record.supersededBy ?? "an unnamed record"})`;
    if (outcome === "deferred")
      suffix = `(${record.context} — runs in ${OTHER_REPO[record.context]})`;
    lines.push(`${LABELS[outcome]} ${record.name.padEnd(width)}  ${suffix}`);
    if (outcome === "unverified") {
      lines.push(
        `        reason: ${record.reason ?? "none given — this record is non-conforming"}`,
      );
    }
    if (outcome === "delegated") {
      lines.push(
        `        judged by: ${record.reviewer ?? "no reviewer named — this record is non-conforming"}`,
      );
    }
    if (outcome === "failed" && output) {
      for (const line of output.split(/\r?\n/)) lines.push(`        ${line}`);
    }
  }

  const counts = {};
  for (const { outcome } of results)
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  const parts = SUMMARY_ORDER.filter((key) => counts[key]).map(
    (key) => `${counts[key]} ${key}`,
  );
  lines.push("");
  lines.push(`${results.length} records (repo: ${repo}): ${parts.join(", ")}`);
  return lines.join("\n");
}
