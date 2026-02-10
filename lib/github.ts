import { Octokit } from "@octokit/rest";
import { DiffLine } from "./types";

function getOctokit(token?: string) {
  return new Octokit({
    auth: token || process.env.GITHUB_TOKEN,
  });
}

export interface GitHubIssueRaw {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name?: string; color?: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export async function listIssues(
  owner: string,
  repo: string,
  githubToken?: string,
): Promise<GitHubIssueRaw[]> {
  const octokit = getOctokit(githubToken);
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });

  // Filter out pull requests (GitHub API includes PRs in issues)
  return data
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      labels: issue.labels
        .map((l) =>
          typeof l === "string"
            ? { name: l, color: "888888" }
            : { name: l.name || "", color: l.color || "888888" }
        )
        .filter((l) => l.name),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url,
    }));
}

export async function getIssue(
  owner: string,
  repo: string,
  number: number,
  githubToken?: string,
): Promise<GitHubIssueRaw> {
  const octokit = getOctokit(githubToken);
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: number });
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    labels: issue.labels
      .map((l) =>
        typeof l === "string"
          ? { name: l, color: "888888" }
          : { name: l.name || "", color: l.color || "888888" }
      )
      .filter((l) => l.name),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    html_url: issue.html_url,
  };
}

export async function getLatestCommit(
  owner: string,
  repo: string,
  githubToken?: string,
): Promise<{ sha: string; date: string }> {
  const octokit = getOctokit(githubToken);
  const { data } = await octokit.repos.listCommits({
    owner,
    repo,
    per_page: 1,
  });
  return {
    sha: data[0].sha,
    date: data[0].commit.committer?.date || data[0].commit.author?.date || new Date().toISOString(),
  };
}

export async function getFileInfo(
  owner: string,
  repo: string,
  path: string,
  githubToken?: string,
): Promise<{ path: string; lines: number | null }> {
  const octokit = getOctokit(githubToken);
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    if ("content" in data && data.content) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      const lines = decoded.split("\n").length;
      return { path, lines };
    }

    return { path, lines: null };
  } catch {
    return { path, lines: null };
  }
}

export interface PRDetailsRaw {
  number: number;
  title: string;
  head: { ref: string };
  html_url: string;
  changed_files: number;
}

export interface PRFileRaw {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
  patch?: string;
}

export async function getPRDetails(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken?: string,
): Promise<{ pr: PRDetailsRaw; files: PRFileRaw[] }> {
  const octokit = getOctokit(githubToken);

  const [{ data: pr }, { data: files }] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listFiles({ owner, repo, pull_number: prNumber }),
  ]);

  return {
    pr: {
      number: pr.number,
      title: pr.title,
      head: { ref: pr.head.ref },
      html_url: pr.html_url,
      changed_files: pr.changed_files,
    },
    files: files.map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
      patch: f.patch,
    })),
  };
}

export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
  html_url: string;
}

export async function createIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  githubToken?: string,
): Promise<GitHubComment> {
  const octokit = getOctokit(githubToken);
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return {
    id: data.id,
    body: data.body ?? "",
    user: data.user ? { login: data.user.login } : null,
    created_at: data.created_at,
    html_url: data.html_url,
  };
}

export async function listIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  since?: string,
  githubToken?: string,
): Promise<GitHubComment[]> {
  const octokit = getOctokit(githubToken);
  const params: Parameters<typeof octokit.issues.listComments>[0] = {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 50,
    sort: "created",
    direction: "asc",
  };
  if (since) {
    params.since = since;
  }
  const { data } = await octokit.issues.listComments(params);
  return data.map((c) => ({
    id: c.id,
    body: c.body ?? "",
    user: c.user ? { login: c.user.login } : null,
    created_at: c.created_at,
    html_url: c.html_url,
  }));
}

export function parsePatch(patch: string): DiffLine[] {
  return patch
    .split("\n")
    .filter((line) => !line.startsWith("@@") && !line.startsWith("diff ") && !line.startsWith("index "))
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return { type: "add" as const, content: line };
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        return { type: "remove" as const, content: line };
      }
      return { type: "context" as const, content: line };
    });
}
