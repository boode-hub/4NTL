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

## Store edition: before the first store upload

The paid store edition is built (v0.5.0, decided 2026-10-31): installs before
**15 November 2026** are free for life; later installs get a **3-day trial**,
then **$2 once** via ExtensionPay. The GitHub edition stays free.

Still to do, in order:

1. Owner: developer dashboard → Account → Trader status → **Trader**.
2. Owner: create the extension at <https://extensionpay.com> (connect Stripe;
   one-time payment, $2) and send the ExtensionPay ID.
3. Put the ID in `EXTPAY_ID` (`src/core/license.ts`), run `npm run package:store`
   (it refuses to package the placeholder), and test a real purchase with Stripe's
   test card in ExtensionPay's test mode, plus **Restore purchase** in a second
   browser profile.
4. Upload `4ntl-store-v0.5.0.zip` before 15 November so early installs count.
5. After 15 November, publish one small update so new installs carry a build
   date after the switch (a clock set back can't fake an early install).

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
