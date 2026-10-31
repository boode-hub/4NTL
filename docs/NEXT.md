# Next steps

Where the project stands and what is worth doing next, roughly in order of
value. Update this file whenever work stops mid-way.

## Status (2026-10-31)

v0.4.0 (2026-10-31) adds the copy menu, saved list, card background color,
country flags and a Firefox build. ~530 unit/load tests and 31 e2e tests
(incl. performance, memory-leak and hostile-page suites) pass. The Chromium
build was smoke-tested in Edge 156; the Firefox build passes `web-ext lint` but
has not been run in a real Firefox yet (no automated Firefox e2e). Measured:
first card ~100-170 ms, median lookup ~15-25 ms, no DOM/listener growth over
100+ lookups. Published to boode-hub/4ntl (public) and BOoDe007/4ntl (private).
API mapping is verified against recorded responses; there is no automated live
check against the real APIs.

## Ideas

- **Toolbar popup with a search box**: paste an indicator and see the same card
  (reuse `ResultCard` in inline mode). Useful when the IOC is in a terminal or
  ticket outside the browser.
- **Bulk lookup**: when a selection has several indicators, offer "check all"
  with a compact table, respecting each provider's rate limit (queue).
- **More providers**: GreyNoise, AlienVault OTX, Shodan, URLhaus/ThreatFox,
  IPinfo. See [ADDING_A_PROVIDER.md](ADDING_A_PROVIDER.md).
- **Configurable verdict thresholds** (currently constants in each provider).
- **Client-side rate limiting** for the VirusTotal free tier (4/min): queue
  instead of failing with "quota reached".
- **Firefox e2e**: drive `dist-firefox/` with `web-ext run` or Playwright's
  Firefox to cover the same suite; then publish on AMO.
- **Saved list extras**: notes per entry, re-check all, export as STIX/MISP.
- **Localisation** via `chrome.i18n` (all strings are English today).
- **Store uploads in the release workflow** (Chrome Web Store, Edge Add-ons, AMO).
  Listing text and images are in [store/](store/LISTING.md).
- **Pin GitHub Actions to commit SHAs** once the repo is on GitHub.
