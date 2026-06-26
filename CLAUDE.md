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
  │     ├── Pipeline: Filter → Sampling → Enrichment → beforeSend → Transport.send()
  │     └── Manages Collectors (Map), Plugins (array), Scope, state machine
  ├── client/transport.js       — send() → internal queue → batch → fetch/beacon/image (with retry)
  ├── collector/error.js        — window.onerror, unhandledrejection, resource error → client.capture()
  ├── collector/performance.js  — PerformanceObserver (resource/longtask), web-vitals (lazy), memory
  ├── collector/behavior.js     — click, history hijack, XHR/Fetch hijack → scope.addBreadcrumb()
  ├── core/config.js            — default options
  └── core/scope.js             — breadcrumbs + user info container, decouples Client from Collectors
```

### Key design decisions

- **Pipeline**: ordered middleware chain. Each fn receives an event, returns event (or null to drop). Registered via `client.use(fn)`. Execution order is guaranteed.
- **Scope pattern**: Collectors write to `client.getScope()`; Enrichment reads from it. Client never queries a specific Collector.
- **Collector vs Plugin vs Middleware**: Collectors produce events via `client.capture()`; Plugins have lifecycle (`setup`/`teardown`) but don't produce events; Middleware are pure functions in the pipeline.
- **Lazy loading**: `web-vitals` and future plugins are loaded via dynamic `import()`. They are marked as `external` in vite.config.js so they don't bundle.
- **Session persistence**: sessionId stored in `sessionStorage`, survives page refreshes.
- **Sampling**: per-type sampleRate falls back to global `sampleRate`. Error 100%, performance 50%, behavior 30% by default.
- **Config validation**: `dsn` is required at construction time; `sampleRate` range-checked.
- **Error isolation**: Pipeline middleware errors and Collector `setup`/`teardown` errors are caught individually — one failure doesn't crash the whole SDK.
- **Transport fallback chain**: `fetch POST → sendBeacon → Image beacon`, with exponential backoff retry (1s→2s→4s).
