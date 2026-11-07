import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertSafePath,
  createProjectItem,
  deleteProjectItem,
  isSensitiveFile,
  readProjectFile,
  readProjectFileForAgent,
  renameProjectItem,
  runCommand,
  searchFiles,
  walk,
  writeProjectFile
} from './security';
import { getSetting } from './settings';
import { gitCommit, gitPush, gitSummary } from './git';
import { startStaticServer } from './preview';
import { streamChat, type ChatMessage, type ChatToolCall, type Usage } from './providers';

export type ApprovalKind = 'write' | 'delete' | 'command' | 'git' | 'network';

export type ApprovalAction = {
  title: string;
  detail: string;
  kind: ApprovalKind;
  path?: string;
  before?: string | null;
  after?: string | null;
  meta?: string;
};

export type AgentEvent =
  | { type: 'step'; step: number; maxSteps: number }
  | { type: 'tool_start'; id: string; name: string; label: string; detail?: string }
  | { type: 'tool_end'; id: string; name: string; status: 'ok' | 'error' | 'denied'; summary: string; durationMs: number }
  | { type: 'usage'; usage: Usage }
  | { type: 'notice'; message: string };

type ApprovalHandler = (action: ApprovalAction) => Promise<boolean>;
let approvalHandler: ApprovalHandler = async () => false;

export function setApprovalHandler(handler: ApprovalHandler) {
  approvalHandler = handler;
}

const TOOL_LABELS: Record<string, string> = {
  list_files: 'Listing project files',
  read_file: 'Reading file',
  search_files: 'Searching project',
  write_file: 'Writing file',
  edit_file: 'Editing file',
  delete_file: 'Deleting file',
  rename_file: 'Renaming file',
  create_directory: 'Creating folder',
  run_command: 'Running command',
  git_status: 'Checking Git status',
  git_commit: 'Creating commit',
  git_push: 'Pushing to remote',
  open_preview: 'Preparing preview'
};

