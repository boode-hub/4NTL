# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-10-31

### Added

- **Store edition** (Chrome Web Store / Firefox Add-ons): free for life for
  anyone who installs it before 15 November 2026; later installs get a 3-day
  trial, then a one-time $2 unlock through ExtensionPay (Stripe). Purchases and
  early installs are recognised on other computers (browser sync) or with
  **Restore purchase**. Build it with `node scripts/build.mjs --store`;
  `npm run package:store` makes the store zips.
- The **GitHub edition stays free** and contains no payment code (the release
  guard checks this).
- A small **♥ Support 4NTL** link on every card, and a Support section in the
  settings, in both editions.

## [0.4.1] - 2026-10-31

### Added

- "Support 4NTL" in the settings page and README: star the project or sponsor it
  on GitHub. 4NTL stays free and open source.

## [0.4.0] - 2026-10-31

### Added

- **Copy menu**: copy just the indicator, or the full report as plain text
  (every provider's verdict, details and report link) for tickets and chats.
- **Saved list**: the bookmark on a card saves the indicator (with its verdict,
  summary and country) to a list that stays until you clear it. The list page
  filters by type or verdict, copies all indicators one per line (for block
  lists) or downloads them as CSV. Open it from the card, from the toolbar
  icon's right-click menu, or from the settings page.
- **Card background color** in the settings, with live preview. Text and lines
  switch to dark or light automatically to stay readable.
- **Country flags** next to country names, drawn with a bundled flag font so they
  also show on Windows (which has no flag emoji).
- **Firefox** build (Firefox 140+), `4ntl-firefox-vX.Y.Z.zip`, attached to releases.
  The settings page offers to restore API access if it was withdrawn in Firefox.

### Changed

- "4NTL: check what this opens" also appears on videos and audio (for example,
  video thumbnails that link somewhere).
- When an embedded frame from another site can't host the card, it opens in the
  page's top-right corner instead of a separate window.

## [0.3.2] - 2026-10-28

Reliability, memory and performance review.

### Fixed

- "Click it to check where it goes" only catches navigations that follow your
  own click (or Enter/Space). Page navigations made by the site itself (auto
  refresh, URL updates while scrolling, automatic pop-ups) are no longer caught.
- The window.open hook never overwrites a replacement the page installs later.
- The keyboard shortcut falls back to the main frame when a page's cross-origin
  iframes can't be read.
- A pathological selection (thousands of `)` or punctuation characters) could
  stall the background worker; token cleaning is now linear-time.
- The last right-clicked element is held weakly, so single-page apps can free it.

### Changed

- The card is shown in the browser's top layer, with page styles reset on its
  container: sites' overlays, z-index wars, transforms on `<html>` or global
  CSS (`* { opacity/pointer-events/... }`) can no longer hide or break it.

### Tests

- Load and worst-case-input suite (bursts of 1,000 lookups, cache bounds,
  regex-blow-up probes) and browser performance, memory-leak and hostile-page
  tests.

## [0.3.1] - 2026-10-28

### Changed

- The card opens closer to the pointer: about 3 cm beside it (was 5 cm), still
  clear of the selection or the element you clicked.

## [0.3.0] - 2026-10-28

### Added

- **4NTL: check what this opens** on any button, card or image. The destination is
  read from `#`/`javascript:` links' handlers, data attributes (`data-href`, `data-url`,
  router links…), forms, SVG links and web components.
- JavaScript-only buttons: 4NTL asks you to click once, catches the navigation
  (or `window.open`), stops it, and looks the destination up instead.
- Protected and tracking links are unwrapped to the real destination: Outlook Safe
  Links, Proofpoint URL Defense v1–v3, Barracuda, Google, Facebook, Instagram,
  YouTube, Slack, LinkedIn and Steam.
- Clicking the toolbar icon checks the current page (settings: right-click the icon →
  Options); type `4ntl` + space in the address bar to look anything up.
- The card can be dragged anywhere by its header.

### Changed

- The card opens about 5 cm beside the pointer instead of right under it.

## [0.2.0] - 2026-10-27

### Added

- Themes: Auto, Light, Dark and Sharingan (black and crimson, with a tomoe eye
  that spins while results load), plus a custom accent color. The settings page
  shows a live preview and follows the chosen theme too.
- Right-click any link → **4NTL: check this link** looks up its URL on VirusTotal,
  with the card opening next to the link.
- A Sharingan eye logo for the extension icon.
- `npm run try` opens a browser with the extension and a demo page for manual testing.
- `npm run demo` regenerates the README walkthrough GIF and screenshots.

### Changed

- Requires Chrome/Edge/Brave 123 or later (CSS `light-dark()`).
- Internal hosts (single-label names and `.local`, `.internal`, `.corp`, `.lan`, `.home.arpa`, …),
  as domains or inside URLs, are never sent to providers, like private IPs.
- Changing the theme or the cache lifetime no longer throws away cached results.
- CI: artifact uploads can't fail the build; GitHub Actions updated to v7.

### Fixed

- Long indicators (hashes, URLs) no longer push their type label out of the picker.

## [0.1.0] - 2026-10-27

### Added

- Right-click lookups on VirusTotal and AbuseIPDB (per provider or all at once)
  with an inline result card next to the pointer/selection.
- Keyboard shortcut (Alt+Shift+L) to look up the selection on all providers.
- Indicator detection for IPv4, IPv6, domains, URLs, MD5, SHA-1 and SHA-256,
  including defanged forms, ports, log key/value fields and IDN domains.
- Picker for selections that contain several indicators.
- Private/reserved IP filtering before any request.
- In-memory result cache with configurable lifetime, and request sharing.
- Settings page with key validation, auto-save and cache controls.
- Fallback result window for pages that cannot host the card.
- Unit and end-to-end test suites, CI and release workflows.
