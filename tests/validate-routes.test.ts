import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/devin/validate", () => {
  async function callDevinValidate(headers: Record<string, string> = {}) {
    const { GET } = await import("@/app/api/devin/validate/route");
    const req = new Request("http://localhost/api/devin/validate", {
      headers,
    });
    return GET(req as never);
  }

  it("returns 400 when x-devin-api-key header is missing", async () => {
    const res = await callDevinValidate();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid: true when Devin API responds 200", async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 });
    const res = await callDevinValidate({ "x-devin-api-key": "apk_user_test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sessions?limit=1"),
      expect.objectContaining({
        headers: { Authorization: "Bearer apk_user_test" },
      }),
    );
  });

  it("returns valid: false when Devin API responds 401", async () => {
    fetchMock.mockResolvedValueOnce({ status: 401 });
    const res = await callDevinValidate({ "x-devin-api-key": "bad_key" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns 502 when fetch throws (network error)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const res = await callDevinValidate({ "x-devin-api-key": "apk_user_test" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Unable to reach Devin API");
  });
});

describe("GET /api/github/validate", () => {
  async function callGithubValidate(headers: Record<string, string> = {}) {
    const { GET } = await import("@/app/api/github/validate/route");
    const req = new Request("http://localhost/api/github/validate", {
      headers,
    });
    return GET(req as never);
  }

  it("returns 400 when x-github-token header is missing", async () => {
    const res = await callGithubValidate();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid: true when GitHub API responds 200", async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 });
    const res = await callGithubValidate({ "x-github-token": "ghp_test123" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test123",
        }),
      }),
    );
  });

  it("returns valid: false when GitHub API responds 401", async () => {
    fetchMock.mockResolvedValueOnce({ status: 401 });
    const res = await callGithubValidate({ "x-github-token": "bad_token" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns 502 when fetch throws (network error)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const res = await callGithubValidate({ "x-github-token": "ghp_test123" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Unable to reach GitHub API");
  });
});
