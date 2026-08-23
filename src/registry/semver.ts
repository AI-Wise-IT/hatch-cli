// Semver comparison for "newer compatible version" (0009-skill-versioning-semver-tags.md):
// same MAJOR, higher MINOR or PATCH than the currently recorded version. A
// new MAJOR is never treated as an auto-appliable update.

function parseTriple(v: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string): number {
  const pa = parseTriple(a);
  const pb = parseTriple(b);
  if (!pa || !pb) {
    return a.localeCompare(b);
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

// A group pointer member's version constraint. Either an exact published
// version, or a caret naming a MAJOR plus a floor within it — the same
// spelling `hatch import <name>@^<version>` already uses for a standalone
// pin. A group pointer is resolved fresh on every unpack and never recorded
// in the project manifest, so unlike a standalone import it has no recorded
// version to bound "compatible" against: the caret carries that bound
// itself.
export type VersionConstraint =
  | { kind: "exact"; version: string }
  | { kind: "caret"; major: number; floor: string };

// Deliberately anchored at both ends, unlike parseTriple's prefix match:
// in a manifest, a value that is only nearly a version ("1.0", "1.x",
// "v1.2.0") is an authoring error, not something to interpret. Rejecting it
// at parse time is what keeps it from becoming a git ref nobody meant to
// request.
const EXACT_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

// Classifies a pointer member's `version` string. Returns undefined for
// anything outside the two supported forms, which the caller reports as a
// malformed member rather than passing through as a ref.
export function parseVersionConstraint(
  raw: string,
): VersionConstraint | undefined {
  if (raw.startsWith("^")) {
    const floor = raw.slice(1);
    const match = EXACT_VERSION.exec(floor);
    if (!match) {
      return undefined;
    }
    return { kind: "caret", major: Number(match[1]), floor };
  }
  if (!EXACT_VERSION.test(raw)) {
    return undefined;
  }
  return { kind: "exact", version: raw };
}

// The highest published version satisfying a caret constraint: sharing its
// MAJOR and not below its floor. Undefined when nothing published satisfies
// it — either the MAJOR has no releases at all, or every release in it
// predates the floor. Both are manifest errors the caller reports rather
// than silently widening.
export function resolveCaretConstraint(
  constraint: { major: number; floor: string },
  published: string[],
): string | undefined {
  const candidates = published.filter((version) => {
    const triple = parseTriple(version);
    return (
      triple !== undefined &&
      triple[0] === constraint.major &&
      compareVersions(version, constraint.floor) >= 0
    );
  });
  return candidates.sort(compareVersions).at(-1);
}

// True only when `candidate` shares `current`'s MAJOR and is a higher
// MINOR/PATCH — the sole case hatch import's re-import update path (AF-2)
// auto-applies.
export function isNewerCompatible(current: string, candidate: string): boolean {
  const pc = parseTriple(current);
  const pn = parseTriple(candidate);
  if (!pc || !pn) {
    return false;
  }
  if (pc[0] !== pn[0]) {
    return false;
  }
  return compareVersions(candidate, current) > 0;
}
