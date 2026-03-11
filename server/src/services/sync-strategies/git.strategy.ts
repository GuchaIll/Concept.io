/**
 * git.strategy.ts — Sync strategy that pushes exported layers to a Git repo.
 *
 * Supports GitHub (via Octokit REST) and GitLab (via @gitbeaker/rest).
 * Falls back to a lightweight HTTP-based approach if the libraries are
 * not installed — the controller should catch the import error and
 * report it gracefully.
 *
 * Commits a tree of blobs in a single commit (no working directory needed).
 */

import type { ExportResult } from '../export.service';
import type { ISyncTarget, GitSyncConfig } from '../../../../common/sync.interface';
import { decrypt } from '../crypto.service';

export interface GitSyncResult {
  success: boolean;
  commitSha?: string;
  filesCommitted: string[];
  error?: string;
}

// ── Public entry ───────────────────────────────────────────

export async function syncToGit(
  target: ISyncTarget,
  exportResult: ExportResult,
): Promise<GitSyncResult> {
  const config = target.config as GitSyncConfig;

  if (!config.repoUrl || !config.encryptedToken) {
    return { success: false, filesCommitted: [], error: 'Missing repoUrl or token' };
  }

  const token = decrypt(config.encryptedToken);

  try {
    if (config.provider === 'github') {
      return await pushToGitHub(config, token, exportResult);
    } else if (config.provider === 'gitlab') {
      return await pushToGitLab(config, token, exportResult);
    }
    return { success: false, filesCommitted: [], error: `Unsupported git provider: ${config.provider}` };
  } catch (err: any) {
    return { success: false, filesCommitted: [], error: err.message ?? String(err) };
  }
}

// ── GitHub via Octokit ─────────────────────────────────────

async function pushToGitHub(
  config: GitSyncConfig,
  token: string,
  exportResult: ExportResult,
): Promise<GitSyncResult> {
  // Dynamic import — fails gracefully if not installed
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: token });

  const { owner, repo } = parseGitHubUrl(config.repoUrl);
  const branch = config.branch || 'main';
  const basePath = normalizeRepoPath(config.path);

  // 1. Get latest commit SHA on branch
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const latestCommitSha = refData.object.sha;

  // 2. Get the base tree
  const { data: commitData } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  });
  const baseTreeSha = commitData.tree.sha;

  // 3. Create blobs for each file
  const treeItems: Array<{
    path: string;
    mode: '100644';
    type: 'blob';
    sha: string;
  }> = [];

  // Per-layer PNGs
  for (const layer of exportResult.layers) {
    const filePath = `${basePath}/layers/${sanitize(layer.name)}.png`;
    const blob = await octokit.git.createBlob({
      owner,
      repo,
      content: layer.png.toString('base64'),
      encoding: 'base64',
    });
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.data.sha });
  }

  // Composite
  if (exportResult.composite) {
    const blob = await octokit.git.createBlob({
      owner,
      repo,
      content: exportResult.composite.toString('base64'),
      encoding: 'base64',
    });
    treeItems.push({ path: `${basePath}/composite.png`, mode: '100644', type: 'blob', sha: blob.data.sha });
  }

  // Metadata
  const metaBlob = await octokit.git.createBlob({
    owner,
    repo,
    content: Buffer.from(JSON.stringify(exportResult.metadata, null, 2)).toString('base64'),
    encoding: 'base64',
  });
  treeItems.push({ path: `${basePath}/metadata.json`, mode: '100644', type: 'blob', sha: metaBlob.data.sha });

  // 4. Create tree
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 5. Create commit
  const message = `[Concept.io] Sync snapshot "${exportResult.snapshotName}" — ${exportResult.layers.length} layer(s)`;
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [latestCommitSha],
  });

  // 6. Update branch ref
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  return {
    success: true,
    commitSha: newCommit.sha,
    filesCommitted: treeItems.map((t) => t.path),
  };
}

// ── GitLab via REST API ────────────────────────────────────

async function pushToGitLab(
  config: GitSyncConfig,
  token: string,
  exportResult: ExportResult,
): Promise<GitSyncResult> {
  // Use native fetch — no external dependency needed
  const { host, projectPath } = parseGitLabUrl(config.repoUrl);
  const branch = config.branch || 'main';
  const basePath = normalizeRepoPath(config.path);
  const apiBase = `https://${host}/api/v4`;
  const encodedProject = encodeURIComponent(projectPath);

  const headers: Record<string, string> = {
    'PRIVATE-TOKEN': token,
    'Content-Type': 'application/json',
  };

  // GitLab Commits API allows multi-file commits in a single request
  const actions: Array<{
    action: string;
    file_path: string;
    content: string;
    encoding: string;
  }> = [];

  // Per-layer PNGs
  for (const layer of exportResult.layers) {
    actions.push({
      action: 'create',
      file_path: `${basePath}/layers/${sanitize(layer.name)}.png`,
      content: layer.png.toString('base64'),
      encoding: 'base64',
    });
  }

  // Composite
  if (exportResult.composite) {
    actions.push({
      action: 'create',
      file_path: `${basePath}/composite.png`,
      content: exportResult.composite.toString('base64'),
      encoding: 'base64',
    });
  }

  // Metadata
  actions.push({
    action: 'create',
    file_path: `${basePath}/metadata.json`,
    content: Buffer.from(JSON.stringify(exportResult.metadata, null, 2)).toString('base64'),
    encoding: 'base64',
  });

  // Check if files exist — if so, use 'update' action instead of 'create'
  for (const action of actions) {
    const checkUrl = `${apiBase}/projects/${encodedProject}/repository/files/${encodeURIComponent(action.file_path)}?ref=${branch}`;
    const checkRes = await fetch(checkUrl, { headers: { 'PRIVATE-TOKEN': token } });
    if (checkRes.ok) {
      action.action = 'update';
    }
  }

  const commitMessage = `[Concept.io] Sync snapshot "${exportResult.snapshotName}" — ${exportResult.layers.length} layer(s)`;

  const response = await fetch(`${apiBase}/projects/${encodedProject}/repository/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      branch,
      commit_message: commitMessage,
      actions,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitLab API ${response.status}: ${body}`);
  }

  const data = await response.json() as { id?: string };

  return {
    success: true,
    commitSha: data.id,
    filesCommitted: actions.map((a) => a.file_path),
  };
}

// ── Helpers ────────────────────────────────────────────────

function parseGitHubUrl(url: string): { owner: string; repo: string } {
  // Supports: https://github.com/owner/repo(.git)
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

function parseGitLabUrl(url: string): { host: string; projectPath: string } {
  // Supports: https://gitlab.com/group/subgroup/repo(.git)
  const u = new URL(url.replace(/\.git$/, ''));
  return { host: u.host, projectPath: u.pathname.replace(/^\//, '') };
}

function normalizeRepoPath(p?: string): string {
  if (!p) return 'concept-io';
  return p.replace(/^\/+|\/+$/g, '') || 'concept-io';
}

function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 128);
}
