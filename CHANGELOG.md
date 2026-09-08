# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-09-08

Compatibility release for Google's 2026 rebrand. NotebookLM is now **Gemini
Notebook** and has moved to `notebook.google.com`; `notebooklm.google.com`
answers with a **301 permanent redirect**. That one change, plus an Angular
rewrite that reshaped much of the DOM, broke authentication, source ingestion,
answer extraction and audio status detection. Everything below was verified
against the live signed-in app on 2026-09-08.

### Fixed

- **Login was never detected.** Every success check was
  `url.startsWith("https://notebooklm.google.com/")`. After the 301 the browser
  sits on `notebook.google.com`, so the check could never pass: `setup_auth`,
  `re_auth` and auto-login all ran to their full timeout and reported failure
  on a session that had actually signed in. Host comparison now goes through
  `notebooklm/urls.ts` and accepts both hosts.
- **`add_source` could not open its dialog.** The notebook cover mounts an
  emoji picker whose palette is a permanently-present, invisible `0x0`
  `div[role="dialog"]` that sorts **before** real modals in document order. The
  overlay anchor was a bare `[role="dialog"]` resolved with `.first()`, so it
  latched onto that palette: waits for `visible` timed out, waits for `hidden`
  returned instantly, and every dialog-scoped lookup searched the wrong
  subtree. Anchored on `mat-dialog-container` instead.
- **The "Add source" button selector matched nothing.** Buttons are now wrapped
  in `nb-button` custom elements with the semantic class on the *wrapper*, so
  `button.add-source-button` never matched. Uses `.add-source-button button`.
- **The URL field is no longer an `<input>`.** The URL step renders a
  `textarea` inside `mat-form-field.urls-input` (it accepts several
  newline-separated URLs). `input[type="text"]` matched nothing.
- **Answers arrived with the model's reasoning glued to the front.** Responses
  now embed a `thinking-chain-view` block inside `.message-text-content`, so
  extraction returned `"Thoughts Defining X... expand_moreThe real answer…"`.
  Extraction targets `labs-tailwind-structural-element-view-v2` and strips
  icon glyphs welded to adjacent text.
- **`generate_audio` never started a render.** Clicking the Studio card only
  opens a "Customize Audio Overview" dialog; nothing happens until its
  Generate button is pressed. Without `custom_prompt` the old code stopped
  after the card click and still reported `started`, leaving the dialog open.
  Both paths now go through the dialog.
- **`get_audio_status` reported `ready` immediately.** The in-progress and
  finished tiles are the same `artifact-library-item` element, so "a tile
  exists" was not a readiness signal — `download_audio` then ran against a
  placeholder. Readiness is now the absence of the `.shimmer-blue` loading
  class. The tile's `mat-icon` is deliberately unused: it alternates between
  `sync` and `audio_magic_eraser` while generating.
- **First-run accounts hung on every call.** A Google account that has never
  opened the product gets a blocking "Welcome to Gemini Notebook"
  `legal-notice-dialog`; its backdrop swallows every click underneath. Now
  dismissed automatically on session start and before opening the add-source
  dialog. The marketing opt-in checkbox is explicitly left unchecked.
- **`sessionStorage` was never restored.** Its origin guard compared the page
  URL against the configured notebook URL by string equality, which the 301
  broke for any saved `notebooklm.google.com` entry.
- **The first question of every session timed out.** patchright 1.56.0's
  `Locator.last()` resolves to nothing when the locator matches exactly one
  element — the state on a session's first answer. Answer extraction caught
  the timeout, returned `null`, and the poller burned the full answer timeout
  for a response that was on screen the whole time. Worked around in
  `utils/locators.ts`; a test asserts when the workaround can be dropped.
- **`ignoreTexts` never matched.** `snapshotPriorAnswers` read raw containers
  while the poller compared thinking-stripped text, so every prior-answer
  entry was a guaranteed miss. Both now use the same extraction path.
