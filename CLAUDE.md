# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension for Niconico Live (Nico Nama). Provides broadcast alerts and auto-entry features.

## Development Commands

```bash
# Development build with watch mode
npm run build-dev

# Development build (single run, no watch)
npm run build-dev-once

# Production build
npm run build-prod

# Clean build artifacts
npm run clean

# Lint fix and format
npm run lint-fix

# Format code only
npm run prettier

# Run tests
npm test
```

## Architecture

### Directory Structure
- `src/entry/` - Chrome extension entry points (background.ts, content.tsx, popup.tsx, option.tsx, offscreen.ts)
  - `component/` - React components (AutoOpenToggleButton, ComingPrograms, ProgramGridItem, DeleteUserRow)
- `src/domain/` - Business logic layer
  - `model/` - Domain models (program, push-program, push-subscription, sound-type)
  - `usecase/` - Use case implementations (background, content, popup, option, colors)
  - `infra-interface/` - Infrastructure layer interfaces (browser-api, niconama-api, push-manager)
- `src/infra/` - Infrastructure layer
  - API communication (niconama-api.ts)
  - Chrome APIs (browser-api.ts)
  - Push notification system (autopush-client.ts, web-push-manager.ts, web-push-crypto.ts)
  - Chrome message passing (chrome_message/message.ts)
- `src/di/` - Dependency injection (inject-tokens.ts, register.ts using TSyringe)
- `src/view/` - HTML and CSS files
  - `html/` - HTML files for popup, options, and offscreen pages
  - `css/` - CSS files for styling
- `webpack/` - Webpack configurations (webpack.dev.js, webpack.prod.js)
- `test/` - Test files and test data
  - Unit tests (niconama-api.test.ts, web-push-crypto.test.ts)
  - Test data (html/, json/, data/push/)
  - Test setup (setup.ts)
- `public/` - Static files (manifest.json, icons, sounds)
- `.github/workflows/` - GitHub Actions CI/CD configuration (push.yaml)

### Technology Stack
- **TypeScript 5.1+** - ES2022 target with strict type checking enabled (strict: true)
  - `experimentalDecorators` and `emitDecoratorMetadata` enabled for TSyringe
  - Module: ES2022 with Node module resolution
- **React 18** - UI for popup and options pages
- **TSyringe** - Dependency injection container with reflect-metadata
- **Jest 29** - Test framework (using ts-jest with Node environment)
- **Webpack 5** - Bundler (separate dev and prod configs)
  - Development: watch mode with webpack.dev.js
  - Production: optimized build with webpack.prod.js and TerserWebpackPlugin
  - CopyWebpackPlugin for static assets
- **Chrome Extension Manifest V3** - Service Worker-based background script (version 3.3.0)
- **Node.js 22.20.0** - Runtime version (managed via `.node-version`)
- **Additional Tools**:
  - **html-entities** - HTML entity encoding/decoding
  - **rimraf** - Cross-platform file deletion for build cleanup
  - **ESLint** - TypeScript linting with Prettier integration
  - **Prettier** - Code formatting

### Chrome Extension Configuration

#### Permissions
- `storage` - Store user preferences and auto-open user lists
- `offscreen` - Create offscreen documents for audio playback
- `notifications` - Display desktop notifications for broadcasts
- `cookies` - Access authentication cookies for API requests

#### Host Permissions
- `https://*.nicovideo.jp/*` - Access all Niconico domains for API and content
- `https://secure-dcdn.cdn.nimg.jp/*` - Fetch user icons

#### Content Scripts
Injected into the following URL patterns:
- `https://live.nicovideo.jp/watch/*` - Broadcast watch pages
- `https://www.nicovideo.jp/my/follow*` - User follow pages
- `https://www.nicovideo.jp/user/*` - User profile pages
- `https://ch.nicovideo.jp/*` - Channel pages
- `https://account.nicovideo.jp/*` - Account management pages

### Key Components
- **Background Script** - Runs as Service Worker, uses `setInterval` for periodic broadcast checking (not Chrome Alarms API)
  - Manages WebPush notifications via Mozilla AutoPush service
  - Handles persistent WebSocket connections for real-time notifications
- **Content Script** - Injected into Niconico Live pages, handles auto-entry and UI enhancements
- **Popup** - Extension icon click interface showing current broadcasts
  - Displays push notification status (connected/disconnected)
  - Shows last received program information
  - Provides connect/disconnect controls for push notifications
- **Options** - Settings page for configuring notifications, sounds, and auto-open users
  - Manages push notification settings
- **Offscreen Document** - For background audio playback (workaround for Service Worker limitations)
- **Push Notification System**
  - **AutoPushClient** - WebSocket client for Mozilla Push Service
    - Handles Hello, Register, and Notification messages
    - Maintains persistent connection with auto-reconnect
  - **WebPushManager** - Manages push subscriptions and message decryption
    - Registers/unregisters subscriptions with Niconico Push API
    - Decrypts incoming push notifications
  - **RFC8291 Crypto (web-push-crypto.ts)** - Implements Web Push encryption standard
    - Key pair generation and management
    - ECDH shared secret computation
    - HKDF key derivation
    - AES-GCM decryption
    - Base64 URL encoding/decoding utilities

### API Endpoints
- `api.live2.nicovideo.jp` - Fetch broadcast information
- `secure-dcdn.cdn.nimg.jp` - Fetch icon images
- `wss://push.services.mozilla.com/` - Mozilla AutoPush WebSocket endpoint for push notifications
- `api.push.nicovideo.jp` - Niconico Push API for managing push subscriptions

### CI/CD
- **GitHub Actions** workflow (`.github/workflows/push.yaml`) configured for:
  - Automated testing on push to main branch (runs `npm test`)
  - Production build generation (runs `npm run build-prod`)
  - Release creation with dist.zip artifact on version tags (format: `*.*.*`)
  - Node.js version managed via `.node-version` file (currently 22.20.0)
  - Two-job pipeline: test → build (build only runs after tests pass)