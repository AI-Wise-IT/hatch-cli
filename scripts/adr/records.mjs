// Parsing and conformance for the architecture decision records, as
// docs/architecture/decisions/README.md defines them. Everything here is
// pure over text so the conformance rules can be unit-tested without a
// checkout of the record set.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const RECORDS_DIR = "docs/architecture/decisions";

export const REQUIRED_SECTIONS = [
  "Metadata",
  "Decision",
  "Context",
  "Alternatives Considered",
  "Trade-offs Accepted",
  "Consequences",
  "Agent Rules",
  "Invariants",
  "Machine Check",
  "Precedence",
];

export const FROZEN_SECTIONS = ["Decision", "Agent Rules", "Invariants"];

export const STATUSES = ["concept", "accepted", "superseded"];

export const EXECUTABLE_CONTEXTS = ["cli-repo", "registry-checkout", "both"];
// A delegating context runs a command like an executable one, but that command
// establishes only that the record's judge is still configured — never the
// decision itself. The runner reports it under its own outcome for that reason.
export const DELEGATING_CONTEXTS = ["greptile-review"];
export const NON_EXECUTABLE_CONTEXTS = ["live-github", "review-only"];
export const CONTEXTS = [
  ...EXECUTABLE_CONTEXTS,
  ...DELEGATING_CONTEXTS,
  ...NON_EXECUTABLE_CONTEXTS,
];

// A pipeline ending in one of these swallows the exit status of everything
// upstream of it, so a check built that way can only ever report success.
const STATUS_SWALLOWING_STAGES = [
  "head",
  "tail",
  "cat",
  "sort",
  "uniq",
  "wc",
  "tee",
];

/** Splits a record into its level-2 sections, keyed by heading text. */
export function splitSections(text) {
  const sections = new Map();
  let heading = null;
  let body = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      if (heading !== null) sections.set(heading, body.join("\n"));
      heading = line.slice(3).trim();
      body = [];
    } else if (heading !== null) {
      body.push(line);
    }
  }
  if (heading !== null) sections.set(heading, body.join("\n"));
  return sections;
}

function bulletValue(section, key) {
  const prefix = `- **${key}:**`;
  for (const line of (section ?? "").split(/\r?\n/)) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return null;
}

function fencedBashBlocks(section) {
  const blocks = [];
  const pattern = /^```bash[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let match = pattern.exec(section ?? "");
  while (match !== null) {
    blocks.push(match[1].replace(/\r?\n$/, ""));
    match = pattern.exec(section ?? "");
  }
  return blocks;
}

/** Parses one record's text into the shape the runner and the report need. */
export function parseRecord(name, text) {
  const sections = splitSections(text);
  const metadata = sections.get("Metadata");
  const check = sections.get("Machine Check");
  const blocks = fencedBashBlocks(check);
  return {
    name,
    sections,
    status: bulletValue(metadata, "status"),
    context: bulletValue(check, "context"),
    reason: bulletValue(check, "reason"),
    reviewer: bulletValue(check, "reviewer"),
    commands: blocks,
    command: blocks[0] ?? null,
    expected: /^Expected result/m.test(check ?? ""),
    supersededBy: bulletValue(metadata, "superseded_by"),
  };
}

/** Reports why a command could never fail, or null when it can. */
export function unfailableReason(command) {
  if (/\|\|[ \t]*(true|:)\b/.test(command)) {
    return "ends a statement with `|| true`, so it exits 0 whatever it finds";
  }
  const lines = command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (lines.length === 0) return "is empty";
  if (/\bexit[ \t]+[1-9]/.test(command)) return null;
  const last = lines[lines.length - 1];
  if (/\|\|[ \t]*(echo|printf)\b/.test(last)) {
    return "swallows its own failure in a trailing `|| echo`, and declares no `exit` path, so it exits 0 whatever it finds";
  }
  const stages = last.split("|").map((stage) => stage.trim());
  const finalStage = stages[stages.length - 1].split(/\s+/)[0];
  if (stages.length > 1 && STATUS_SWALLOWING_STAGES.includes(finalStage)) {
    return `ends in a pipeline stage (\`${finalStage}\`) that discards the exit status of everything upstream, and declares no \`exit\` path`;
  }
  if (/^(echo|printf|true)\b/.test(last)) {
    return "ends in a bare `echo`, and declares no `exit` path, so it exits 0 whatever it finds";
  }
  return null;
}

/** Everything about a record that violates the contract. */
export function conformanceProblems(record) {
  const problems = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!record.sections.has(section))
      problems.push(`missing required section \`## ${section}\``);
  }

  if (record.status === null) {
    problems.push("declares no `status` in `## Metadata`");
  } else if (!STATUSES.includes(record.status)) {
    problems.push(
      `declares status \`${record.status}\`, which is not one of ${STATUSES.join(", ")}`,
    );
  } else if (record.status === "superseded" && !record.supersededBy) {
    problems.push("is superseded but names no `superseded_by` record");
  }

  if (record.context === null) {
    problems.push("declares no `context` in `## Machine Check`");
    return problems;
  }
  if (!CONTEXTS.includes(record.context)) {
    problems.push(
      `declares context \`${record.context}\`, which is not one of ${CONTEXTS.join(", ")}`,
    );
    return problems;
  }

  const delegating = DELEGATING_CONTEXTS.includes(record.context);

  if (EXECUTABLE_CONTEXTS.includes(record.context) || delegating) {
    if (record.commands.length === 0) {
      problems.push(
        delegating
          ? "declares a delegating context but carries no fenced `bash` block"
          : "declares an executable context but carries no fenced `bash` block",
      );
      return problems;
    }
    if (record.commands.length > 1) {
      problems.push(
        `carries ${record.commands.length} fenced \`bash\` blocks; the contract allows one`,
      );
    }
    if (!record.expected)
      problems.push("states no `Expected result:` for its check");
    const placeholder = /<[a-z][a-z0-9._-]*>/.exec(record.command);
    if (placeholder) {
      problems.push(
        `carries the unexpanded placeholder \`${placeholder[0]}\` in its check`,
      );
    }
    const unfailable = unfailableReason(record.command);
    if (unfailable) problems.push(`carries a check that ${unfailable}`);

    // A delegating record names its judge in place of the `reason` a record
    // nothing verifies carries. Carrying both would claim the record is at
    // once judged and unjudgeable.
    if (delegating) {
      if (!record.reviewer) {
        problems.push(
          `declares context \`${record.context}\` but names no \`reviewer\` for it`,
        );
      }
      if (record.reason) {
        problems.push(
          `declares context \`${record.context}\` but also names a \`reason\`, which belongs to a record no reviewer judges`,
        );
      }
    }
  } else {
    if (!record.reason) {
      problems.push(
        `declares context \`${record.context}\` but names no \`reason\` for it`,
      );
    }
    if (record.commands.length > 0) {
      problems.push(
        `declares context \`${record.context}\` but presents a fenced \`bash\` block, which reads as a check the runner will execute`,
      );
    }
  }

  return problems;
}

/** Reads and parses every record in a directory, in numeric order. */
export function loadRecords(dir = RECORDS_DIR) {
  return readdirSync(dir)
    .filter((file) => /^\d{4}-.+\.md$/.test(file))
    .sort()
    .map((file) => parseRecord(file, readFileSync(join(dir, file), "utf8")));
}