- **Long answers could never settle.** A response containing "thinking",
  "searching" or "loading" matched the loading-placeholder list and was
  rejected on every poll. The substring test is now limited to text short
  enough to actually be a placeholder.
- **Notebook cards on the home page.** `button[aria-labelledby*="project-"]`
  is gone; cards are `project-button` elements.
- **`?authuser=` was being stripped from notebook URLs.** It is one of the two
  ways Google selects an account, so dropping it reopened the notebook as the
  browser's *default* account — for a notebook owned by a secondary account
  that lands on an "Access Request" page. Preserved alongside `/u/<n>/`.
- **The version in the MCP handshake was hardcoded** in three places and had
  drifted to `2.0.0`. Now read from `package.json`, so the version a client
  reports in a bug report is the version that is running.

### Added

- `src/notebooklm/urls.ts` — one place that owns the notebook host, with
  normalisation, `/u/N/` multi-account preservation and 301-tolerant origin
  comparison. Library entries, session cache keys and `NOTEBOOK_URL` all pass
  through it, so legacy URLs keep working and stop spawning duplicate sessions.
- `src/notebooklm/dialogs.ts` — blocking-modal dismissal.
- `src/utils/locators.ts` — the `.last()` workaround, documented.
- **A test suite** (`npm test`, 48 assertions). Selectors run with real
  Playwright syntax against a fixture reproducing the live DOM, so
  `:has-text()` / `:text-is()` / `:has()` are actually exercised. Every 2026
  breakage is asserted twice: the new selector works, and the pre-2026 one
  matches nothing. No network, no Google account, no credentials needed.

### Changed

- Selector registry rewritten around Angular component tags, which the 2026
  layout made the most stable anchor. Documents the nine Studio artifact types
  (Audio Overview, Slide Deck, Video Overview, Mind Map, Reports, Flashcards,
  Quiz, Infographic, Data Table).
- Docs and tool descriptions now use `notebook.google.com`.

### Compatibility

Existing library entries and `NOTEBOOK_URL` values on `notebooklm.google.com`
are normalised automatically — no user action required. Saved cookies are
unaffected: they were always scoped to `google.com`.

## [2.0.0] - 2026-04-30

Major release that closes the issue backlog and replaces the brittle parts of
the v1.x extraction stack with a single source of truth. v1 is no longer
supported.

### Added

- **Streamable-HTTP transport** (`--transport http --port 3000`) using the
  MCP SDK's `StreamableHTTPServerTransport`. Supports the spec's session
  header model so multiple clients can share one server. Closes #4 / #7.
- **`add_source` tool** for programmatic source ingestion (URL or pasted text,
  with auto-confirmed insertion and source-count verification). Closes #25.
- **Audio Overview tools**: `generate_audio` + `download_audio`. Audio is the
  most-asked Studio output; Video / Infographic / Slides are tracked for a
  follow-up. Closes #11 (audio scope).
- **Citations on `ask_question`**: new `source_format` argument (`none`,
  `inline`, `footnotes`, `json`) populates a structured `sources[]` field
  by reading the DOM citation panel after the answer settles. Closes #20.
- **Multi-account support** via `--account <name>` / `NOTEBOOKLM_ACCOUNT`.
  Each account gets an isolated Chrome profile under
  `~/.local/share/notebooklm-mcp/accounts/<name>/`. No credential storage —
  authentication is still handled by Chrome's persistent profile. Closes #2.
- **Bundled-Chromium fallback** (`BROWSER_CHANNEL=chromium` /
  `NOTEBOOKLM_BROWSER_CHANNEL=chromium`). Used automatically when system
  Chrome refuses to launch. Closes #13 (macOS Tahoe), #19 (Windows exit 21).
- **`ANSWER_TIMEOUT_MS`** env var + `browser_options.timeout_ms` parameter
  to override the answer wait. Default raised to 600 s. Closes #14, #27.
