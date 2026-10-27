# DARKI Code Studio

A Windows-first desktop AI coding workspace built with Electron, React, TypeScript, Vite, Tailwind CSS, Monaco Editor, Zustand, simple-git and OpenRouter.

## Current implementation

- Electron main process with context isolation, disabled renderer Node integration and a typed preload bridge.
- Project folder selection, file explorer, create/rename/delete file controls, Monaco editing and Ctrl+S.
- OpenRouter model discovery and chat completions with tool/function calling.
- Agent tools: list/read/write/delete project files, run a PowerShell command, inspect Git status, commit, push and suggest a preview URL.
- Allow/Deny approval cards for agent file changes, deletions, commands, commits and pushes. Approval requests time out as denied.
- Local settings and encrypted API key storage via Electron safeStorage when available.
- Basic Git branch/status, preview panel and terminal/log panel.
- GitHub Actions workflow to build and package a Windows installer.

This is an active early-stage project. Streaming token delivery, robust preview-server lifecycle management, persistent multi-chat sessions, GitHub PAT login/repository creation/clone/pull/PR flows, real Monaco side-by-side diff editor, undo snapshots, and comprehensive automated tests are not yet complete. GitHub Actions has been added but its first run still needs to confirm that the code compiles and packages correctly.

## Requirements

- Windows 10/11
- Node.js 22 LTS recommended
- Git for Windows
- An OpenRouter API key

## Run locally

    git clone https://github.com/nur12islam/DARKI-Code-Studio.git
    cd DARKI-Code-Studio
    npm install
    npm run dev

## Build the Windows installer

    npm run build
    npm run dist

The NSIS installer should appear in the release directory when packaging succeeds. The GitHub Actions workflow also uploads an installer artifact when the workflow succeeds.

## Configure OpenRouter

1. Open Settings in the app.
2. Paste your API key from the official OpenRouter key page.
3. Save settings and choose a model from the top bar.

The key is used in Electron's main process and is not returned to the renderer. Electron safeStorage encrypts secrets when OS encryption is available. If encryption is unavailable, avoid using the app on a shared Windows account and do not share the app's settings file.

## Agent approval model

- File writes/deletes, commands, Git commits and pushes are paused until approved, subject to the selected approval mode.
- Denied actions return a denial result to the model.
- Commands execute in PowerShell on Windows and can still perform dangerous operations if approved. Review them carefully.
- File path validation blocks parent-directory traversal, but this app is not a hardened sandbox for hostile projects or untrusted dependencies. Do not open untrusted repositories or approve commands you do not understand.

## Roadmap

- Stream model output to the chat UI.
- Monaco diff review and one-click undo for file changes.
- Persistent multiple chat sessions per project.
- Manage the full GitHub workflow: token setup, clone, pull, branch operations and pull requests.
- Start/stop project preview servers safely and display preview console errors.
- Add end-to-end tests and validate the Windows installer on a clean machine.

Contributions and focused bug reports are welcome.