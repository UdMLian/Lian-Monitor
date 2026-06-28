# CLAUDE.md

## Build & Development

```bash
npm run build              # Vite library build → dist/ (ESM + CJS)
npm run dev:example        # Vite dev server for examples/ (port 5174)
npm run mock:server        # Mock report server on port 8787
```

## Architecture

Lian-Monitor is a front-end monitoring SDK. Collectors capture data → pipeline processes → transport delivers.

```
src/index.js                    — entry, exports init() + MonitorClient
  ├── client/index.js           — orchestration: pipeline, collectors, plugins, state machine
  ├── client/transport.js       — send/sendImmediate with fallback chain and retry
  ├── collector/error.js        — onerror, unhandledrejection, resource error, console.error
  ├── collector/performance.js  — resource timing, longtask, web-vitals (lazy), memory
  ├── collector/behavior.js     — click, keypress, console, XHR/Fetch, history, page view
  ├── plugins/rrweb.js          — session replay (lazy import, circular buffer)
  ├── core/config.js            — defaults
  ├── core/scope.js             — breadcrumbs, tags, extras, userId
  └── core/contexts.js          — UA parsing → os/browser/device
```

## Rules

- **Class syntax**: NO commas between methods. `foo(){} bar(){}` not `foo(){}, bar(){}`.
- **`.call(window, ...)` not `.apply(this, ...)`**: when chaining original `window.onerror`, use `.call(window, ...)` because `window.onerror` expects `this === window`.
- **Teardown order matters**: error collector tears down before behavior collector, so behavior's console teardown checks `console[method] === wrapper` before restoring — otherwise it would overwrite error's earlier restore.
- **Preserve user comments**: never delete user-authored inline comments or tables.

## Non-obvious design decisions

- **Pipeline middleware order is fixed**: Filter → Sampling → Enrichment → beforeSend. Each fn can mutate or drop (return null) the event. Errors in middleware are caught and drop silently.
- **Error vs non-error routing**: errors use `sendImmediate()` (no queue, no batching, beacon priority). Non-errors use `send()` (queue → batch → retry). Rationale: errors must arrive fast, even during page close.
- **Scope as decoupling layer**: Collectors write breadcrumbs/user info to Scope. Enrichment reads Scope. Client never queries a specific Collector — they're loosely coupled through Scope.
- **Collector vs Plugin vs Middleware**: Collectors produce events (`client.capture()`). Plugins have lifecycle but don't produce events (rrweb attaches replay to existing events via middleware). Middleware are pure pipeline functions.
- **Deterministic hash for sampling stability**: `userId + type` → 0~1 hash. Same user same type always same decision. A user is either fully sampled or fully unsampled — no data fragmentation. Sampler function (dynamic) takes precedence over static `sampleRate` when both are provided.
- **Transport fallback chain**: `fetch → sendBeacon → Image`, with exponential backoff retry. 4xx (except 429) bails early — not worth retrying. `pagehide` listener auto-flushes queue to avoid data loss on page close.
- **reportFields injection varies by transport**: fetch → headers, beacon → body spread, image → URL params. No hardcoded field names — user provides arbitrary key-value pairs at init.
- **Web-vitals async race**: lazily imported. `_active` flag checked after `await import()` AND inside each callback — collector may be torn down before import resolves.
- **XHR closure capture**: `_loadendHandler` stored on `_monitor` object inside `send()`, closure captures `monitor` reference. Old listeners survive `open()` reuse because they're cleaned up only in `send()`, not in `open()` (in-flight request breadcrumbs would be lost otherwise).
- **Self-report filtering**: `_isOwnReportUrl()` compares origin+pathname of candidate URL against `dsn` config. Applied in XHR, Fetch, and resource timing to prevent infinite reporting loops.
- **Console interception chain**: error.js wraps `console.error` first (for error events). behavior.js wraps all three later (for breadcrumbs), saving error's wrapper as its "original" — so both run: behavior → error → real console.
- **Lazy loading pattern**: `web-vitals` and `rrweb` are `external` in Vite config (not bundled). They're loaded via dynamic `import()` only when needed.