- **Provenance envelope** on `ask_question` results: `_provenance` field +
  AI-generated marker prefix (`NOTEBOOKLM_AI_MARKER=false` to opt out).
  Closes #42.

### Changed

- **Streaming-stability answer detection** replaces the broken
  `div.thinking-message` poll. Answers settle when the text is identical
  across N consecutive 750 ms polls. Robust against the 2026 NotebookLM UI
  changes that broke v1.x. Closes #43.
- **`FOLLOW_UP_REMINDER` is opt-in** via `NOTEBOOKLM_FOLLOW_UP_REMINDER=true`.
  The previous default tripped prompt-injection guards on safety-trained
  host agents. Closes #28.
- **Selector registry** (`src/notebooklm/selectors.ts`) is now the single
  source of truth for every CSS / aria selector targeting NotebookLM. UI
  changes from Google now require touching exactly one file.
- **Browser-launch lifecycle** moved into a dedicated module with profile
  strategy fallback (`auto` → isolated profile when the base profile is
  locked) and aggressive shutdown watchdog. Closes #29.
- **Watchdog poll loop**: bounded poll count + Node-side sleep fallback +
  periodic `page.evaluate(() => true)` health check. Defuses zombie tabs
  that previously turned the answer wait into a 100 % CPU spin. Closes #16.
- **Resource error message** for unknown URIs now lists the supported set
  (`notebooklm://library`, `notebooklm://library/{id}`, `notebooklm://metadata`).
  Closes #15.
- **Library metadata accessors** in `src/library/metadata.ts` defend against
  notebooks loaded from disk that omit `topics`/`use_cases`/`content_types`.
  Replaces the bare `.join()` / `.map()` calls that crashed
  `buildAskQuestionDescription`. Closes #33.

### Tooling

- ESLint flat config + Prettier added with `npm run lint`, `npm run format`,
  `npm run check`. Build is now type-safe with no `any` casts and DOM types
  enabled for in-page evaluations.
- TypeScript `lib` widened to `["ES2022", "DOM", "DOM.Iterable"]`.
- New tools registered in MCP profile: `add_source`, `generate_audio`,
  `download_audio` (full profile only by default).

### Removed

- Hard-coded `120 000 ms` answer timeout in `BrowserSession.ask`.
- Unused `ServerState` interface and the dead `as any` chain across
  resource handlers, browser session, shared-context manager, and the
  config env-override path.
- Reliance on `div.thinking-message` for answer completion.

### Migration Notes

- v1 callers that depended on the old answer prefix should set
  `NOTEBOOKLM_AI_MARKER=false` if they want the unprefixed answer back.
- v1 callers that depended on the appended follow-up reminder must opt in
  via `NOTEBOOKLM_FOLLOW_UP_REMINDER=true`.
- The default answer timeout grew from 120 s to 600 s. Lower it explicitly
  via `ANSWER_TIMEOUT_MS` if you relied on the 2-minute ceiling for
  fail-fast behaviour.

## [1.2.0] - 2025-11-21

### Added
- **Tool Profiles System** - Reduce token usage by loading only the tools you need
  - Three profiles: `minimal` (5 tools), `standard` (10 tools), `full` (16 tools)
  - Persistent configuration via `~/.config/notebooklm-mcp/settings.json`
  - Environment variable overrides: `NOTEBOOKLM_PROFILE`, `NOTEBOOKLM_DISABLED_TOOLS`

- **CLI Configuration Commands** - Easy profile management without editing files
  - `npx notebooklm-mcp config get` - Show current configuration
  - `npx notebooklm-mcp config set profile <name>` - Set profile (minimal/standard/full)
  - `npx notebooklm-mcp config set disabled-tools <list>` - Disable specific tools
  - `npx notebooklm-mcp config reset` - Reset to defaults

