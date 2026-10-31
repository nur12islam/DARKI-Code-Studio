# DARKI Code Studio

## ⬇️ Download for Windows

**[Download the latest Windows installer (EXE inside ZIP)](https://github.com/nur12islam/DARKI-Code-Studio/actions/runs/41166684888/artifacts/13028448912)**

Download the artifact, extract the ZIP, then run the installer `.exe`. This build was produced by the successful [Windows build workflow](https://github.com/nur12islam/DARKI-Code-Studio/actions/runs/41166684888). GitHub Actions artifacts expire, so this link is temporary; for the latest build, visit [Windows Build Actions](https://github.com/nur12islam/DARKI-Code-Studio/actions/workflows/windows-build.yml).


A Windows-first desktop AI coding workspace built with Electron, React, TypeScript, Vite, Monaco Editor, Zustand, simple-git and Google Gemini `gemini-3.8-flash` (default) with optional OpenRouter.

## Implemented in this development pass

- Secure Electron shell: context isolation, disabled renderer Node integration and typed preload IPC.
- New project scaffolding (React + TypeScript + Vite), project folder selection, file tree, create/rename/delete, Monaco editing, Ctrl+S and file filtering.
- Direct Gemini API integration using Google's OpenAI-compatible endpoint, model discovery, streamed chat and function calling; Gemini `gemini-3.8-flash` is the default provider/model. Optional OpenRouter support includes model discovery, a free-only filter, and configurable fallback routing (defaults to `openrouter/free`).
- Agent function/tool calling: list/read/write/delete files, run PowerShell commands, Git status/commit/push and preview guidance.
- Allow/Deny approval cards for file changes, deletion, commands, Git commits, pushes, branch changes, pull and repository creation.
- Code block Copy and Apply to file actions; applying code is approval-gated.
- In-memory undo for the latest AI file write during the current app session.
- GitHub token settings, identity check, repository creation, clone, local pull, branch create/switch and pull request creation.
- Encrypted credential storage with Electron safeStorage where supported; plaintext credential storage is refused if encryption is unavailable.
- Prompt-injection hardening guidance: project files and tool output are treated as untrusted data, with explicit rules against revealing secrets or exfiltrating project contents.
- Symlink/path traversal checks, secret-file checks before AI-created commits, basic Git status and a sandboxed preview iframe.
- GitHub Actions workflow for Windows type-check/build/package and installer artifact upload.

## Open-source readiness

The code is being prepared for community review, but the repository is currently private and does not yet declare an open-source license. Do not redistribute builds or source until the repository owner makes it public and chooses a license. Before a public release, review dependency licenses, run the build and security checks, and confirm no credentials, private project data, or generated artifacts are committed.

## Known limitations

This is still an early-stage build, not a release-ready coding agent. Multi-chat sessions per project, persistent chat history, OpenRouter credit/usage display, fully managed preview server lifecycle, preview console capture, rich side-by-side Monaco diff review, undo history across app restarts, full pull/clone conflict handling, and end-to-end tests remain incomplete. Git clone currently uses the provided URL and may not authenticate private repositories automatically. Review commands carefully; Electron's approval layer is not a security sandbox for untrusted code.

## Requirements

- Windows 10/11
- Node.js 22 LTS recommended
- Git for Windows
- Google Gemini API key (recommended/default provider)
- Optional OpenRouter API key
- Optional GitHub Personal Access Token for GitHub API actions

## Run locally

    git clone https://github.com/nur12islam/DARKI-Code-Studio.git
    cd DARKI-Code-Studio
    npm install
    npm run dev

## Build a Windows installer

    npm run build
    npm run dist

The installer should appear in the release directory when packaging succeeds. The GitHub Actions workflow uploads the Windows installer as an artifact. You can download the current build from the link at the top of this README; artifacts expire, so use the Actions page for newer builds.

## Configure credentials

1. Open Settings in DARKI Code Studio.
2. Add your Google Gemini API key (or optionally an OpenRouter API key) and, if needed, a GitHub Personal Access Token.
3. Save settings and select a model in the top bar.

Credentials are handled in Electron's main process and are not returned to the renderer. They are encrypted with safeStorage when OS encryption is available. If encryption is unavailable, the app refuses to save credentials.

## Safety

- Agent writes, deletes, commands, commits and pushes require explicit approval by default. Approval requests time out as denied.
- Review file content and commands before approving. Commands can modify files or access the network.
- AI-created commits block common secret file patterns such as .env and private keys.
- Path validation blocks parent traversal and rejects symlinks during project file operations. This is not a hardened sandbox for hostile projects or dependencies.
- Never commit API keys, tokens, private keys, or other secrets.

Contributions and focused bug reports are welcome.