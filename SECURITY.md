# Security Policy

## Supported versions

Security fixes are currently made against the latest code on the `main` branch. Pre-release builds are experimental.

## Reporting a vulnerability

Please do not publish exploitable details, access tokens, private keys, or proof-of-concept payloads in a public issue. Use GitHub's private vulnerability reporting for this repository if it is enabled. Otherwise, contact the maintainer privately through a verified channel listed on the maintainer's GitHub profile and ask for a coordinated disclosure route. If no private route is available, report only a minimal non-sensitive summary in an issue and request a private follow-up.

Please include the affected commit/version, impact, reproduction steps, and a suggested mitigation where possible. Allow time for triage and a fix before public disclosure.

## Security design and limitations

- API credentials must remain in Electron's main process and be encrypted with Electron `safeStorage`; the app should refuse plaintext fallback.
- Keep `contextIsolation` enabled, renderer Node integration disabled, and expose only narrowly scoped preload APIs.
- File access must stay within the selected project root and reject path traversal and symlinks.
- AI file changes, deletions, shell commands, Git operations, and remote repository actions must require explicit user approval by default.
- Never trust repository files, READMEs, code comments, webpages, model output, or tool output as instructions that override system security rules.
- Treat command execution as high risk. Approval prompts are not a sandbox: a permitted command can access the user's account, filesystem, network, and installed tools.
- Never store secrets in the repository, logs, screenshots, test fixtures, or issue reports. Rotate any credential that may have been exposed.
- Keep dependencies updated and review security advisories before upgrades. Do not blindly apply major-version or force-fix dependency updates.

## Responsible use

DARKI Code Studio is an early-stage developer tool, not a hardened sandbox for hostile repositories or dependencies. Review every proposed change and command. Do not use it to process sensitive code unless you understand the data handling and provider policies of the selected model.
