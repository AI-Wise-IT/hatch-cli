import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diskTreeIsEmpty } from "../manifest-migrations/content-hash.js";
import {
  type FileSnapshot,
  createSnapshot,
  restoreSnapshot,
  snapshotTree,
  treeIsEmpty,
} from "./file-snapshot.js";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "hatch-snapshot-test-"));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function write(relativePath: string, contents: string | Buffer): void {
  const full = join(project, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

// A group member's placed content, with the nested payload folders a skill
// is allowed to carry.
const BINARY = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x00, 0x7f]);

function placeGroupMember(): string {
  const dir = ".claude/skills/member-one";
  write(`${dir}/SKILL.md`, "# Member One");
  write(`${dir}/references/deep/notes.md`, "reference notes");
  write(`${dir}/assets/logo.png`, BINARY);
  return join(project, dir);
}

// A snapshot entry is a tagged union — a file's bytes or a link's target —
// so a test that wants the bytes says so.
function fileAt(snapshot: FileSnapshot, key: string): Buffer | undefined {
  const entry = snapshot.get(key);
  return entry?.kind === "file" ? entry.contents : undefined;
}

describe("snapshotTree", () => {
  it("captures nested references/ and assets/ content, including non-text files", () => {
    const dir = placeGroupMember();
    const snapshot = createSnapshot();

    snapshotTree(project, dir, snapshot);

    expect([...snapshot.keys()].sort()).toEqual([
      ".claude/skills/member-one/SKILL.md",
      ".claude/skills/member-one/assets/logo.png",
      ".claude/skills/member-one/references/deep/notes.md",
    ]);
    expect(
      fileAt(snapshot, ".claude/skills/member-one/SKILL.md")?.toString("utf8"),
    ).toBe("# Member One");
    expect(
      fileAt(
        snapshot,
        ".claude/skills/member-one/references/deep/notes.md",
      )?.toString("utf8"),
    ).toBe("reference notes");
    // Byte-for-byte, not decoded through any text encoding.
    expect(
      fileAt(snapshot, ".claude/skills/member-one/assets/logo.png")?.equals(
        BINARY,
      ),
    ).toBe(true);
  });

  it("accumulates several trees into one snapshot", () => {
    placeGroupMember();
    write(".agents/skills/member-one/SKILL.md", "# Member One");
    const snapshot = createSnapshot();

    snapshotTree(project, join(project, ".claude/skills/member-one"), snapshot);
    snapshotTree(project, join(project, ".agents/skills/member-one"), snapshot);

    expect(snapshot.size).toBe(4);
    expect(snapshot.has(".agents/skills/member-one/SKILL.md")).toBe(true);
  });

  it("contributes nothing for a directory that does not exist", () => {
    const snapshot = createSnapshot();

    snapshotTree(project, join(project, ".claude/skills/absent"), snapshot);

    expect(snapshot.size).toBe(0);
  });
});

describe("restoreSnapshot", () => {
  it("puts every file back byte-for-byte after the tree is deleted", () => {
    const dir = placeGroupMember();
    const snapshot = createSnapshot();
    snapshotTree(project, dir, snapshot);

    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);

    restoreSnapshot(project, snapshot);

    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe("# Member One");
    expect(
      readFileSync(join(dir, "references", "deep", "notes.md"), "utf8"),
    ).toBe("reference notes");
    expect(readFileSync(join(dir, "assets", "logo.png")).equals(BINARY)).toBe(
      true,
    );
  });
});

// Creating a symbolic link on Windows needs elevation or Developer Mode, so
// these skip on an unprivileged Windows checkout rather than failing there.
// CI runs on Linux, where they always run.
const CAN_SYMLINK = (() => {
  const probe = mkdtempSync(join(tmpdir(), "hatch-symlink-probe-"));
  try {
    symlinkSync(join(probe, "target"), join(probe, "link"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

// Hatch never creates a symbolic link, but a developer may have linked a
// skill's file somewhere — and `rmSync`/`renameSync` act on links whether or
// not this module understands them. A link left out of the snapshot is a link
// destroyed with no way back.
describe.skipIf(!CAN_SYMLINK)("snapshotTree — symbolic links", () => {
  function link(relativePath: string, target: string): void {
    const full = join(project, relativePath);
    mkdirSync(join(full, ".."), { recursive: true });
    symlinkSync(target, full);
  }

  it("records a link as its target rather than following it", () => {
    write("shared/notes.md", "shared notes");
    link(
      ".claude/skills/member-one/notes.md",
      join(project, "shared/notes.md"),
    );
    const snapshot = createSnapshot();

    snapshotTree(project, join(project, ".claude/skills/member-one"), snapshot);

    expect(snapshot.get(".claude/skills/member-one/notes.md")).toEqual({
      kind: "symlink",
      target: join(project, "shared/notes.md"),
    });
  });

  it("puts a deleted link back as a link, leaving its target alone", () => {
    write("shared/notes.md", "shared notes");
    link(
      ".claude/skills/member-one/notes.md",
      join(project, "shared/notes.md"),
    );
    const dir = join(project, ".claude/skills/member-one");
    const snapshot = createSnapshot();
    snapshotTree(project, dir, snapshot);

    rmSync(dir, { recursive: true, force: true });
    restoreSnapshot(project, snapshot);

    const restored = join(project, ".claude/skills/member-one/notes.md");
    expect(lstatSync(restored).isSymbolicLink()).toBe(true);
    expect(readFileSync(restored, "utf8")).toBe("shared notes");
    // The target was never Hatch's to touch.
    expect(readFileSync(join(project, "shared/notes.md"), "utf8")).toBe(
      "shared notes",
    );
  });

  it("does not walk into a link that points at a directory", () => {
    write("elsewhere/deep/secret.md", "not ours");
    link(".claude/skills/member-one/linked", join(project, "elsewhere"));
    const snapshot = createSnapshot();

    snapshotTree(project, join(project, ".claude/skills/member-one"), snapshot);

    expect([...snapshot.keys()]).toEqual([".claude/skills/member-one/linked"]);
  });
});

// The emptiness question a caller about to delete a tree needs answered:
// "is there anything here I could not put back?" — deliberately stricter
// than the file-only count a content hash uses.
describe("treeIsEmpty", () => {
  it("is true for a directory that does not exist", () => {
    expect(treeIsEmpty(join(project, "nothing-here"))).toBe(true);
  });

  it("is true for a tree of empty directories", () => {
    mkdirSync(join(project, ".codex/skills/member-one/references/deep"), {
      recursive: true,
    });
    expect(treeIsEmpty(join(project, ".codex/skills/member-one"))).toBe(true);
  });

  it("is false for a tree holding a file at any depth", () => {
    write(".codex/skills/member-one/references/deep/notes.md", "notes");
    expect(treeIsEmpty(join(project, ".codex/skills/member-one"))).toBe(false);
  });

  it.skipIf(!CAN_SYMLINK)(
    "is false for a tree holding only a symbolic link",
    () => {
      write("shared/notes.md", "shared notes");
      const full = join(project, ".codex/skills/member-one/notes.md");
      mkdirSync(join(full, ".."), { recursive: true });
      symlinkSync(join(project, "shared/notes.md"), full);

      expect(treeIsEmpty(join(project, ".codex/skills/member-one"))).toBe(
        false,
      );
      // The distinction that matters: a hash counts files, so it calls this
      // empty and the migration would delete it unsnapshotted.
      expect(diskTreeIsEmpty(join(project, ".codex/skills/member-one"))).toBe(
        true,
      );
    },
  );
});
