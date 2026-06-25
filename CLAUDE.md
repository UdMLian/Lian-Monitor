# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run build              # Vite library build → dist/ (ESM + CJS)
npm run dev:example        # Vite dev server for examples/ (port 5174)
npm run mock:server        # Mock report server on port 8787
```

## Architecture

Lian-Monitor is a front-end monitoring SDK (`window.YuanMonitor`). It collects errors, performance metrics, user behavior breadcrumbs, and session replays, then reports them to a server endpoint.

### Module layers (event-driven via EventBus)

```
src/index.js (YuanMonitor — top-level orchestrator)
  ├── core/index.js       (MonitorCore — session, sampling, config)
  ├── collector/          (data sources)
  │   ├── errorCollector.js        — window.onerror, unhandledrejection, resource errors
  │   ├── performanceCollector.js  — Web Vitals, resource timing, long tasks, memory
  │   └── behaviorCollector.js     — clicks, route changes, XHR/fetch breadcrumbs
  ├── reporter/dataReporter.js     — batch queue → fetch/beacon/image → server
  ├── advanced/sessionReplay.js    — rrweb-based replay (lazy loaded)
  └── framework/                   — Vue/React integration (lazy loaded)
```

All modules communicate through a **singleton EventBus** (`src/core/eventBus.js`). `YuanMonitor.init()` emits `core:initialized`, triggering each collector and the reporter to initialize.

### Key design decisions

- **Lazy loading**: `rrweb`, `web-vitals`, and framework integrations are loaded via dynamic `import()`. They are not bundled — set as `external` in vite.config.js.
- **Singleton pattern**: `init()` creates the instance once; subsequent calls return the existing instance (and optionally merge new config).
- **Sampling**: `MonitorCore.init()` performs a random check against `config.sampleRate`. If the check fails, the entire SDK disables itself.
- **Breadcrumbs**: User actions (clicks, routes, XHR/fetch) are collected as breadcrumbs and attached to error reports for debugging context.
- **Session replay**: Triggered by errors — starts recording on `error:captured`, auto-stops 10s after the last error, then uploads.

## Known issues

- **`window.performance.entryTypes` does not exist** — `performanceCollector.js` lines 113 and 121 should use `PerformanceObserver.supportedEntryTypes` (a static array). This causes long-task monitoring to never activate and the `buffered: true` resource observer branch to never execute.
- **`eventBus.emit()` silently swallows callback errors** (`eventBus.js:40-41`). Errors in performance/error handlers are lost with no warning.
- **`reactIntegration.js` uses `require('react')`** — this will fail in strict ESM environments. It should use dynamic `import()` like the other integrations.
- **No re-init guard** on `PerformanceCollector` — calling `init()` twice without `destroy()` leaks old `PerformanceObserver` instances and `setInterval` timers.
- **`performance.memory` is Chrome-only** and non-standard; Firefox/Safari return `undefined`.
- **INP (Interaction to Next Paint)** replaced FID in March 2024. `web-vitals` v5 supports `onINP()` but the code only listens to `onFID`.
