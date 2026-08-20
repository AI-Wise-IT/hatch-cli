import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSnapshot,
  restoreSnapshot,
  snapshotTree,
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
      snapshot.get(".claude/skills/member-one/SKILL.md")?.toString("utf8"),
    ).toBe("# Member One");
    expect(
      snapshot
        .get(".claude/skills/member-one/references/deep/notes.md")
        ?.toString("utf8"),
    ).toBe("reference notes");
    // Byte-for-byte, not decoded through any text encoding.
    expect(
      snapshot.get(".claude/skills/member-one/assets/logo.png")?.equals(BINARY),
    ).toBe(true);
  });

  it("accumulates several trees into one snapshot", () => {
    placeGroupMember();
    write(".codex/skills/member-one/SKILL.md", "# Member One");
    const snapshot = createSnapshot();

    snapshotTree(project, join(project, ".claude/skills/member-one"), snapshot);
    snapshotTree(project, join(project, ".codex/skills/member-one"), snapshot);

    expect(snapshot.size).toBe(4);
    expect(snapshot.has(".codex/skills/member-one/SKILL.md")).toBe(true);
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
