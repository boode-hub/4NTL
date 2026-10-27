# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
