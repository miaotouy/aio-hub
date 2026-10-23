import { beforeEach, describe, expect, it, vi } from "vitest";
const { http } = vi.hoisted(() => ({ http: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: http }));
import {
  getGitHubCommitDetail,
  loadGitHubRepository,
  parseGitHubRepository,
} from "../github";

describe("parseGitHubRepository", () => {
  it("accepts repository slugs and GitHub repository URLs", () => {
    expect(parseGitHubRepository("vuejs/core")).toEqual({
      owner: "vuejs",
      name: "core",
    });
    expect(parseGitHubRepository("https://github.com/vuejs/core.git/")).toEqual(
      {
        owner: "vuejs",
        name: "core",
      }
    );
  });

  it("rejects non-GitHub hosts and non-repository paths", () => {
    expect(() =>
      parseGitHubRepository("https://example.com/vuejs/core")
    ).toThrow("仅支持 github.com");
    expect(() => parseGitHubRepository("vuejs")).toThrow("owner/repo");
    expect(() => parseGitHubRepository("vuejs/core/tree/main")).toThrow(
      "owner/repo"
    );
  });
});

const repo = {
  full_name: "owner/repo",
  default_branch: "trunk",
  description: null,
  stargazers_count: 1,
  forks_count: 0,
};
function commit(index: number) {
  return {
    sha: String(index),
    author: null,
    commit: {
      author: { name: "Tester", email: "", date: "2026-01-01T00:00:00Z" },
      message: "fix: issue",
    },
    parents: [],
  };
}
function json(data: unknown, next = false) {
  return new Response(JSON.stringify(data), {
    headers: next
      ? {
          link: '<https://api.github.com/repos/owner/repo/commits?page=2>; rel="next"',
        }
      : {},
  });
}
beforeEach(() => http.mockReset());
describe("public GitHub reading", () => {
  it("caps unlimited loads at 1000 commits and uses the default branch", async () => {
    http.mockResolvedValueOnce(json(repo));
    for (let page = 0; page < 10; page++)
      http.mockResolvedValueOnce(
        json(
          Array.from({ length: 100 }, (_, i) => commit(page * 100 + i)),
          true
        )
      );
    const result = await loadGitHubRepository("owner/repo", { limit: 0 });
    expect(result.commits).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(http).toHaveBeenCalledTimes(11);
    expect(new URL(http.mock.calls[1][0]).searchParams.get("sha")).toBe(
      "trunk"
    );
  });
  it("keeps pagination offsets stable when the requested count has a partial final page", async () => {
    http
      .mockResolvedValueOnce(json(repo))
      .mockResolvedValueOnce(
        json(
          Array.from({ length: 100 }, (_, i) => commit(i)),
          true
        )
      )
      .mockResolvedValueOnce(
        json(Array.from({ length: 100 }, (_, i) => commit(i + 100)))
      );
    const result = await loadGitHubRepository("owner/repo", {
      limit: 150,
      branch: "feature/a",
    });
    expect(result.commits.map((c) => c.hash)).toEqual(
      Array.from({ length: 150 }, (_, i) => String(i))
    );
    expect(result.truncated).toBe(true);
    expect(new URL(http.mock.calls[2][0]).searchParams.get("per_page")).toBe(
      "100"
    );
    expect(new URL(http.mock.calls[2][0]).searchParams.get("sha")).toBe(
      "feature/a"
    );
  });
  it("surfaces anonymous rate-limit exhaustion without retrying", async () => {
    http.mockResolvedValueOnce(
      new Response("{}", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      })
    );
    await expect(
      loadGitHubRepository("owner/repo", { limit: 100 })
    ).rejects.toThrow("额度已用尽");
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("marks paginated file lists partial while preserving commit totals", async () => {
    http.mockResolvedValueOnce(
      json(
        {
          ...commit(1),
          stats: { additions: 300, deletions: 50 },
          files: [
            {
              filename: "old.ts",
              status: "removed",
              additions: 0,
              deletions: 20,
            },
          ],
        },
        true
      )
    );
    const detail = await getGitHubCommitDetail("owner/repo", "1");
    expect(detail.filesComplete).toBe(false);
    expect(detail.files?.[0].status).toBe("deleted");
    expect(detail.stats?.additions).toBe(300);
    expect(http).toHaveBeenCalledTimes(1);
  });
});
