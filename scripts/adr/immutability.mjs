// Enforces the immutability boundary: in a record whose status is `accepted`,
// the Decision, Agent Rules and Invariants sections may not be edited. The
// status that governs is the one at the merge base, not at the pull-request
// head — otherwise a change could flip a record to `concept`, rewrite its
// Decision, and flip it back in a single commit.

import { execFileSync } from "node:child_process";
import { FROZEN_SECTIONS, RECORDS_DIR, parseRecord } from "./records.mjs";

const EDITABLE = [
  "Context",
  "Alternatives Considered",
  "Trade-offs Accepted",
  "Consequences",
  "Machine Check",
  "Precedence",
];

function sectionText(record, section) {
  return (record.sections.get(section) ?? "").replace(/\r\n/g, "\n").trim();
}

/**
 * Compares two snapshots of the record set, each a Map of filename to file
 * text, and reports every frozen-section edit to an accepted record.
 */
export function frozenViolations(baseTexts, headTexts) {
  const violations = [];
  for (const [name, baseText] of baseTexts) {
    const base = parseRecord(name, baseText);
    if (base.status !== "accepted") continue;

    const headText = headTexts.get(name);
    if (headText === undefined) {
      violations.push({ record: name, section: null, kind: "removed" });
      continue;
    }
    const head = parseRecord(name, headText);
    for (const section of FROZEN_SECTIONS) {
      if (sectionText(base, section) !== sectionText(head, section)) {
        violations.push({ record: name, section, kind: "edited" });
      }
    }
  }
  return violations;
}

/** The failure report: the record, the section, and supersession as the remedy. */
export function describe(violations) {
  const lines = [];
  for (const { record, section, kind } of violations) {
    if (kind === "removed") {
      lines.push(
        `${record}: the record was removed, and its status at the merge base is \`accepted\`.`,
        "        An accepted decision is superseded, never deleted. Restore the record, set its status to `superseded`, and name the record that replaces it.",
      );
      continue;
    }
    lines.push(
      `${record}: \`## ${section}\` was edited, and this record's status at the merge base is \`accepted\`.`,
      "        An accepted decision is superseded, never edited. Restore the section exactly as accepted, then add a new record that supersedes this one — setting this record's status to `superseded` and naming its replacement.",
      `        Editable without supersession: ${EDITABLE.join(", ")}.`,
    );
  }
  return lines.join("\n");
}

/** Reads every record as it stands at a git ref, as a Map of filename to text. */
export function readRecordsAtRef(ref, dir = RECORDS_DIR) {
  const listing = execFileSync(
    "git",
    ["ls-tree", "--name-only", `${ref}:${dir}`],
    {
      encoding: "utf8",
    },
  );
  const texts = new Map();
  for (const name of listing
    .split(/\r?\n/)
    .filter((n) => /^\d{4}-.+\.md$/.test(n))) {
    texts.set(
      name,
      execFileSync("git", ["show", `${ref}:${dir}/${name}`], {
        encoding: "utf8",
      }),
    );
  }
  return texts;
}

/** The commit a pull request branched from, so the comparison ignores main's own moves. */
export function mergeBase(base, head) {
  return execFileSync("git", ["merge-base", base, head], {
    encoding: "utf8",
  }).trim();
}
