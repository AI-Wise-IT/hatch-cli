import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchRegistryFolder } from "./fetch.js";

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
});
