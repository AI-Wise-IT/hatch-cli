import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { validateGitHubToken } from "./github-token.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("validateGitHubToken", () => {
  it("treats a 200 from GitHub's /user endpoint as a valid token", async () => {
    server.use(
      http.get("https://api.github.com/user", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer good-token");
        return HttpResponse.json({ login: "octocat" });
      }),
    );

    const result = await validateGitHubToken("good-token");
    expect(result).toEqual({ valid: true });
  });

  it("treats a 401 from GitHub as an invalid token", async () => {
    server.use(
      http.get(
        "https://api.github.com/user",
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    const result = await validateGitHubToken("bad-token");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid or expired/);
  });

  it("surfaces network failures as an invalid result rather than throwing", async () => {
    server.use(
      http.get("https://api.github.com/user", () => HttpResponse.error()),
    );

    const result = await validateGitHubToken("any-token");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/could not reach GitHub/);
  });
});
