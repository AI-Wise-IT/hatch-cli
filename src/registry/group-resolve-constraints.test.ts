import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch.js", () => ({
  fetchRegistryFile: vi.fn(),
  fetchRegistryFolder: vi.fn(),
  fetchPublishedVersions: vi.fn(),
}));

const { fetchRegistryFile, fetchRegistryFolder, fetchPublishedVersions } =
  await import("./fetch.js");
const { resolveGroupMembers, parseGroupSkillJson } = await import(
  "./group-resolve.js"
);

function skillJson(version: string, members?: unknown[]): string {
  return JSON.stringify(members ? { version, members } : { version });
}

const ROOT_FILES = new Map([["skill.json", skillJson("1.0.0")]]);

function caret(floor: string) {
  return {
    kind: "caret" as const,
    major: Number(floor.split(".")[0]),
    floor,
  };
}

function exact(version: string) {
  return { kind: "exact" as const, version };
}

// A leaf skill that exists at `version`: its skill.json classifies it as a
// plain skill, and its folder fetch returns placeable content.
function leafAt(version: string) {
  vi.mocked(fetchRegistryFile).mockResolvedValue({
    ok: true,
    content: skillJson(version),
  });
  vi.mocked(fetchRegistryFolder).mockResolvedValue({
    ok: true,
    files: new Map([
      ["skill.json", skillJson(version)],
      ["SKILL.md", "# x"],
    ]),
  });
}

beforeEach(() => {
  vi.mocked(fetchRegistryFile).mockReset();
  vi.mocked(fetchRegistryFolder).mockReset();
  vi.mocked(fetchPublishedVersions).mockReset();
});

describe("pointer version constraint grammar", () => {
  it("rejects a version matching neither supported form, before any fetch", () => {
    expect(() =>
      parseGroupSkillJson(
        skillJson("1.0.0", [
          { kind: "pointer", name: "shared", version: "1.x" },
        ]),
        "my-group",
      ),
    ).toThrow(/my-group/);
    expect(fetchRegistryFile).not.toHaveBeenCalled();
    expect(fetchPublishedVersions).not.toHaveBeenCalled();
  });

  it("names the group, the entry index and the offending value", () => {
    let message = "";
    try {
      parseGroupSkillJson(
        skillJson("1.0.0", [
          { kind: "pointer", name: "ok", version: "1.0.0" },
          { kind: "pointer", name: "bad", version: "~1.2.0" },
        ]),
        "my-group",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("my-group");
    expect(message).toContain("members[1]");
    expect(message).toContain("~1.2.0");
  });

  it("rejects a non-string version", () => {
    expect(() =>
      parseGroupSkillJson(
        skillJson("1.0.0", [{ kind: "pointer", name: "shared", version: 12 }]),
        "my-group",
      ),
    ).toThrow(/must be a string/);
  });

  it("rejects a version declared on a nested member", () => {
    expect(() =>
      parseGroupSkillJson(
        skillJson("1.0.0", [
          { kind: "nested", name: "inner", version: "1.0.0" },
        ]),
        "my-group",
      ),
    ).toThrow(/must not declare a "version"/);
  });

  it("accepts an exact pin, a caret, and no constraint at all", () => {
    const parsed = parseGroupSkillJson(
      skillJson("1.0.0", [
        { kind: "pointer", name: "a", version: "1.2.0" },
        { kind: "pointer", name: "b", version: "^1.2.0" },
        { kind: "pointer", name: "c" },
      ]),
      "my-group",
    );
    expect(parsed.members).toEqual([
      { kind: "pointer", name: "a", constraint: exact("1.2.0") },
      { kind: "pointer", name: "b", constraint: caret("1.2.0") },
      { kind: "pointer", name: "c", constraint: undefined },
    ]);
  });
});

describe("caret-constrained pointer resolution", () => {
  it("resolves to the highest published version in the constrained MAJOR", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.1.0", "1.1.4"],
    });
    leafAt("1.1.4");

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "shared", constraint: caret("1.0.0") }],
      ROOT_FILES,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members[0].version).toBe("1.1.4");
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "token",
      "shared",
      "shared@1.1.4",
    );
  });

  it("never crosses into a higher MAJOR, and says nothing about it", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.4.0", "2.0.0"],
    });
    leafAt("1.4.0");

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "shared", constraint: caret("1.0.0") }],
      ROOT_FILES,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members[0].version).toBe("1.4.0");
    expect(result.warnings).toEqual([]);
  });

  it("aborts when the constrained MAJOR has no published version", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["2.0.0", "3.1.0"],
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "shared", constraint: caret("1.0.0") }],
      ROOT_FILES,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.detail).toContain("shared");
    expect(result.detail).toContain("^1.0.0");
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("aborts when every version in the MAJOR is below the floor", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.4.0"],
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "shared", constraint: caret("1.5.0") }],
      ROOT_FILES,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.detail).toContain("^1.5.0");
    expect(result.detail).toContain("1.4.0");
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("queries a name's published versions once however many paths reach it", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0"],
    });
    leafAt("1.3.0");

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared", constraint: caret("1.0.0") },
        { kind: "pointer", name: "shared", constraint: caret("1.1.0") },
        { kind: "pointer", name: "shared", constraint: caret("1.2.0") },
      ],
      ROOT_FILES,
    );

    expect(result.ok).toBe(true);
    expect(fetchPublishedVersions).toHaveBeenCalledTimes(1);
  });

  it("lets a caret govern when another path is unconstrained", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0", "2.0.0"],
    });
    leafAt("1.3.0");

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared" },
        { kind: "pointer", name: "shared", constraint: caret("1.0.0") },
      ],
      ROOT_FILES,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members[0].version).toBe("1.3.0");
    expect(result.warnings).toEqual([]);
  });

  it("resolves a caret and an exact pin in one MAJOR to the highest, with a warning", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.2.0", "1.4.0"],
    });
    leafAt("1.4.0");

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared", constraint: exact("1.2.0") },
        { kind: "pointer", name: "shared", constraint: caret("1.0.0") },
      ],
      ROOT_FILES,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members[0].version).toBe("1.4.0");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("1.2.0");
    expect(result.warnings[0]).toContain("1.4.0");
  });

  it("aborts when a caret and an exact pin resolve to different MAJORs", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.9.0", "2.0.0"],
    });
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("1.0.0"),
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared", constraint: caret("1.0.0") },
        { kind: "pointer", name: "shared", constraint: exact("2.0.0") },
      ],
      ROOT_FILES,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("major-conflict");
    expect(result.detail).toContain("1.9.0");
    expect(result.detail).toContain("2.0.0");
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("resolves a caret carried on a group-to-group pointer path", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.6.0"],
    });
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) =>
      path === "inner-group/skill.json"
        ? {
            ok: true,
            content: skillJson("2.0.0", [
              { kind: "pointer", name: "leaf", version: "^1.0.0" },
            ]),
          }
        : { ok: true, content: skillJson("1.6.0") },
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => ({
      ok: true,
      files: new Map([
        ["skill.json", skillJson("1.6.0")],
        ["SKILL.md", `# ${name}`],
      ]),
    }));

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "inner-group" }],
      ROOT_FILES,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members.find((m) => m.name === "leaf")?.version).toBe(
      "1.6.0",
    );
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "token",
      "leaf",
      "leaf@1.6.0",
    );
  });
});
