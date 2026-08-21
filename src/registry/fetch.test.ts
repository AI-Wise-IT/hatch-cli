import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  fetchRegistryFile,
  fetchRegistryFolder,
  listRegistryRoot,
  registryFolderExists,
} from "./fetch.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = "https://api.github.com/repos/AI-Wise-IT/hatch-skills/contents";

function b64(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

function fileResponse(path: string, content: string) {
  return HttpResponse.json({
    name: path.split("/").pop(),
    path,
    type: "file",
    content: b64(content),
    encoding: "base64",
  });
}

describe("fetchRegistryFolder", () => {
  it("fetches every file in a flat folder, authenticated with the given token", async () => {
    server.use(
      http.get(`${BASE}/hatch-usage`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer good-token");
        return HttpResponse.json([
          { name: "SKILL.md", path: "hatch-usage/SKILL.md", type: "file" },
          { name: "skill.json", path: "hatch-usage/skill.json", type: "file" },
        ]);
      }),
      http.get(`${BASE}/hatch-usage/SKILL.md`, () =>
        fileResponse("hatch-usage/SKILL.md", "# hi"),
      ),
      http.get(`${BASE}/hatch-usage/skill.json`, () =>
        fileResponse("hatch-usage/skill.json", '{"version":"1.0.0"}'),
      ),
    );

    const result = await fetchRegistryFolder("good-token", "hatch-usage");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.files.get("SKILL.md")).toBe("# hi");
    expect(result.files.get("skill.json")).toBe('{"version":"1.0.0"}');
  });

  it("recurses into subdirectories, keying files by their path relative to the fetched folder", async () => {
    server.use(
      http.get(`${BASE}/g`, () =>
        HttpResponse.json([{ name: "sub", path: "g/sub", type: "dir" }]),
      ),
      http.get(`${BASE}/g/sub`, () =>
        HttpResponse.json([{ name: "a.md", path: "g/sub/a.md", type: "file" }]),
      ),
      http.get(`${BASE}/g/sub/a.md`, () =>
        fileResponse("g/sub/a.md", "nested"),
      ),
    );

    const result = await fetchRegistryFolder("good-token", "g");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.files.get("sub/a.md")).toBe("nested");
  });

  it("reports not-found for a folder that doesn't exist in the registry", async () => {
    server.use(
      http.get(
        `${BASE}/missing`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const result = await fetchRegistryFolder("good-token", "missing");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("not-found");
  });

  it("reports unreachable on a network failure", async () => {
    server.use(http.get(`${BASE}/hatch-usage`, () => HttpResponse.error()));

    const result = await fetchRegistryFolder("good-token", "hatch-usage");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
  });

  it("reports unreachable on an unexpected non-200/404 status", async () => {
    server.use(
      http.get(
        `${BASE}/hatch-usage`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const result = await fetchRegistryFolder("good-token", "hatch-usage");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
  });

  it("resolves a pinned ref via ?ref=<name>@<version> (0009-skill-versioning-semver-tags)", async () => {
    server.use(
      http.get(`${BASE}/hatch-usage`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("ref")).toBe("hatch-usage@1.2.0");
        return HttpResponse.json([
          { name: "SKILL.md", path: "hatch-usage/SKILL.md", type: "file" },
        ]);
      }),
      http.get(`${BASE}/hatch-usage/SKILL.md`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("ref")).toBe("hatch-usage@1.2.0");
        return fileResponse("hatch-usage/SKILL.md", "# pinned");
      }),
    );

    const result = await fetchRegistryFolder(
      "good-token",
      "hatch-usage",
      "hatch-usage@1.2.0",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.files.get("SKILL.md")).toBe("# pinned");
  });
});

