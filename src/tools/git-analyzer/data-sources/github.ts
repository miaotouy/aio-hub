import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { FileChange, GitCommit } from "../types";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
export const MAX_PUBLIC_COMMITS = 1000;
const PAGE_SIZE = 100;

export interface GitHubRepository {
  owner: string;
  name: string;
}

export interface GitHubRepositoryInfo {
  fullName: string;
  defaultBranch: string;
  description: string;
  stars: number;
  forks: number;
}

export interface GitHubLoadProgress {
  loaded: number;
  total: number;
}

export interface GitHubRepositoryLoad {
  repository: GitHubRepositoryInfo;
  branch: string;
  commits: GitCommit[];
  truncated: boolean;
}

interface GitHubCommitResponse {
  sha: string;
  author: { login?: string } | null;
  commit: {
    author: { name?: string; email?: string; date?: string } | null;
    message: string;
  };
  parents: Array<{ sha: string }>;
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
}

interface GitHubRepoResponse {
  full_name: string;
  default_branch: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
}

export function parseGitHubRepository(input: string): GitHubRepository {
  const value = input.trim();
  let path: string;

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("GitHub 仓库地址格式无效");
    }
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("当前仅支持 github.com 上的公开仓库");
    }
    path = url.pathname;
  } else {
    path = value;
  }

  const segments = path
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .split("/");
  if (
    segments.length !== 2 ||
    segments.some(
      (segment) =>
        !/^[A-Za-z0-9_.-]+$/.test(segment) ||
        segment === "." ||
        segment === ".."
    )
  ) {
    throw new Error("请输入 owner/repo 或完整 GitHub 仓库地址");
  }

  return { owner: segments[0], name: segments[1] };
}

function repositoryEndpoint(repository: GitHubRepository): string {
  return `${API_BASE}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
}

function hasNextPage(response: Response): boolean {
  return /<[^>]+>\s*;\s*rel="next"/.test(response.headers.get("link") ?? "");
}

async function requestJson<T>(
  url: string,
  signal?: AbortSignal
): Promise<{
  data: T;
  response: Response;
}> {
  signal?.throwIfAborted();
  const response = await tauriFetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
    },
    signal,
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (response.status === 429 || remaining === "0") {
        throw new Error("GitHub 匿名请求额度已用尽，请稍后再试");
      }
    }
    if (response.status === 404) {
      throw new Error("仓库不存在、不可公开访问，或当前分支名称无效");
    }
    throw new Error(`GitHub API 请求失败：HTTP ${response.status}`);
  }

  return { data: (await response.json()) as T, response };
}

function mapCommit(commit: GitHubCommitResponse): GitCommit {
  const message = commit.commit.message;
  return {
    hash: commit.sha,
    author:
      commit.commit.author?.name || commit.author?.login || "Unknown author",
    email: commit.commit.author?.email ?? "",
    date: commit.commit.author?.date ?? "",
    message: message.split("\n", 1)[0],
    full_message: message,
    parents: commit.parents.map((parent) => parent.sha),
  };
}

function mapFileStatus(status: string): string {
  switch (status) {
    case "added":
    case "removed":
    case "modified":
    case "renamed":
      return status === "removed" ? "deleted" : status;
    default:
      return "modified";
  }
}

export async function loadGitHubRepository(
  input: string,
  options: {
    branch?: string;
    limit: number;
    signal?: AbortSignal;
    onProgress?: (progress: GitHubLoadProgress) => void;
  }
): Promise<GitHubRepositoryLoad> {
  const repositoryId = parseGitHubRepository(input);
  const endpoint = repositoryEndpoint(repositoryId);
  const { data: repo } = await requestJson<GitHubRepoResponse>(
    endpoint,
    options.signal
  );
  const branch = options.branch?.trim() || repo.default_branch;
  const requestedLimit =
    Number.isFinite(options.limit) && options.limit > 0
      ? Math.max(1, Math.floor(options.limit))
      : MAX_PUBLIC_COMMITS;
  const limit = Math.min(requestedLimit, MAX_PUBLIC_COMMITS);
  const perPage = Math.min(PAGE_SIZE, limit);
  const commits: GitCommit[] = [];
  let page = 1;
  let truncated = false;
  let nextPageAvailable = false;

  while (commits.length < limit) {
    const url = new URL(`${endpoint}/commits`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sha", branch);

    const { data, response } = await requestJson<GitHubCommitResponse[]>(
      url.toString(),
      options.signal
    );
    const remaining = limit - commits.length;
    commits.push(...data.slice(0, remaining).map(mapCommit));
    if (data.length > remaining) truncated = true;
    nextPageAvailable = hasNextPage(response);
    options.onProgress?.({ loaded: commits.length, total: limit });

    if (data.length < perPage || !nextPageAvailable) break;
    page += 1;
  }

  if (commits.length >= limit && nextPageAvailable) {
    truncated = true;
  }

  return {
    repository: {
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      description: repo.description ?? "",
      stars: repo.stargazers_count,
      forks: repo.forks_count,
    },
    branch,
    commits,
    truncated,
  };
}

export async function getGitHubCommitDetail(
  input: string,
  hash: string,
  signal?: AbortSignal
): Promise<GitCommit> {
  const repository = parseGitHubRepository(input);
  const endpoint = `${repositoryEndpoint(repository)}/commits/${encodeURIComponent(hash)}?per_page=100`;
  const { data, response } = await requestJson<GitHubCommitResponse>(
    endpoint,
    signal
  );
  const files: FileChange[] = (data.files ?? []).map((file) => ({
    path: file.filename,
    status: mapFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
  }));

  return {
    ...mapCommit(data),
    stats: data.stats
      ? {
          additions: data.stats.additions,
          deletions: data.stats.deletions,
          files: files.length,
        }
      : undefined,
    files,
    filesComplete: !hasNextPage(response),
  };
}
