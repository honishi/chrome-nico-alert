# AGENTS

## Mission
This repository hosts a TypeScript- and React-based Chrome extension that surfaces Niconama live stream alerts, automates lobby entry, and integrates with the autopush notification service. Agents should preserve Chromium Manifest V3 compatibility and keep the release automation intact.

## Project Snapshot
- `src/entry/` contains all extension entry points: the background service worker, offscreen worker, content script, popup UI, options UI, and shared React components.
- Domain logic lives under `src/domain/` (models, use cases, browser-facing interfaces), while concrete integrations such as the Niconama API client, web push crypto helpers, and the autopush bridge reside in `src/infra/`.
- HTML, CSS, and other rendered assets are maintained in `src/view/`, complementing the bundled artifacts generated into `public/` alongside `public/manifest.json` and icon assets.
- Tests are written with Jest in `test/`, supported by fixtures under `test/data`, `test/html`, and `test/json`.
- Build and bundling configuration is organized in `webpack/`, and additional user-facing documentation and imagery live in `docs/`.
- GitHub Actions automation defined in `.github/workflows/push.yaml` runs tests, creates production builds, and attaches zipped `dist` artifacts to tagged releases.

## Tooling & Commands
- The required Node.js version is pinned via `.node-version`; install dependencies with `npm install` or `npm ci` for CI.
- `npm run build-dev` starts a watch-mode development build, while `npm run build-dev-once` performs a single incremental build.
- Produce release bundles with `npm run build-prod`; artifacts are emitted to `dist/` and zipped during CI.
- Run unit tests with `npm test` and clear build outputs via `npm run clean`.
- Enforce formatting and linting with `npm run lint-fix` (ESLint + Prettier) or run Prettier alone through `npm run prettier`.

## Collaboration Notes
- Follow the existing TypeScript, React, webpack, and tsyringe dependency-injection conventions when adding or refactoring features.
- Confirm that background, content, popup, and offscreen workflows continue to operate across Chromium-based browsers, and that the Manifest V3 service worker lifecycle remains compliant.
- Changes must keep the GitHub Actions release pipeline functional, including the zipped production bundle expected on version tags.
- Prefer ASCII encoding for new files unless a file already relies on non-ASCII characters (e.g., localized copy or assets).

## Communication
Coding-agent conversations with the user must be conducted in Japanese. Repository documentation should remain in English unless the user provides different guidance.

