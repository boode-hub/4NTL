# Next steps

Where the project stands and what is worth doing next, roughly in order of
value. Update this file whenever work stops mid-way.

## Status (2026-10-28)

v0.3.2 (2026-10-28) follows a full review: ~510 unit/load tests and 29 e2e
tests (incl. performance, memory-leak and hostile-page suites) pass. Measured:
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
- **Firefox**: generate a Firefox manifest variant in `scripts/manifest.mjs`
  (`background.scripts`, `browser_specific_settings`) and request host
  permissions at runtime from the settings page.
- **Localisation** via `chrome.i18n` (all strings are English today).
- **Chrome Web Store / Edge Add-ons listing**: screenshots, privacy policy
  (SECURITY.md covers the content), and a store upload step in the release workflow.
- **Pin GitHub Actions to commit SHAs** once the repo is on GitHub.
