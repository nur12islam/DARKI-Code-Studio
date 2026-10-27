# DARKI Code Studio

A Windows-first desktop workspace for coding with models available through [OpenRouter](https://openrouter.ai/). Built with Electron, React, TypeScript, Vite, Tailwind CSS, Monaco Editor, Zustand and simple-git.

## Current implementation status

This repository contains the first runnable UI and secure Electron foundation. It currently includes folder selection, a project file tree, Monaco editing and saving, OpenRouter model discovery and chat requests, encrypted settings where Electron safeStorage is available, basic Git status/push, a preview pane, and a command runner with an explicit confirmation.

**This is an initial scaffold, not yet the full agent described in the project brief.** Tool/function-calling loops, streamed token delivery, full file-operation approval cards and diff previews, undo snapshots, GitHub PAT login/repo creation/clone/pull/PR flows, persistent multi-session chat, automatic preview server management, and a complete test suite remain to be implemented. The approval-mode setting is currently saved as a preference; it does not yet change file-write behavior.

## Requirements

- Windows 10/11
- Node.js 20 or newer (LTS recommended)
- Git for Windows
- An OpenRouter API key for cloud models

## Install and run

```powershell
git clone https://github.com/nur12islam/DARKI-Code-Studio.git
cd DARKI-Code-Studio
npm install
npm run dev
```

Production build and Windows installer:

```powershell
npm run build
npm run dist
```

The installer is written to `release/\`.

## Configure OpenRouter

1. Open **Settings** in DARKI Code Studio.
2. Paste your key from https://openrouter.ai/settings/keys.
3. Save settings and choose a model from the top-bar selector.

The main process stores secrets using Electron `safeStorage` when the OS provides encryption. Never paste API keys into chat or commit them to source control. The app uses OpenRouter's models endpoint and OpenAI-compatible chat completions endpoint.

## Safety notes

- Electron renderer isolation is enabled; Node integration is disabled.
- File operations validate that paths stay under the chosen project root and reject symlinks on read/write.
- Commands run only after a confirmation dialog. Commands are powerful: inspect them before approving.
- Git push requires confirmation and intentionally refuses to push when the worktree has uncommitted changes.
- Only open projects you trust. This is not a security sandbox for arbitrary untrusted code.
- Never use production credentials in test projects.

## Contributing

Open an issue or pull request with a focused change and tests where practical. Keep secrets out of logs, renderer state, commits, and screenshots.