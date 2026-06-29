# Changelog

All notable changes to Lian-Monitor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

#### Core Infrastructure
- Transport: fetch → sendBeacon → Image fallback chain with exponential backoff retry
- Pipeline middleware system (Filter → Sampling → Enrichment → beforeSend)
- Per-type sampling rate with global fallback, plus `sampler` function support
- Deterministic hash sampling (`userId + type`) for stable per-user sampling decisions
- `beforeSend` hook for user-defined event modification/filtering
- `beforeBreadcrumb` hook for filtering/modifying breadcrumbs before storage
- `ignoreErrors` config to suppress known noise via string or regex matching
- `release` and `environment` fields attached to every event
- Device/OS/Browser auto-detection via UA parsing (incl. Samsung Internet, WeChat, UC Browser)
- Session persistence via sessionStorage (survives page refreshes)
- `reportFields` for injecting arbitrary key-value pairs into reports
- Server-directed rate limiting (Retry-After / X-Sentry-Rate-Limits headers)
- Error deduplication with configurable time window
- Queue overflow protection (`maxQueueSize`)
- `pagehide` flush to prevent data loss on page close
- IIFE build format for `<script>` tag usage

#### Error Collector
- `window.onerror`, `unhandledrejection`, and resource error listeners
- `console.error` hijack to capture errors swallowed by try-catch
- Chaining to original `window.onerror` (SDK never silences existing handlers)
- Structured exception format (Sentry-compatible `exception.values`)

#### Performance Collector
- Resource timing monitoring with buffer overflow protection
- Long task detection (LoAF / PerformanceObserver `longtask`)
- Memory sampling (Chrome-specific, capped at 10 samples)
- Web Vitals: LCP, FCP, CLS, TTFB, INP via lazy-loaded `web-vitals` library
- Cross-origin resource transfer size handling
- Self-report URL filtering

#### Behavior Collector
- Click tracking with CSS selector path and element serialization
- Route change tracking (pushState / replaceState / popstate / hashchange)
- XHR/Fetch breadcrumb recording (method, URL, status, duration)
- Console breadcrumbs (log/warn/error) with argument sanitization
- Keypress tracking with element localization
- MPA page-view tracking (page-enter / page-leave)
- Self-report URL filtering across all network interceptors

#### Session Replay (rrweb)
- Full session recording with circular buffer
- Error-attached replay (replay data piggybacks on error events)
- Privacy masking: `maskAllInputs`, `maskTextClass`, `blockClass`, `maskTextSelector`, `blockSelector`
- Custom masking function (`maskTextFn`)
- Configurable checkout intervals (time-based and event-count-based)
- Slim DOM options to reduce payload size
- `beforeEmit` hook for per-event filtering before recording
- `packFn` for custom compression
- `maxDuration` for capping recording sessions
- `attachTo` to control which event types carry replay data

#### Framework Integrations
- Vue: `createVuePlugin` (Vue 3 `errorHandler`)
- React: `createErrorBoundary` (component-level error boundary)
- Angular: `createAngularErrorHandler` (custom `ErrorHandler`)

#### Public API
- `init(options)` — one-call SDK bootstrap
- `client.captureError(error, options)` — manual error reporting
- `client.captureEvent(type, data)` — custom event reporting
- `client.capturePerformance(name, data)` — manual performance metric
- `client.captureMessage(message, level)` — log message reporting
- `client.addBreadcrumb(message, data, level)` — manual breadcrumb
- `client.setUserId(id)`, `client.setTag(key, value)`, `client.setExtra(key, value)`
- `client.lastEventId()` — retrieve last event ID for correlation

#### Error Isolation (2026-06-29)
- Wrapped collector `_capture()` in try-catch to prevent SDK exceptions from blocking original callbacks
- Wrapped behavior `addBreadcrumb` calls in try-catch inside fetch/console interceptors
- SDK internal errors no longer propagate to business code

#### Backward Compatibility (2026-06-29)
- SDK version injected at build time from `package.json` (no more hardcoded version)
- `schema_version` field added to every event for backend format detection
- Config deprecation layer (`normalizeConfig`) with automatic migration and `console.warn`

### Changed

- Error events restructured to Sentry-compatible `exception.values` format

### Fixed

- Original `window.onerror` properly called after SDK handler
- Transport payload unified as `{ events: [...] }` across all three delivery methods
- Web-vitals race condition with `_active` guard after async import
- Infinite memory sampling timer capped at 10 samples
- Queue deadlock after rate limit expiry (deferred flush scheduling)
- `NaN` guard on unparseable `Retry-After` date header
- XHR listener lifecycle across `open()` reuse
- Session summary unconditional send on pagehide (previously skipped when no breadcrumbs)
- Always fetch fresh contexts for SPA route changes
- Deprecated `textContent` removed from click breadcrumbs
- Query params sanitized in XHR/Fetch breadcrumb URLs

---

## Versioning Strategy

| Change | Semver | Schema Version | Action |
|---|---|---|---|
| New optional field in event payload | PATCH | unchanged | Backend ignores unknown field |
| New event type | MINOR | unchanged | Backend handles new type |
| Rename/remove existing field | MAJOR | incremented | Backend checks `schema_version` |
| New config option | MINOR | — | No user action needed |
| Rename config option | MAJOR | — | Deprecation warning for one major cycle |
| Remove config option | MAJOR | — | Error in `normalizeConfig` |
