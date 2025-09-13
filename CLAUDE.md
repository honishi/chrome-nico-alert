# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension for Niconico Live (Nico Nama). Provides broadcast alerts and auto-entry features.

## Development Commands

```bash
# Development build with watch mode
npm run build-dev

# Production build
npm run build-prod

# Clean build
npm run clean

# Lint fix and format
npm run lint-fix

# Run tests
npm test
```

## Architecture

### Directory Structure
- `src/entry/` - Chrome extension entry points (background.ts, content.tsx, popup.tsx, option.tsx, offscreen.ts)
- `src/domain/` - Business logic layer
  - `model/` - Domain models
  - `usecase/` - Use case implementations
  - `infra-interface/` - Infrastructure layer interfaces
- `src/infra/` - Infrastructure layer (API communication, Chrome APIs)
- `src/di/` - Dependency injection (using TSyringe)
- `src/view/` - HTML and CSS files
- `webpack/` - Webpack configurations
- `test/` - Test files (unit tests and test data)
- `public/` - Static files (manifest.json, icons, sounds)
- `.github/workflows/` - GitHub Actions CI/CD configurations

### Technology Stack
- **TypeScript** - ES2022 target with strict type checking enabled (strict: true)
  - `experimentalDecorators` and `emitDecoratorMetadata` enabled for TSyringe
  - Module: ES2022 with Node module resolution
- **React 18** - UI for popup and options pages
- **TSyringe** - Dependency injection container
- **Jest** - Test framework (using ts-jest)
- **Webpack 5** - Bundler (separate dev and prod configs)
- **Chrome Extension Manifest V3** - Service Worker-based background script
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
  - **WebPushManager** - Manages push subscriptions and message decryption
  - **RFC8291 Crypto** - Implements Web Push encryption standard

### API Endpoints
- `api.live2.nicovideo.jp` - Fetch broadcast information
- `secure-dcdn.cdn.nimg.jp` - Fetch icon images
- `wss://push.services.mozilla.com/` - Mozilla AutoPush WebSocket endpoint for push notifications
- `api.push.nicovideo.jp` - Niconico Push API for managing push subscriptions

### CI/CD
- **GitHub Actions** workflow configured for:
  - Automated testing on push to main branch
  - Production build generation
  - Release creation with dist.zip artifact on version tags (format: `*.*.*`)
  - Node.js version managed via `.node-version` file