### Changed
- **Modularized Codebase** - Improved maintainability and code organization
  - Split monolithic `src/tools/index.ts` into `definitions.ts` and `handlers.ts`
  - Extracted resource handling into dedicated `ResourceHandlers` class
  - Cleaner separation of concerns throughout the codebase

### Fixed
- **LibreChat Compatibility** - Fixed "Server does not support completions" error
  - Added `prompts: {}` and `logging: {}` to server capabilities
  - Resolves GitHub Issue #3 for LibreChat integration

- **Thinking Message Detection** - Fixed incomplete answers showing placeholder text
  - Now waits for `div.thinking-message` element to disappear before reading answer
  - Removed unreliable text-based placeholder detection (`PLACEHOLDER_SNIPPETS`)
  - Answers like "Reviewing the content..." or "Looking for answers..." no longer returned prematurely
  - Works reliably across all languages and NotebookLM UI changes

## [1.1.2] - 2025-10-19

### Changed
- **README Documentation** - Added Claude Code Skill reference
  - New badge linking to [notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) repository
  - Added prominent callout section explaining Claude Code Skill availability
  - Clarified differences between MCP server and Skill implementations
  - Added navigation link to Skill repository in top menu
  - Both implementations use the same browser automation technology

## [1.1.1] - 2025-10-18

### Fixed
- **Binary executable permissions** - Fixed "Permission denied" error when running via npx
  - Added `postbuild` script that automatically runs `chmod +x dist/index.js`
  - Ensures binary has executable permissions after compilation
  - Fixes installation issue where users couldn't run the MCP server

### Repository
- **Added package-lock.json** - Committed lockfile to repository for reproducible builds
  - Ensures consistent dependency versions across all environments
  - Improves contributor experience with identical development setup
  - Enables `npm ci` for faster, reliable installations in CI/CD
  - Follows npm best practices for library development (2025)

## [1.1.0] - 2025-10-18

### Added
- **Deep Cleanup Tool** - Comprehensive system cleanup for fresh NotebookLM MCP installations
  - Scans entire system for ALL NotebookLM files (installation data, caches, logs, temp files)
  - Finds hidden files in NPM cache, Claude CLI logs, editor logs, system trash, temp backups
  - Shows categorized preview before deletion with exact file list and sizes
  - Safe by design: Always requires explicit confirmation after preview
  - Cross-platform support: Linux, Windows, macOS
  - Enhanced legacy path detection for old config.json files
  - New dependency: globby@^14.0.0 for advanced file pattern matching
- CHANGELOG.md for version tracking
- Changelog badge and link in README.md

### Changed
- **Configuration System Simplified** - No config files needed anymore!
  - `config.json` completely removed - works out of the box with sensible defaults
  - Settings passed as tool parameters (`browser_options`) or environment variables
  - Claude can now control ALL browser settings via tool parameters
  - `saveUserConfig()` and `loadUserConfig()` functions removed