describe("fetchRegistryFile", () => {
  it("fetches a single file's content", async () => {
    server.use(
      http.get(`${BASE}/my-group/skill.json`, () =>
        fileResponse("my-group/skill.json", '{"version":"1.0.0"}'),
      ),
    );

    const result = await fetchRegistryFile("good-token", "my-group/skill.json");
    expect(result).toEqual({ ok: true, content: '{"version":"1.0.0"}' });
  });

  it("reports not-found for a file that doesn't exist", async () => {
    server.use(
      http.get(
        `${BASE}/missing/skill.json`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const result = await fetchRegistryFile("good-token", "missing/skill.json");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("not-found");
  });

  it("reports unreachable on a network failure", async () => {
    server.use(
      http.get(`${BASE}/my-group/skill.json`, () => HttpResponse.error()),
    );

    const result = await fetchRegistryFile("good-token", "my-group/skill.json");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
  });

  it("passes a pinned ref through as ?ref=", async () => {
    server.use(
      http.get(`${BASE}/foo/skill.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("ref")).toBe("foo@2.0.0");
        return fileResponse("foo/skill.json", '{"version":"2.0.0"}');
      }),
    );

    const result = await fetchRegistryFile(
      "good-token",
      "foo/skill.json",
      "foo@2.0.0",
    );
    expect(result).toEqual({ ok: true, content: '{"version":"2.0.0"}' });
  });
});

describe("listRegistryRoot", () => {
  const ROOT = `${BASE}/`;

  it("returns every top-level entry's name and type from one non-recursive call, authenticated with the given token", async () => {
    let callCount = 0;
    server.use(
      http.get(ROOT, ({ request }) => {
        callCount++;
        expect(request.headers.get("authorization")).toBe("Bearer good-token");
        return HttpResponse.json([
          { name: "prd-elicitation", path: "prd-elicitation", type: "dir" },
          { name: "my-group", path: "my-group", type: "dir" },
          { name: "README.md", path: "README.md", type: "file" },
        ]);
      }),
    );

    const result = await listRegistryRoot("good-token");

    expect(result).toEqual({
      ok: true,
      entries: [
        { name: "prd-elicitation", type: "dir" },
        { name: "my-group", type: "dir" },
        { name: "README.md", type: "file" },
      ],
    });
    expect(callCount).toBe(1);
  });

  it("returns an empty entry list for an empty root rather than a failure", async () => {
    server.use(http.get(ROOT, () => HttpResponse.json([])));

    const result = await listRegistryRoot("good-token");

    expect(result).toEqual({ ok: true, entries: [] });
  });

  it("reports unreachable on a network failure", async () => {
    server.use(http.get(ROOT, () => HttpResponse.error()));

    const result = await listRegistryRoot("good-token");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
    expect(result.detail).toContain("could not reach the registry");
  });

  it("reports unreachable on an unexpected non-200/404 status", async () => {
    server.use(http.get(ROOT, () => new HttpResponse(null, { status: 500 })));

    const result = await listRegistryRoot("good-token");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
    expect(result.detail).toContain("500");
  });

  it("surfaces a root 404 as its own no-registry-access reason, never the shared not-found a named folder's 404 carries", async () => {
    server.use(http.get(ROOT, () => new HttpResponse(null, { status: 404 })));

    const result = await listRegistryRoot("good-token");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("no-registry-access");
    expect(result.reason).not.toBe("not-found");
    // The root exists for anyone who can see the repository, so the only
    // reading is a credential without access — never a missing name.
    expect(result.detail).toBe(
      "the registry root could not be read with these credentials",
    );
    expect(result.detail).not.toContain("not found");
  });
});

describe("registryFolderExists", () => {
  it("reports true with a single, non-recursive call when the folder exists", async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/hatch-usage-cld`, () => {
        callCount++;
        return HttpResponse.json([
          { name: "SKILL.md", path: "hatch-usage-cld/SKILL.md", type: "file" },
        ]);
      }),
    );

    const result = await registryFolderExists("good-token", "hatch-usage-cld");
    expect(result).toEqual({ ok: true, exists: true });
    expect(callCount).toBe(1);
  });

  it("reports false when the folder doesn't exist", async () => {
    server.use(
      http.get(
        `${BASE}/hatch-usage-cld`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const result = await registryFolderExists("good-token", "hatch-usage-cld");
    expect(result).toEqual({ ok: true, exists: false });
  });

  it("reports unreachable on a network failure", async () => {
    server.use(http.get(`${BASE}/hatch-usage-cld`, () => HttpResponse.error()));

    const result = await registryFolderExists("good-token", "hatch-usage-cld");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
  });

  it("reports unreachable on an unexpected non-200/404 status", async () => {
    server.use(
      http.get(
        `${BASE}/hatch-usage-cld`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const result = await registryFolderExists("good-token", "hatch-usage-cld");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.reason).toBe("unreachable");
  });
});