export const toolSpecs = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and folders in the opened project. Paths are relative to the project root.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file inside the opened project. Secret files such as .env are blocked.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Project-relative file path' } },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search text across project files. Use this to locate symbols, strings or configuration before editing.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Case-insensitive text to find' },
          limit: { type: 'number', description: 'Maximum matches (default 60, max 200)' }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or completely replace a project file. Always include the full intended file content. Requires approval.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project-relative file path' },
          content: { type: 'string', description: 'Complete new file content' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact text snippet in an existing project file. Preferred for small, surgical changes. Requires approval.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          find: { type: 'string', description: 'Exact text to replace (include enough context to be unique)' },
          replace: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' }
        },
        required: ['path', 'find', 'replace'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file inside the project. Destructive and requires approval.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a project file/folder. Requires approval.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        required: ['from', 'to'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a folder inside the project. Requires approval.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a PowerShell command in the project directory. Requires explicit approval. Prefer safe, project-specific build/test commands.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get the current Git branch, remotes and changed files.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage all changes and create a commit. Requires approval. Secret files are blocked.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push the current committed branch to its configured remote. Requires approval.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_preview',
      description: 'Start the local static preview server for this project and return its URL.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  }
] as const;

type ToolResult = { text: string; status: 'ok' | 'error' | 'denied' };

type UndoEntry = { root: string; path: string; before: string | null; after: string | null; label: string };
const undoStack: UndoEntry[] = [];

export async function undoLastAiChange(root: string) {
  const index = [...undoStack].reverse().findIndex(entry => entry.root === root);
  if (index < 0) throw new Error('There is no AI file edit to undo for this project.');
  const realIndex = undoStack.length - 1 - index;
  const entry = undoStack[realIndex];
  const target = await assertSafePath(root, entry.path);
  if (entry.after === null && entry.before !== null) {
    await writeProjectFile(root, entry.path, entry.before);
  } else if (entry.before === null) {
    await fs.unlink(target).catch(() => undefined);
    const directory = path.dirname(target);
    if (directory !== path.resolve(root)) await fs.rmdir(directory).catch(() => undefined);
  } else {
    await writeProjectFile(root, entry.path, entry.before);
  }
  undoStack.splice(realIndex, 1);
  return `Undid: ${entry.label} (${entry.path}).`;
}

function truncate(value: string, max = 120_000) {
  return value.length > max ? value.slice(0, max) + '\n… (truncated)' : value;
}

function approvalMode() {
  const mode = getSetting('approvalMode', 'ask');
  return mode === 'edits' || mode === 'readonly' ? mode : 'ask';
}

function assertWritable() {
  if (approvalMode() === 'readonly') {
    throw new Error('The agent is in read-only mode. The user must change the approval mode in Settings before files can be changed.');
  }
}

async function requestApproval(action: ApprovalAction) {
  const mode = approvalMode();
  if (action.kind === 'write' && mode === 'edits') return true;
  return approvalHandler(action);
}

function describeArgs(name: string, args: Record<string, unknown>) {
  if (name === 'run_command') return String(args.command || '');
  if (name === 'search_files') return String(args.query || '');
  if (name === 'rename_file') return `${String(args.from || '')} → ${String(args.to || '')}`;
  if (name === 'git_commit') return String(args.message || '');
  return String(args.path || args.from || '');
}

async function executeTool(root: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (name === 'list_files') {
    const files = await walk(root);
    return { text: JSON.stringify(files), status: 'ok' };
  }

  if (name === 'read_file') {
    const relative = String(args.path || '');
    const content = await readProjectFileForAgent(root, relative);
    return { text: content.slice(0, 90_000), status: 'ok' };
  }

  if (name === 'search_files') {
    const query = String(args.query || '');
    const limit = Math.min(200, Math.max(1, Number(args.limit) || 60));
    const matches = await searchFiles(root, query, limit);
    return { text: JSON.stringify(matches), status: 'ok' };
  }

  if (name === 'write_file') {
    assertWritable();
    const relative = String(args.path || '');
    const content = String(args.content ?? '');
    if (!relative.trim()) throw new Error('A file path is required.');
    if (isSensitiveFile(relative)) throw new Error('Writing secret or credential files is blocked (' + relative + ').');
    if (content.length > 2_000_000) throw new Error('File content exceeds the 2 MB limit.');
    let before: string | null = null;
    try {
      before = await readProjectFile(root, relative);
    } catch {
      before = null;
    }
    const approved = await requestApproval({
      title: before === null ? 'Create ' + relative + '?' : 'Edit ' + relative + '?',
      detail: relative,
      kind: 'write',
      path: relative,
      before,
      after: content
    });
    if (!approved) return { text: 'DENIED by user. Do not retry the same change without revising the plan.', status: 'denied' };
    await writeProjectFile(root, relative, content);
    undoStack.push({ root, path: relative, before, after: content, label: before === null ? 'create file' : 'edit file' });
    if (undoStack.length > 50) undoStack.shift();
    return { text: 'Saved ' + relative, status: 'ok' };
  }

  if (name === 'edit_file') {
    assertWritable();
    const relative = String(args.path || '');
    if (isSensitiveFile(relative)) throw new Error('Editing secret or credential files is blocked (' + relative + ').');
    const find = String(args.find ?? '');
    const replace = String(args.replace ?? '');
    if (!find) throw new Error('The find text is required.');
    const before = await readProjectFile(root, relative);
    const occurrences = before.split(find).length - 1;
    if (occurrences === 0) throw new Error('The find text was not found in ' + relative + '. Re-read the file and use the exact current content.');
    const replaceAll = args.replace_all === true;
    const after = replaceAll ? before.split(find).join(replace) : before.replace(find, replace);
    const approved = await requestApproval({
      title: 'Edit ' + relative + '?',
      detail: relative + ' — ' + (replaceAll ? occurrences : 1) + ' replacement(s)',
      kind: 'write',
      path: relative,
      before,
      after
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    await writeProjectFile(root, relative, after);
    undoStack.push({ root, path: relative, before, after, label: 'edit file' });
    if (undoStack.length > 50) undoStack.shift();
    return { text: `Updated ${relative} (${replaceAll ? occurrences : 1} replacement(s)).`, status: 'ok' };
  }

  if (name === 'delete_file') {
    assertWritable();
    const relative = String(args.path || '');
    if (isSensitiveFile(relative)) throw new Error('Deleting secret or credential files is blocked.');
    const before = await readProjectFile(root, relative).catch(() => null);
    const approved = await requestApproval({
      title: 'Delete ' + relative + '?',
      detail: relative,
      kind: 'delete',
      path: relative,
      before
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    await deleteProjectItem(root, relative);
    if (before !== null) {
      undoStack.push({ root, path: relative, before, after: null, label: 'delete file' });
      if (undoStack.length > 50) undoStack.shift();
    }
    return { text: 'Deleted ' + relative, status: 'ok' };
  }

  if (name === 'rename_file') {
    assertWritable();
    const from = String(args.from || '');
    const to = String(args.to || '');
    const approved = await requestApproval({
      title: 'Move project item?',
      detail: from + ' → ' + to,
      kind: 'write'
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    await renameProjectItem(root, from, to);
    return { text: `Moved ${from} to ${to}.`, status: 'ok' };
  }

  if (name === 'create_directory') {
    assertWritable();
    const relative = String(args.path || '');
    const approved = await requestApproval({
      title: 'Create folder ' + relative + '?',
      detail: relative,
      kind: 'write',
      path: relative
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    await createProjectItem(root, relative, 'directory');
    return { text: 'Created folder ' + relative + '.', status: 'ok' };
  }

  if (name === 'run_command') {
    assertWritable();
    const command = String(args.command || '').trim();
    if (!command) throw new Error('Command is empty.');
    const approved = await requestApproval({
      title: 'Run this command?',
      detail: command,
      kind: 'command',
      meta: command
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    const result = await runCommand(root, command, undefined, 180_000).promise;
    return {
      text: JSON.stringify({ exitCode: result.code, timedOut: result.timedOut, output: result.output.slice(-40_000) }),
      status: result.code === 0 ? 'ok' : 'error'
    };
  }

  if (name === 'git_status') {
    return { text: JSON.stringify(await gitSummary(root)), status: 'ok' };
  }

  if (name === 'git_commit') {
    assertWritable();
    const status = await gitSummary(root);
    if (status.files.length) {
      const sensitive = status.files.map(file => file.path).filter(isSensitiveFile);
      if (sensitive.length) throw new Error('Commit blocked because secret-like files changed: ' + sensitive.join(', '));
    }
    const message = String(args.message || 'Changes from DARKI Code Studio');
    const approved = await requestApproval({
      title: 'Create Git commit?',
      detail: message,
      kind: 'git',
      meta: status.files.map(file => file.path).join('\n')
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    const result = await gitCommit(root, message);
    return { text: JSON.stringify(result), status: 'ok' };
  }

  if (name === 'git_push') {
    assertWritable();
    const approved = await requestApproval({
      title: 'Push to the Git remote?',
      detail: 'Publish the current committed branch to its configured remote.',
      kind: 'git'
    });
    if (!approved) return { text: 'DENIED by user.', status: 'denied' };
    const message = await gitPush(root);
    return { text: message, status: 'ok' };
  }

  if (name === 'open_preview') {
    const url = await startStaticServer(root);
    let hasDev = false;
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      };
      hasDev = Boolean(pkg.scripts?.dev || pkg.scripts?.start);
    } catch {
      // Static project.
    }
    return {
      text: `Static preview: ${url}${hasDev ? '\nThis project has a dev script. The user can start it from the Preview panel.' : ''}`,
      status: 'ok'
    };
  }

  throw new Error('Unknown tool: ' + name);
}

export type AgentRequest = {
  requestId: string;
  root: string;
  provider: 'gemini' | 'openrouter';
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  autoFallback?: boolean;
  fallbackModels?: string[];
};

export type AgentResult = {
  content: string;
  usage?: Usage;
  steps: number;
  cancelled: boolean;
};

export async function runAgent(
  request: AgentRequest,
  signal: AbortSignal,
  emit: (event: AgentEvent) => void,
  onDelta: (chunk: string) => void
): Promise<AgentResult> {
  const messages: ChatMessage[] = request.messages.map(message => ({ ...message }));
  let usage: Usage | undefined;
  let totalSteps = 0;
  const maxSteps = 20;

  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) throw new Error('Request cancelled.');
    totalSteps = step + 1;
    emit({ type: 'step', step: totalSteps, maxSteps });

    const result = await streamChat({
      provider: request.provider,
      model: request.model,
      messages,
      tools: toolSpecs as unknown as unknown[],
      temperature: request.temperature,
      autoFallback: request.autoFallback,
      fallbackModels: request.fallbackModels,
      signal,
      onDelta,
      onUsage: next => {
        usage = next;
        emit({ type: 'usage', usage: next });
      }
    });

    if (result.toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls
      });
      for (const toolCall of result.toolCalls) {
        if (signal.aborted) throw new Error('Request cancelled.');
        const id = toolCall.id;
        const name = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }
        const label = TOOL_LABELS[name] || name;
        const detail = describeArgs(name, args);
        emit({ type: 'tool_start', id, name, label, detail });
        const started = Date.now();
        let toolResult: ToolResult;
        try {
          toolResult = await executeTool(request.root, name, args);
        } catch (error) {
          toolResult = {
            text: 'Tool error: ' + (error instanceof Error ? error.message : String(error)),
            status: 'error'
          };
        }
        emit({
          type: 'tool_end',
          id,
          name,
          status: toolResult.status,
          summary: toolResult.text.slice(0, 500),
          durationMs: Date.now() - started
        });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name,
          content: truncate(toolResult.text, 40_000)
        });
      }
      continue;
    }

    return {
      content: result.content || (result.finishReason === 'length' ? 'The response hit the output limit. Ask me to continue.' : 'Done.'),
      usage,
      steps: totalSteps,
      cancelled: false
    };
  }

  return {
    content:
      'I reached the maximum number of tool steps for this turn (20). Review the changes above, then send a focused follow-up if you want me to continue.',
    usage,
    steps: totalSteps,
    cancelled: false
  };
}