- **Unified Data Paths** - Consolidated from `notebooklm-mcp-nodejs` to `notebooklm-mcp`
  - Linux: `~/.local/share/notebooklm-mcp/` (was: `notebooklm-mcp-nodejs`)
  - macOS: `~/Library/Application Support/notebooklm-mcp/`
  - Windows: `%LOCALAPPDATA%\notebooklm-mcp\`
  - Old paths automatically detected by cleanup tool
- **Advanced Browser Options** - New `browser_options` parameter for browser-based tools
  - Control visibility, typing speed, stealth mode, timeouts, viewport size
  - Stealth settings: Random delays, human typing, mouse movements
  - Typing speed: Configurable WPM range (default: 160-240 WPM)
  - Delays: Configurable min/max delays (default: 100-400ms)
  - Viewport: Configurable size (default: 1024x768, changed from 1920x1080)
  - All settings optional with sensible defaults
- **Default Viewport Size** - Changed from 1920x1080 to 1024x768
  - More reasonable default for most use cases
  - Can be overridden via `browser_options.viewport` parameter
- Config directory (`~/.config/notebooklm-mcp/`) no longer created (not needed)
- Improved logging for sessionStorage (NotebookLM does not use sessionStorage)
- README.md updated to reflect config-less architecture

### Fixed
- **Critical: envPaths() default suffix bug** - `env-paths` library appends `-nodejs` suffix by default
  - All paths were incorrectly created with `-nodejs` suffix
  - Fix: Explicitly pass `{suffix: ""}` to disable default behavior
  - Affects: `config.ts` and `cleanup-manager.ts`
  - Result: Correct paths now used (`notebooklm-mcp` instead of `notebooklm-mcp-nodejs`)
- Enhanced cleanup tool to detect all legacy paths including manual installations
  - Added `getManualLegacyPaths()` method for comprehensive legacy file detection
  - Finds old config.json files across all platforms
  - Cross-platform legacy path detection (Linux XDG dirs, macOS Library, Windows AppData)
- **Library Preservation Option** - cleanup_data can now preserve library.json
  - New parameter: `preserve_library` (default: false)
  - When true: Deletes everything (browser data, caches, logs) EXCEPT library.json
  - Perfect for clean reinstalls without losing notebook configurations
- **Improved Auth Troubleshooting** - Better guidance for authentication issues
  - New `AuthenticationError` class with cleanup suggestions
  - Tool descriptions updated with troubleshooting workflows
  - `get_health` now returns `troubleshooting_tip` when not authenticated
  - Clear workflow: Close Chrome → cleanup_data(preserve_library=true) → setup_auth/re_auth
  - Critical warnings about closing Chrome instances before cleanup
- **Critical: Browser visibility (show_browser) not working** - Fixed headless mode switching
  - **Root cause**: `overrideHeadless` parameter was not passed from `handleAskQuestion` to `SessionManager`
  - **Impact**: `show_browser=true` and `browser_options.show=true` were ignored, browser stayed headless
  - **Solution**:
    - `handleAskQuestion` now calculates and passes `overrideHeadless` parameter correctly
    - `SharedContextManager.getOrCreateContext()` checks for headless mode changes before reusing context
    - `needsHeadlessModeChange()` now checks CONFIG.headless when no override parameter provided
  - **Session behavior**: When browser mode changes (headless ↔ visible):
    - Existing session is automatically closed and recreated with same session ID
    - Browser context is recreated with new visibility mode
    - Chat history is reset (message_count returns to 0)
    - This is necessary because NotebookLM chat state is not persistent across browser restarts
  - **Files changed**: `src/tools/index.ts`, `src/session/shared-context-manager.ts`

### Removed
- Empty postinstall scripts (cleaner codebase)
  - Deleted: `src/postinstall.ts`, `dist/postinstall.js`, type definitions
  - Removed: `postinstall` npm script from package.json
  - Follows DRY & KISS principles

## [1.0.5] - 2025-10-17

### Changed
- Documentation improvements
- Updated README installation instructions

## [1.0.4] - 2025-10-17

### Changed
- Enhanced usage examples in documentation
- Fixed formatting in usage guide

## [1.0.3] - 2025-10-16

### Changed
- Improved troubleshooting guide
- Added common issues and solutions

## [1.0.2] - 2025-10-16

### Fixed
- Fixed typos in documentation
- Clarified authentication flow

## [1.0.1] - 2025-10-16

### Changed
- Enhanced README with better examples
- Added more detailed setup instructions

## [1.0.0] - 2025-10-16

### Added
- Initial release
- NotebookLM integration via Model Context Protocol (MCP)
- Session-based conversations with Gemini 2.5
- Source-grounded answers from notebook documents
- Notebook library management system
- Google authentication with persistent browser sessions
- 16 MCP tools for comprehensive NotebookLM interaction
- Support for Claude Code, Codex, Cursor, and other MCP clients
- TypeScript implementation with full type safety
- Playwright browser automation with stealth mode