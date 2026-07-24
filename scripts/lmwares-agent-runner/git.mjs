import { execFile } from 'node:child_process';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { AgentRunnerError } from './policy.mjs';

const execFileAsync = promisify(execFile);

export async function prepareAgentWorktree({
  repoPath,
  worktreesRoot,
  projectId,
  batchId,
  taskId,
  baseRef,
  operation,
}) {
  const taskSegment = safeSegment(taskId);
  const worktreePath = path.join(worktreesRoot, safeSegment(projectId), batchId, taskSegment);
  const batchSegment = safeSegment(batchId).slice(-32);
  const branchName =
    operation === 'discover' ? null : `oracle/${batchSegment}/${taskSegment}`.slice(0, 220);

  await mkdir(path.dirname(worktreePath), { recursive: true });
  await assertWorktreesRoot(worktreesRoot, worktreePath);

  const args = branchName
    ? ['worktree', 'add', '-b', branchName, worktreePath, baseRef]
    : ['worktree', 'add', '--detach', worktreePath, baseRef];

  try {
    await runGit(repoPath, args, 60_000);
  } catch (error) {
    throw new AgentRunnerError(
      409,
      'worktree_prepare_failed',
      `No fue posible preparar el worktree de ${taskId}: ${safeGitError(error)}`,
    );
  }

  const baseRevision = await runGit(worktreePath, ['rev-parse', 'HEAD']);
  return { worktreePath, branchName, baseRevision };
}

export async function readAgentGitState(worktreePath, baseRevision) {
  try {
    const [revision, status, changedFiles] = await Promise.all([
      runGit(worktreePath, ['rev-parse', 'HEAD']),
      runGit(worktreePath, ['status', '--porcelain']),
      runGit(worktreePath, ['diff', '--name-only', baseRevision, '--']),
    ]);
    const files = changedFiles
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 100);
    return {
      revision,
      dirty: status.trim().length > 0,
      changedFiles: files,
      changesPresent: revision !== baseRevision || status.trim().length > 0 || files.length > 0,
    };
  } catch {
    return {
      revision: null,
      dirty: null,
      changedFiles: [],
      changesPresent: null,
    };
  }
}

export async function removeAgentWorktree(repoPath, worktreePath) {
  await runGit(repoPath, ['worktree', 'remove', '--force', worktreePath], 60_000);
}

async function assertWorktreesRoot(worktreesRoot, worktreePath) {
  await mkdir(worktreesRoot, { recursive: true });
  const resolvedRoot = await realpath(worktreesRoot);
  const candidate = path.resolve(worktreePath);
  const relative = path.relative(resolvedRoot, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AgentRunnerError(403, 'worktree_path_escape', 'El worktree escapa de su raíz.');
  }
}

async function runGit(cwd, args, timeout = 15_000) {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  });
  return String(result.stdout ?? '').trim();
}

function safeGitError(error) {
  const stderr = error && typeof error === 'object' ? String(error.stderr ?? '') : '';
  const message = stderr || (error instanceof Error ? error.message : 'error Git');
  return message.replace(/[\r\n]+/g, ' ').slice(0, 260);
}

function safeSegment(value) {
  const safe = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return safe || 'task';
}
