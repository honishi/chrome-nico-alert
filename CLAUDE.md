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

### Technology Stack
- **TypeScript** - Strict type checking enabled (strict: true)
- **React** - UI for popup and options pages
- **TSyringe** - Dependency injection container
- **Jest** - Test framework (using ts-jest)
- **Webpack** - Bundler (separate dev and prod configs)
- **Chrome Extension Manifest V3** - Service Worker-based background script

### Key Components
- **Background Script** - Runs as Service Worker, periodic broadcast checking
- **Content Script** - Injected into Niconico Live pages, handles auto-entry
- **Popup** - Extension icon click interface
- **Options** - Settings page
- **Offscreen Document** - For background audio playback

### API Endpoints
- `api.live2.nicovideo.jp` - Fetch broadcast information
- `secure-dcdn.cdn.nimg.jp` - Fetch icon images