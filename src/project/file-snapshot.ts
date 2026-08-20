// An in-memory copy of files a command is about to delete, so it can put
// them back itself if it fails partway.
//
// The "nothing was changed on failure" contract has to hold in a project
// with no git repository, so recovery can never be a version-control
// operation. This mirrors the `writtenFiles` bookkeeping `hatch import`
// already uses for the opposite direction: import records what it wrote so
// it can remove it, removal records what it deleted so it can restore it.
//
// Contents are held as raw bytes, keyed by path relative to the project
// root, so a restore is byte-for-byte and non-text payloads under a skill's
// `references/` or `assets/` survive unchanged.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export type FileSnapshot = Map<string, Buffer>;

export function createSnapshot(): FileSnapshot {
  return new Map();
}

// Adds every file under `dir` (recursively) to the snapshot. A directory
// that does not exist contributes nothing — removal tolerates an item whose
// content is already missing from disk.
export function snapshotTree(
  projectPath: string,
  dir: string,
  snapshot: FileSnapshot,
): void {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      snapshotTree(projectPath, entryPath, snapshot);
    } else if (entry.isFile()) {
      snapshot.set(
        toProjectRelative(projectPath, entryPath),
        readFileSync(entryPath),
      );
    }
  }
}

// Rewrites every snapshotted file, recreating whatever directories the
// deletion removed along the way.
export function restoreSnapshot(
  projectPath: string,
  snapshot: FileSnapshot,
): void {
  for (const [relativePath, contents] of snapshot) {
    const destination = join(projectPath, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
}

// Keys are normalized to forward slashes so a snapshot reads the same on
// every platform.
function toProjectRelative(projectPath: string, filePath: string): string {
  return relative(projectPath, filePath).split(sep).join("/");
}
