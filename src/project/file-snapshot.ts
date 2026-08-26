// An in-memory copy of what a command is about to delete, so it can put it
// back itself if it fails partway.
//
// The "nothing was changed on failure" contract has to hold in a project
// with no git repository, so recovery can never be a version-control
// operation. This mirrors the `writtenFiles` bookkeeping `hatch import`
// already uses for the opposite direction: import records what it wrote so
// it can remove it, removal records what it deleted so it can restore it.
//
// File contents are held as raw bytes, keyed by path relative to the project
// root, so a restore is byte-for-byte and non-text payloads under a skill's
// `references/` or `assets/` survive unchanged.
//
// A symbolic link is recorded as its target rather than as content. Hatch
// never creates one, but a developer may have linked a skill's file
// somewhere, and `rmSync`/`renameSync` act on links whether or not this
// module understands them — so a link left out of the snapshot is a link
// destroyed with no way back. What the link points at is deliberately not
// followed: the link itself is what was removed, and the target is somebody
// else's file.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export type SnapshotEntry =
  | { kind: "file"; contents: Buffer }
  | { kind: "symlink"; target: string };

export type FileSnapshot = Map<string, SnapshotEntry>;

export function createSnapshot(): FileSnapshot {
  return new Map();
}

// Adds every file and symbolic link under `dir` (recursively) to the
// snapshot. A directory that does not exist contributes nothing — removal
// tolerates an item whose content is already missing from disk.
//
// A `Dirent` reflects the entry itself rather than what it resolves to, so a
// link to a directory reports neither `isDirectory` nor `isFile` and is
// recorded as a link rather than walked into.
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
    if (entry.isSymbolicLink()) {
      snapshot.set(toProjectRelative(projectPath, entryPath), {
        kind: "symlink",
        target: readlinkSync(entryPath),
      });
    } else if (entry.isDirectory()) {
      snapshotTree(projectPath, entryPath, snapshot);
    } else if (entry.isFile()) {
      snapshot.set(toProjectRelative(projectPath, entryPath), {
        kind: "file",
        contents: readFileSync(entryPath),
      });
    }
  }
}

// True when `dir` does not exist, or holds nothing this module could restore
// — no file and no symbolic link, at any depth.
//
// This is the emptiness question a caller about to delete a tree needs
// answered, and it is deliberately stricter than
// `diskTreeIsEmpty`/`hashDiskTree`, which count files only because a hash
// over placed content has no business following links.
export function treeIsEmpty(dir: string): boolean {
  if (!existsSync(dir)) {
    return true;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.isFile()) {
      return false;
    }
    if (entry.isDirectory() && !treeIsEmpty(join(dir, entry.name))) {
      return false;
    }
  }
  return true;
}

// Rewrites every snapshotted entry, recreating whatever directories the
// deletion removed along the way. An existing entry at the destination is
// cleared first, so restoring a link over a file (or the reverse) does not
// fail on a path that is already occupied.
export function restoreSnapshot(
  projectPath: string,
  snapshot: FileSnapshot,
): void {
  for (const [relativePath, entry] of snapshot) {
    const destination = join(projectPath, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(destination, { recursive: true, force: true });
    if (entry.kind === "symlink") {
      symlinkSync(entry.target, destination);
    } else {
      writeFileSync(destination, entry.contents);
    }
  }
}

// Keys are normalized to forward slashes so a snapshot reads the same on
// every platform.
function toProjectRelative(projectPath: string, filePath: string): string {
  return relative(projectPath, filePath).split(sep).join("/");
}
