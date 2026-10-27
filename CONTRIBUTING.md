# Contributing to DARKI Code Studio

Thanks for helping improve DARKI Code Studio!

## Before you contribute

- Discuss substantial features or architecture changes in an issue first.
- Keep changes focused and explain the user problem they solve.
- Never include API keys, access tokens, private keys, personal data, or proprietary project files.
- Treat model output and project content as untrusted input. Do not weaken approval gates, credential storage, path checks, or renderer isolation without a documented threat model and review.

## Development

Requirements: Windows 10/11, Node.js 22 LTS recommended, and Git for Windows.

```powershell
npm install
npm run dev
npm run build
```

Before opening a pull request:

1. Run `npm run build`.
2. Test the changed behavior manually in the desktop app.
3. Include reproduction steps and screenshots for UI changes where useful.
4. Explain security implications and failure modes for changes touching credentials, file access, shell commands, Git, IPC, or network requests.

## Pull requests

- Use a clear title and describe the change, tests, and known limitations.
- Keep permissions minimal and avoid new dependencies unless justified.
- Do not claim a test passed unless it was actually run.
- Be respectful and constructive in reviews.

The project is currently being prepared for open-source publication. Check the repository's license and visibility before redistributing any code or builds.
