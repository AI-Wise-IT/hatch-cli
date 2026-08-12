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
