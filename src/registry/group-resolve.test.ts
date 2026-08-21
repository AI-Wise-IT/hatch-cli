import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch.js", () => ({
  fetchRegistryFile: vi.fn(),
  fetchRegistryFolder: vi.fn(),
}));

const { fetchRegistryFile, fetchRegistryFolder } = await import("./fetch.js");
const { resolveGroupMembers, parseGroupSkillJson } = await import(
  "./group-resolve.js"
);

function skillJson(version: string, members?: unknown[]): string {
  return JSON.stringify(members ? { version, members } : { version });
}

beforeEach(() => {
  vi.mocked(fetchRegistryFile).mockReset();
  vi.mocked(fetchRegistryFolder).mockReset();
});

describe("parseGroupSkillJson", () => {
  it("classifies a skill.json with no members field as a plain skill", () => {
    const result = parseGroupSkillJson(skillJson("1.0.0"), "foo");
    expect(result).toEqual({ version: "1.0.0" });
  });

  it("classifies a skill.json with a members array as a group", () => {
    const result = parseGroupSkillJson(
      skillJson("1.0.0", [{ kind: "nested", name: "bar" }]),
      "foo",
    );
    expect(result).toEqual({
      version: "1.0.0",
      members: [{ kind: "nested", name: "bar" }],
    });
  });

  it("reads a plain skill's testing declaration (0027)", () => {
    const result = parseGroupSkillJson(
      JSON.stringify({ version: "1.0.0", testing: true }),
      "_reimport-fixture",
    );
    expect(result.testing).toBe(true);
  });

  it("reads a group's testing declaration (0027)", () => {
    const result = parseGroupSkillJson(
      JSON.stringify({
        version: "1.0.0",
        testing: true,
        members: [{ kind: "nested", name: "bar" }],
      }),
      "_group-fixture-sub",
    );
    expect(result.testing).toBe(true);
    expect(result.members).toEqual([{ kind: "nested", name: "bar" }]);
  });

  it("parses a skill.json with no testing field unchanged", () => {
    const result = parseGroupSkillJson(skillJson("1.0.0"), "foo");
    expect(result.testing).toBeUndefined();
    expect(result.version).toBe("1.0.0");
  });

  it("treats a declared-false folder as ordinary content", () => {
    const result = parseGroupSkillJson(
      JSON.stringify({ version: "1.0.0", testing: false }),
      "example-pointer-skill",
    );
    expect(result.testing).toBeUndefined();
  });

  it("throws on a member missing a name", () => {
    expect(() =>
      parseGroupSkillJson(skillJson("1.0.0", [{ kind: "nested" }]), "foo"),
    ).toThrow(/must have a non-empty "name"/);
  });

  it("throws on an unrecognized member kind", () => {
    expect(() =>
      parseGroupSkillJson(
        skillJson("1.0.0", [{ kind: "bogus", name: "bar" }]),
        "foo",
      ),
    ).toThrow(/kind must be "nested" or "pointer"/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseGroupSkillJson("not json", "foo")).toThrow(
      /not valid JSON/,
    );
  });

  it("surfaces a removed:true flag alongside version/members (0019, 0021)", () => {
    const result = parseGroupSkillJson(
      JSON.stringify({ version: "1.0.0", removed: true }),
      "foo",
    );
    expect(result).toEqual({ version: "1.0.0", removed: true });
  });

  it("treats an absent or false removed field as not removed", () => {
    expect(
      parseGroupSkillJson(skillJson("1.0.0"), "foo").removed,
    ).toBeUndefined();
    expect(
      parseGroupSkillJson(
        JSON.stringify({ version: "1.0.0", removed: false }),
        "foo",
      ).removed,
    ).toBeUndefined();
  });
});

describe("parseGroupSkillJson — a group's own description (UC-6)", () => {
  it("reads a group's description alongside version and members", () => {
    const result = parseGroupSkillJson(
      JSON.stringify({
        version: "1.0.0",
        description: "Everything needed to run a discovery workshop.",
        members: [{ kind: "nested", name: "bar" }],
      }),
      "workshop-group",
    );

    expect(result.description).toBe(
      "Everything needed to run a discovery workshop.",
    );
    expect(result.version).toBe("1.0.0");
    expect(result.members).toEqual([{ kind: "nested", name: "bar" }]);
  });

  it("trims surrounding whitespace off the value it reads", () => {
    const result = parseGroupSkillJson(
      JSON.stringify({
        version: "1.0.0",
        description: "  padded description  ",
        members: [],
      }),
      "workshop-group",
    );

    expect(result.description).toBe("padded description");
  });

  it("reads an absent description as no description", () => {
    expect(
      parseGroupSkillJson(skillJson("1.0.0", []), "workshop-group").description,
    ).toBeUndefined();
    expect(
      parseGroupSkillJson(skillJson("1.0.0"), "plain-skill").description,
    ).toBeUndefined();
  });

  it("reads an empty or whitespace-only description as no description", () => {
    expect(
      parseGroupSkillJson(
        JSON.stringify({ version: "1.0.0", description: "" }),
        "workshop-group",
      ).description,
    ).toBeUndefined();
    expect(
      parseGroupSkillJson(
        JSON.stringify({ version: "1.0.0", description: "   " }),
        "workshop-group",
      ).description,
    ).toBeUndefined();
  });

  it("reads a non-string description as no description rather than raising", () => {
    for (const value of [42, true, null, ["a"], { text: "a" }]) {
      const result = parseGroupSkillJson(
        JSON.stringify({ version: "1.0.0", description: value }),
        "workshop-group",
      );
      expect(result.description).toBeUndefined();
      expect(result.version).toBe("1.0.0");
    }
  });
});

