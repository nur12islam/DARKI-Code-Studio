# DARKI Code Studio

A Windows-first desktop AI coding workspace built with Electron, React, TypeScript, Vite, Monaco Editor, Zustand, simple-git and Google Gemini (`gemini-3.8-flash` by default, with optional OpenRouter).

v0.2 rebuilds the entire interface on a cohesive "Obsidian" design system: activity bar, workspace explorer, command palette, agent chat with approval cards, source control, GitHub panel, Monaco editor, terminal and a live preview — all wired to a single zustand store. The architecture notes live in [`docs/REDESIGN.md`](docs/REDESIGN.md).

## What ships in v0.2

- **Desktop shell** — secure Electron window: context isolation, no renderer Node, typed preload IPC bridge (`window.studio`).
- **Workspace** — open folder / recent projects / new project scaffolds (React + Vite, static site, Node script, blank), hierarchical explorer with create/rename/delete and live filtering, project-wide text search with jump-to-line.
- **Editor** — Monaco with multi-tab editing, dirty markers, Ctrl+S save, breadcrumbs, current model and Ln/Col status, per-language theming.
- **Agent chat** — streamed Gemini/OpenRouter responses, function/tool calls with visible timeline results (list/read/write/delete/command/git), multi-chat sessions per project persisted locally, token usage readout, code blocks with Copy and "Apply to file" (overwrite-aware) actions.
- **Approvals** — Allow/Deny cards for every write/delete/command/commit/push/branch/pull/PR action, approval modes (always ask / auto-edit / read-only), three-minute timeout, exact diffs before any change.
- **Git & GitHub** — live status (branch, ahead/behind, changed files), unified diff viewer, suggested commit messages, commit and push, pull, branch create/switch, token-based GitHub identity check, repository list, clone, create and pull requests.
- **Preview** — sandboxed static preview of the project, plus managed dev-server lifecycle with viewport presets and server logs.
- **Terminal & logs** — PowerShell terminal with quick commands and process exit codes, plus a scrollable activity log feed.
- **Command palette** — Ctrl+K for files and commands; `>` for commands only.
- **Settings** — providers & model discovery, agent behaviour (fallbacks, temperature, approval mode), editor preferences, Git & GitHub token management and an About section with security notes.
- **Security** — encrypted credential storage via Electron safeStorage (plaintext storage refused), path/traversal/symlink validation, secret-file checks before AI commits, prompt-injection hardening guidance, no secrets ever returned to the renderer.

## Web version (browser demo)

The same UI runs in the browser without Electron. When `window.studio` is absent, a **mock bridge** (`src/lib/mockStudio.ts`) auto-installs with a small demo project, demo chat/approval flow and a simulated terminal and preview.

Build and deploy the web demo:

```bash
npm run build      # outputs the static site to dist/
```

Everything is client-side: no provider keys, no filesystem access — the demo is purely that, a demo.

### Deploying to Cloudflare Pages (live demo)

The web build is deployed on Cloudflare Pages at **https://cs.darki.online** — connect the repository in the Cloudflare Pages dashboard, or deploy `dist/` directly with Wrangler:

```bash
npm run build
npx wrangler pages deploy dist --project-name darki-code-studio
```

Pages settings to run the build for you:

- **Framework preset**: Vite (or set manually — see below)
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: 22 or newer (set `NODE_VERSION=22` in the Pages environment variables)
- **Optional but recommended**: `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — the Pages build only needs the renderer bundle, so this skips Electron's ~100 MB binary download

`vite.config.ts` uses a relative `base`, so `dist/` also works from any subpath or preview URL.

## Requirements

- Windows 10/11 (desktop app)
- Node.js 22 LTS or newer
- Git for Windows
- Google Gemini API key (recommended/default provider)
- Optional: OpenRouter API key, GitHub Personal Access Token

## Run from source (desktop)

```bash
git clone https://github.com/nur12islam/DARKI-Code-Studio.git
cd DARKI-Code-Studio
npm install
npm run dev
```

## Build a Windows installer

```bash
npm run build      # type-checks renderer + electron, bundles dist/ and dist-electron/
npm run dist       # electron-builder NSIS target -> release/
```

The NSIS installer is written to `release/` (assisted installer, lets you choose the install directory).

## Build the web version

```bash
npm run build
npx vite preview   # local preview of dist/
```

For the hosted demo, see **Deploying to Cloudflare Pages** above.

`vite.config.ts` uses a relative `base`, so `dist/` can be served from any subpath.

## Configure credentials

1. Open **Settings → Providers** and save your Gemini (or OpenRouter) key; supported models are discovered automatically.
2. Optional **Settings → Git & GitHub**: save a personal access token to enable GitHub actions.
3. Pick a model in the top bar and start chatting.

Keys are encrypted with the OS credential store and are never returned to the renderer (only a `••••last4` hint). If OS encryption is unavailable, the app refuses to store credentials.

## Safety

- Every agent write, delete, command, commit, push, branch switch, pull and PR request requires explicit approval by default; requests time out as denied.
- Review exact diffs and commands before approving. Approved commands can modify files or access the network.
- AI-created commits block common secret file patterns such as `.env` and private keys.
- Path validation blocks parent traversal and symlinks during project operations. The approval layer is not a sandbox for hostile code — review commands carefully.
- Never commit API keys, tokens, or private keys.

## Known limitations

Early-stage software: preview console capture, full clone/pull conflict handling, undo history across restarts and end-to-end tests are still open. Git pushes use your saved GitHub token only for HTTPS remotes you own. The web demo cannot access real files or providers.

## Open-source readiness

The repository is being prepared for community review; review dependency licenses, confirm no credentials or private data are committed, and watch for a license announcement from the repository owner before redistributing.

Contributions and focused bug reports are welcome.
