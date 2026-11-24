# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.14.0] - 2026-11-24

### Added

- **EchoTrail for Windows processes** (off by default; Settings → Windows
  processes). Select `svchost.exe`, `evil.dll` or a path to one and the card
  shows how that process normally behaves: who usually starts it, publisher and
  signature, and with an EchoTrail Team key the top grandparents, parents,
  children, paths and SHA-256 hashes. Rare values read `<0.1%`, never 0%.
  Right-click → 4NTL → **EchoTrail only** looks up any one name, such as a
  service. The card is wider only for EchoTrail. Switching it on asks the
  browser for api.echotrail.io; while it's off, 4NTL behaves exactly as before.

## [0.13.1] - 2026-11-24

### Fixed

- **Copy card as image in the toolbar popup** pictured the web page under the
  popup instead of the card (a popup isn't part of the tab's screenshot). The
  popup no longer offers it; "Copy details as text" works there as before.
- **Card width**: a narrow window or embedded frame that squeezed the card was
  remembered as your chosen width, so later cards opened narrow everywhere. Only
  a width you drag the corner to is kept now.
- **Memory**: the card no longer keeps a small closure for every copy or save
  feedback until it closes; each timer forgets itself once it has run.

## [0.13.0] - 2026-11-24

### Added

- **Look up another**: a magnifier on the result card takes you back to the
  typing box, with the last value already there and selected, so you can check
  the next indicator without closing and reopening the card or the popup.
- **The eye turns as the card appears**: in the Sharingan theme, the 4NTL eye in
  the card header makes one anticlockwise turn when the card opens, and keeps
  turning anticlockwise while results load (it used to turn clockwise, and only
  while loading). Off when the system asks for reduced motion.

### Removed

- **Check what’s here** (right-click a button, card, image or cell): it was
  unreliable on real pages. Right-click a link → **Check this link**, select the
  text → **Look up**, or **Type an IP or domain…** instead.

## [0.12.0] - 2026-11-22

### Added

- **More defanged forms look up as they are**: spaced dots (`evil [dot] com`,
  `8.8.8 (.) 8`) and half-bracketed dots (`evil[.com`, `evil.]com`), on top of
  `1.2.3[.]4`, `evil(dot)com`, `hxxps[://]…` and the rest. Works everywhere you
  can look something up: right-click, the typing box, the toolbar popup and the
  address bar.

## [0.11.0] - 2026-11-22

### Changed

- **Logo, final form**: the sealed eye's centre is now three crescent blades
  that grow out of the hieroglyph band and curl into needle-thin tails around
  the pupil. Same shape in the toolbar icon and the Sharingan card's eye; a test
  keeps the two in sync.

## [0.10.0] - 2026-11-22

### Changed

- **New logo**: an Eternal-style Mangekyo sealed inside a band of Egyptian
  hieroglyphs (ankh, eye, water, sun, djed, feather, shen, reed). The toolbar
  icon drops the tiny glyphs at small sizes so it stays sharp, and the eye in
  the Sharingan card header matches it (in your accent color). README
  screenshots refreshed.

## [0.9.0] - 2026-11-22

### Changed

- **Toolbar icon → look-up box**: click the 4NTL icon, type or paste an IP,
  domain, URL or hash, press Enter. An IP is checked on VirusTotal and
  AbuseIPDB; a hash, domain or URL on VirusTotal. (The icon used to check the
  page you were on; right-click → 4NTL → Check what's here still checks links.)

## [0.8.0] - 2026-11-16

### Added

- **Type it in**: right-click anywhere → **4NTL** → **Type an IP or domain…**
  opens the card with a box; type or paste an IP, domain, URL or hash and press
  Enter. Keys typed there never trigger the page's own shortcuts.
- **Vendor logos**: a small VirusTotal and AbuseIPDB mark before each name on
  the card, in colors that follow the theme.

## [0.7.2] - 2026-11-05

### Changed

- **One package for Chrome and Firefox**: `4ntl-vX.Y.Z.zip` installs in any
  Chromium browser and in Firefox; `4ntl-firefox-vX.Y.Z.zip` is gone. The store
  edition is likewise one `4ntl-store-vX.Y.Z.zip` for both stores.

## [0.7.1] - 2026-11-05

### Fixed

- **Copy card as image** works in windows that aren't regular tabs (app and
  side windows): it pictures the window you clicked in instead of giving up.
- When the picture can't be taken because 4NTL was rebuilt but not reloaded,
  the card says so and what to do ("No screenshot." before).

## [0.7.0] - 2026-11-05

### Added

- **Resize the card**: drag its bottom-right corner to make it wider (280 to
  720 px). The width is remembered for the next cards.

### Fixed

- Firefox for Android: the minimum version is 142, the first with the data
  collection consent 4NTL declares (clears a Mozilla lint warning).

## [0.6.2] - 2026-11-03

0.6.1 was tagged but never released (a test needed a taller window on Linux);
its changes ship here.

### Fixed

- **Copy card as image** now says what happened, right in the card: copied,
  saved to Downloads (pages that don't allow copying pictures), or why it
  couldn't take the picture. Before, the only sign was a tooltip.
- A card shown inside a frame is pictured correctly (the crop used to miss it).

### Changed

- The Support links go to Buy Me a Coffee (buymeacoffee.com/boode).

## [0.6.0] - 2026-11-03

### Added

- **Copy card as image**: a picture of the card itself (theme, flags and all) on
  the clipboard, ready to paste into a ticket or chat. On plain http pages, where
  browsers don't allow copying images, it's saved to Downloads instead. "Copy
  details as text" stays.
- **Point and press**: with nothing selected, **Alt+Shift+L** looks up what the
  pointer is over. Works in consoles that replace the right-click menu or block
  selecting text.
- **Work inside embedded frames from other sites** (settings, off by default): for
  web apps that show their data in a frame 4NTL couldn't reach.

### Changed

- The right-click menu is one entry, **4NTL**, with the choices inside it
  (**Look up “…”**, one provider, **Check this link**, **Check what’s here**).
- "Check what’s here" finds far more destinations: links hidden under a
  transparent layer (whole-card links), links inside the card or row you clicked,
  more data attributes, and, when there's no link at all, the IP, domain or hash
  written in the cell, label or text field you clicked.

## [0.5.2] - 2026-10-31

### Changed

- Every edition now records when it was first installed (on this computer and
  in browser sync; nothing is sent anywhere). People who install the free store
  version before 15 November 2026 keep it free for life when the paid store
  version arrives as an update.

## [0.5.1] - 2026-10-31

Same as 0.5.0 (which was tagged but never released): a browser test now has
room for the card on every operating system.

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