describe("resolveGroupMembers — nested members", () => {
  it("resolves nested members directly from the group's own fetched content, versioned as the group", async () => {
    const rootFiles = new Map([
      ["skill.json", skillJson("1.0.0")],
      ["a/SKILL.md", "# A"],
      ["b/SKILL.md", "# B"],
      ["b/references/notes.md", "notes"],
    ]);

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "nested", name: "a" },
        { kind: "nested", name: "b" },
      ],
      rootFiles,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings).toEqual([]);
    const byName = new Map(result.members.map((m) => [m.name, m]));
    expect(byName.get("a")?.version).toBe("1.0.0");
    expect(byName.get("a")?.files.get("SKILL.md")).toBe("# A");
    expect(byName.get("b")?.files.get("references/notes.md")).toBe("notes");
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
    expect(fetchRegistryFile).not.toHaveBeenCalled();
  });
});

describe("resolveGroupMembers — pointer members", () => {
  it("resolves a pointer to a standalone skill, fetching its own content and version", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("2.3.0"),
    });
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([
        ["skill.json", skillJson("2.3.0")],
        ["SKILL.md", "# standalone"],
      ]),
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "example-pointer-skill" }],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members).toEqual([
      {
        name: "example-pointer-skill",
        version: "2.3.0",
        files: new Map([["SKILL.md", "# standalone"]]),
      },
    ]);
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "token",
      "example-pointer-skill",
      undefined,
    );
  });

  it("resolves a group-to-group pointer, recursing into its members", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("1.0.0", [{ kind: "nested", name: "inner" }]),
    });
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([
        ["skill.json", skillJson("1.0.0", [{ kind: "nested", name: "inner" }])],
        ["inner/SKILL.md", "# inner"],
      ]),
    });

    const result = await resolveGroupMembers(
      "token",
      "outer-group",
      "1.0.0",
      [{ kind: "pointer", name: "sub-group" }],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members).toEqual([
      {
        name: "inner",
        version: "1.0.0",
        files: new Map([["SKILL.md", "# inner"]]),
      },
    ]);
  });

  it("dedupes a name reached via two separate unpinned pointers, fetching it only once", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("1.0.0"),
    });
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([
        ["skill.json", skillJson("1.0.0")],
        ["SKILL.md", "# shared"],
      ]),
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared-skill" },
        { kind: "pointer", name: "shared-skill" },
      ],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members).toHaveLength(1);
    expect(fetchRegistryFolder).toHaveBeenCalledTimes(1);
  });

  it("terminates on a group-to-group pointer cycle without infinite recursion", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "group-b/skill.json") {
        return {
          ok: true,
          content: skillJson("1.0.0", [
            { kind: "pointer", name: "group-a" },
            { kind: "nested", name: "leaf" },
          ]),
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "group-b") {
        return {
          ok: true,
          files: new Map([
            [
              "skill.json",
              skillJson("1.0.0", [
                { kind: "pointer", name: "group-a" },
                { kind: "nested", name: "leaf" },
              ]),
            ],
            ["leaf/SKILL.md", "# leaf"],
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });

    // group-a's own root members point to group-b, which points back to
    // group-a — visitedGroups (seeded with the root name "group-a") must
    // stop the cycle from recursing forever.
    const result = await resolveGroupMembers(
      "token",
      "group-a",
      "1.0.0",
      [{ kind: "pointer", name: "group-b" }],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.members.map((m) => m.name)).toEqual(["leaf"]);
  });

  it("reports not-found when a pointer target doesn't exist in the registry", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: false,
      reason: "not-found",
      detail: '"ghost/skill.json" was not found in the registry',
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "ghost" }],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("not-found");
  });

  it("reports unreachable when the registry can't be reached mid-resolution", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [{ kind: "pointer", name: "flaky" }],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("unreachable");
  });
});

describe("resolveGroupMembers — AF-9 pinned-pointer version conflicts", () => {
  it("resolves a same-MAJOR conflict to the highest pinned version, with a warning naming both", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("1.2.0"),
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_t, name, ref) => ({
        ok: true,
        files: new Map([
          ["skill.json", skillJson("1.5.0")],
          ["SKILL.md", `# ${ref}`],
        ]),
      }),
    );

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared", version: "1.2.0" },
        { kind: "pointer", name: "shared", version: "1.5.0" },
      ],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("1.2.0");
    expect(result.warnings[0]).toContain("1.5.0");
    expect(result.members).toHaveLength(1);
    expect(result.members[0].version).toBe("1.5.0");
    expect(fetchRegistryFolder).toHaveBeenCalledTimes(1);
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "token",
      "shared",
      "shared@1.5.0",
    );
  });

  it("aborts the whole resolution on a cross-MAJOR conflict, naming the skill and both versions", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("1.0.0"),
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared", version: "1.9.0" },
        { kind: "pointer", name: "shared", version: "2.0.0" },
      ],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("major-conflict");
    expect(result.detail).toContain("shared");
    expect(result.detail).toContain("1.9.0");
    expect(result.detail).toContain("2.0.0");
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("does not treat a single pin alongside unpinned requests as a conflict", async () => {
    vi.mocked(fetchRegistryFile).mockResolvedValue({
      ok: true,
      content: skillJson("1.2.0"),
    });
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([
        ["skill.json", skillJson("1.2.0")],
        ["SKILL.md", "# x"],
      ]),
    });

    const result = await resolveGroupMembers(
      "token",
      "my-group",
      "1.0.0",
      [
        { kind: "pointer", name: "shared" },
        { kind: "pointer", name: "shared", version: "1.2.0" },
      ],
      new Map([["skill.json", skillJson("1.0.0")]]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings).toEqual([]);
    expect(result.members[0].version).toBe("1.2.0");
  });
});
