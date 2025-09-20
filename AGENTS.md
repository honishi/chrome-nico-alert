# AGENTS

## Mission
This repository hosts a TypeScript-based Chrome extension that delivers Niconama live stream alerts. Agents should preserve extension compatibility with Chromium browsers and follow existing build and release automation.

## Project Snapshot
- Entry points for the extension live in `src/entry/` (background service worker, content script, popup UI, offscreen worker).
- Domain logic is organized under `src/domain/`, while platform integrations (e.g., web push, autopush client) sit in `src/infra/`.
- Shared UI and assets are defined in `public/`, including `public/manifest.json`.
- Automated builds run through `.github/workflows/push.yaml`, producing a zipped distribution on tagged releases.

## Tooling & Commands
- Node.js version is declared in `.node-version`; install dependencies with `npm install`.
- Use `npm run build-dev` for watch-mode development builds; run `npm run build-dev-once` when you need a single-shot development bundle.
- Execute `npm run build-prod` for release bundles.
- Execute `npm test` to run the Jest test suite.
- Clean generated artifacts with `npm run clean`.

## Collaboration Notes
- Maintain the existing TypeScript, React, and webpack configuration conventions when adding features.
- Verify that any changes keep the release workflow functional, especially the generated dist zip used in GitHub releases.
- When introducing new files, prefer ASCII encoding unless the file already employs non-ASCII characters.

## Communication
Coding-agent conversations with the user must be conducted in Japanese. Document updates like this file should remain in English unless the user specifies otherwise.
