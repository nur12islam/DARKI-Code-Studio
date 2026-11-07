# DARKI Code Studio — Redesign Plan (v0.2)

## Problems found in v0.1

### Settings / provider layer
- API keys could be written but never read back or verified. There was no way to tell whether a
  key was saved, which provider it belonged to, or whether it was still valid.
- The Settings modal saved keys one IPC call at a time. A single failure left a partially saved
  configuration with no feedback, and there was no way to remove a saved key.
- The model list had no diagnostics. Invalid keys only produced a log line, and an empty model
  list looked identical to "still loading".
- `settings:read` deliberately returned `null` for credentials, but the renderer used it as a
  generic getter, so a saved key looked missing.
- Model selection was stored in two unrelated places (`geminiModel` and `defaultModel`) and the
  model picker did not always persist what the chat actually used.
- The GitHub token had a "login" action buried behind a `prompt()` dialog, with no visible status.

### Agent / chat
- Only one approval card could exist at a time; a second approval overwrote the first and left its
  promise unresolved until timeout.
- Tool calls were invisible. Users saw a spinner and then a final message, with no idea which
  files were read, edited, or which commands were waiting for approval.
- No cancellation. Closing the panel or pressing stop was not possible once a request started.
- The stream listener was never detached.
- Chat history, multiple sessions, drafts, and per-project history were missing.
- Chat failed without a project folder even for questions that did not need files.
- Manual file saves and UI file creation triggered approval dialogs meant for the agent.

### Editor / workspace
- One file at a time. Switching files discarded unsaved changes silently.
- The "explorer" was a flattened list; folders could not be collapsed.
- File actions were `prompt()`/`confirm()`/`alert()` based.
- Git actions were hidden behind a single `prompt()` menu.
- Preview only inlined CSS/JS and did not handle images, ES modules, or dev servers.
- Terminal output only appeared after a command exited.
- No command palette, no search, no status bar details, no notifications.

## Redesign

### Product direction
Turn the app from a demo shell into a focused desktop coding agent:

1. **Workspace first** — a VS Code/Cursor-like shell with activity bar, explorer, editor tabs,
   assistant, terminal and status bar.
2. **Visible agent** — every tool call, approval, file diff and command appears in the chat as a
   live activity timeline.
3. **Honest configuration** — settings report exactly what is saved, verified and active.
4. **Recoverable work** — multiple tabs, unsaved-change guards, undo for AI edits, persistent chats.
5. **Fast paths** — command palette, keyboard shortcuts, inline Git panel, one-click commit/push.

### Backend (Electron main)
- Split into `settings`, `security`, `providers`, `agent`, `git`, `github`, `preview`, `devserver`.
- Credentials remain in the main process, encrypted with `safeStorage`, never returned to the
  renderer. Renderer receives only `hasKey` + last-four mask.
- One atomic `settings:update` IPC call, validated against a whitelist, plus `settings:clearSecret`.
- Provider diagnostics: `provider:test` returns an actionable status for Gemini and OpenRouter.
- Gemini uses the native model-list endpoint (`/v1beta/models`) and OpenAI-compatible chat
  endpoint; OpenRouter uses `/models` and `/key`.
- Streaming chat with abort support, agent tool events, token usage, automatic fallback.
- Static preview server and managed dev-server lifecycle with streamed logs.
- Rich Git IPC (summary, diff, commit, push, pull, branches) and GitHub IPC (verify, repos,
  clone, create/publish, pull request).

### Renderer (React)
- Central Zustand store for workspace, tabs, chats, Git, files and toasts.
- Component split: `TopBar`, `ActivityBar`, `SidePanel`, `EditorPane`, `ChatPanel`,
  `PreviewPanel`, `BottomPanel`, `StatusBar`, modals and command palette.
- Persistent per-project chat sessions with automatic titles.
- Approval queue rendered as a modal with a real unified diff.
- Toasts replace blocking `alert()` calls.
- Browser-mode mock bridge so the UI can be developed and reviewed without Electron.

### Visual language
- Dark "obsidian" surfaces with a cyan/teal primary and violet secondary accent.
- Compact IDE density, 8px radii, subtle borders, no heavy glassmorphism.
- Clear status colours: running (cyan), success (green), denied (amber), error (red).
- Fully keyboard reachable; consistent focus rings.

## Delivery phases
1. Backend settings, provider verification, model discovery, agent events, cancellation.
2. Editor tabs, file operations, Git/GitHub panels, preview servers.
3. New UI shell, chat timeline, settings modal, command palette, toasts.
4. Documentation, type-check, production build, and a browser mock for review.

## Status (v0.2.0)

All four phases shipped: backend IPC modules, the full redesigned shell, the browser mock bridge and a passing production build. The v0.2 QA pass verified explorer ordering, search-to-editor jumps, settings flows (provider keys, GitHub token, about), chat approvals (allow and deny), preview start/stop, source-control commit and the project web demo deployable as a static build (`dist/`) for Cloudflare Pages.
