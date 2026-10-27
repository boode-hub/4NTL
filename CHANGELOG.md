# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
