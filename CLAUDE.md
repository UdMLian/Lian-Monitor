# CLAUDE.md

## Build & Development

```bash
npm run build              # Vite library build → dist/ (ESM + CJS)
npm run dev:example        # Vite dev server for examples/ (port 5174)
npm run mock:server        # Mock report server on port 8787
```

## Architecture

Lian-Monitor is a front-end monitoring SDK. It collects errors, performance metrics, and user behavior breadcrumbs, then reports them to a server endpoint.

### Module layers (Client + Pipeline)

```
src/index.js                    — entry, exports init() + MonitorClient
  ├── client/index.js           — MonitorClient (orchestrator)
  │     ├── Pipeline: Filter → Sampling → Enrichment → beforeSend → Transport
  │     │     error → sendImmediate (beacon/fetch/image, no queue)
  │     │     other → send (queue → batch → deliver)
  │     ├── Manages Collectors (Map), Plugins (array), Scope, state machine
  │     ├── Public APIs: captureError, captureMessage, setTag, setExtra, addBreadcrumb
  │     └── pagehide listener → auto flush transport on page close
  ├── client/transport.js       — send() + sendImmediate(), retry, reportFields injection
  ├── collector/error.js        — window.onerror, unhandledrejection, resource error → dedup
  │                                console.error hijack for try-catch swallowed errors
  ├── collector/performance.js  — PerformanceObserver (resource/longtask), web-vitals (lazy), memory
  │                                resource buffer overflow prevention (setResourceTimingBufferSize
  │                                + clearResourceTimings + resourcetimingbufferfull fallback)
  ├── collector/behavior.js     — click (CSS selector + HTML serialization), keypress (action keys
  │                                only, skip input elements), history hijack, XHR/Fetch hijack,
  │                                console.log/warn/error → breadcrumbs (with sensitive-key redaction),
  │                                MPA page-enter/page-leave tracking, self-report URL filter
  ├── plugins/rrweb.js          — session replay via rrweb (lazy), circular buffer, masking
  ├── core/config.js            — default options (sampler, captureConsole, reportFields, etc.)
  ├── core/scope.js             — breadcrumbs (standardized format) + user info container
  └── core/contexts.js          — UA parsing → OS, browser, device info attached to every event
```

### Key design decisions

- **Pipeline**: ordered middleware chain. Each fn receives an event, returns event (or null to drop). Registered via `client.use(fn)`. Execution order is guaranteed.
- **Error vs non-error routing**: errors → `sendImmediate()` (beacon → fetch → image, no batching). Non-errors → `send()` (queue → batch → deliver with retry).
- **Scope pattern**: Collectors write to `client.getScope()`; Enrichment reads from it. Client never queries a specific Collector.
- **Collector vs Plugin vs Middleware**: Collectors produce events via `client.capture()`; Plugins have lifecycle (`setup`/`teardown`) but don't produce events; Middleware are pure functions in the pipeline.
- **Lazy loading**: `web-vitals` and `rrweb` are loaded via dynamic `import()`. They are marked as `external` in vite.config.js so they don't bundle.
- **Session persistence**: sessionId stored in `sessionStorage`, survives page refreshes.
- **Sampling**: Supports both static `sampleRate` (number, hash comparison) and `sampler` function `(ctx) => true/false/number` for dynamic decisions. Per-type + global fallback. Sampler function takes precedence. Deterministic hash (`sessionId + type` → number 0~1) ensures same session same type always same decision. Sampled-in events record `_sampled: true` + `sample_rate` for traceability.
- **Event structure**: Follows Sentry-compatible format — `exception.values` (structured from flat data), `platform: 'javascript'`, `level` (inferred from type), `sdk.packages`, `contexts` (OS/browser/device), `fingerprint` (user-defined grouping), `tags`, `extras`.
- **Breadcrumb format**: Standardized — `{ type: 'default', category, level, timestamp (seconds), data: {...} }`. Namespaced categories: `ui.click`, `ui.keypress`, `http.xhr`, `http.fetch`, `navigation.route`, `navigation.page-enter/leave`, `console`, `custom`.
- **Error dedup**: error collector hashes `type|message|source|lineno`, skips duplicates within a session (Set max 50, trims to 25).
- **Config validation**: `dsn` is required at construction time; `sampleRate` range-checked.
- **Error isolation**: Pipeline middleware errors and Collector `setup`/`teardown` errors are caught individually — one failure doesn't crash the whole SDK.
- **Transport fallback chain**: `fetch POST → sendBeacon → Image beacon`, with exponential backoff retry (1s→2s→4s). Page-close auto-flush via `pagehide` listener.
- **reportFields**: user-defined key-value pairs injected differently per transport method — fetch via headers, beacon via body, image via URL params. No hardcoded field names in transport.
- **Resource buffer overflow**: increased to 500, cleared after each observer callback, `resourcetimingbufferfull` event as safety net.
- **Cross-origin transferSize**: marked `undefined` (not `0`) when hidden by `Timing-Allow-Origin` restrictions.
- **XHR safety**: old listeners survive across `open()` reuse (closure captures correct monitor). Route hijack calls native method first, records breadcrumb only on success.
- **Self-report filtering**: `_isOwnReportUrl()` filters SDK's own reporting requests from XHR, Fetch, and resource timing to prevent data loops.
- **Console interception**: `console.log/warn/error` → breadcrumbs with argument serialization. Sensitive keys (`token`, `secret`, `password`, etc.) redacted to `[REDACTED]`. Disable via `behavior.captureConsole: false`.
- **DOM serialization**: click/keypress breadcrumbs include HTML description string (`<button.btn.primary[type="submit"]>`) alongside CSS selector. No textContent (privacy). URL attributes stripped of query params.
- **Keypress safety**: only captures action keys (Enter/Escape/Arrow keys etc.), skips all input elements (`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`). Never captures printable characters.
- **CSS selector path**: click breadcrumbs include a validated CSS selector chain (max 5 levels, `nth-of-type` disambiguation, `querySelector` verification).
- **rrweb masking**: `maskAllInputs`, `maskTextClass: 'rr-mask'`, `blockClass: 'rr-block'` for privacy. Circular buffer (80 events) attached to error events via middleware.
- **Performance**: non-critical collectors start via `requestIdleCallback` (3s timeout fallback).
