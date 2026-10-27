# 4NTL — threat-intel lookups from the right-click menu

Select an IP, domain, URL or file hash on any page, right-click, and see the
**VirusTotal** and **AbuseIPDB** verdicts in a small card right where you are.
No more copy → new tab → paste → enter → back.

- **One click:** right-click → **4NTL** → AbuseIPDB / VirusTotal / All providers,
  or press **Alt+Shift+L** to check the selection everywhere.
- **Understands analyst text:** defanged IOCs (`1.2.3[.]4`, `hxxps://evil[.]com`),
  `ip:port`, `[IPv6]:port`, `src=1.2.3.4` log fields, quotes and brackets.
  Select a whole log line with several IOCs and it lets you pick one.
- **Supported indicators:** IPv4, IPv6, domains, URLs, MD5, SHA-1, SHA-256.
  AbuseIPDB checks IP addresses only; VirusTotal checks everything.
- **Saves quota:** results are cached (30 min by default, in memory only), and
  identical requests are never sent twice.
- **Private by default:** private and reserved addresses (10/8, 192.168/16,
  fe80::/10, …) are never sent anywhere. API keys stay in this browser profile.
- **Light on memory:** nothing runs on a page until you use 4NTL there. No
  background polling, no runtime dependencies.
- **Works on restricted pages too:** on browser pages, the PDF viewer or the
  Web Store, results open in a small window instead.

## Install

Chromium-based browsers (Chrome, Edge, Brave), version 120 or later.

1. Download `4ntl-vX.Y.Z.zip` from the releases page and unzip it, or build it
   yourself (see [Development](#development)) and use the `dist/` folder.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.
4. The settings page opens. Paste your API keys. **Test** checks each one.

API keys are free:

- VirusTotal: <https://www.virustotal.com/gui/my-apikey> (4 lookups/min, 500/day)
- AbuseIPDB: <https://www.abuseipdb.com/account/api> (1,000 checks/day)

## Reading the card

| Verdict        | VirusTotal                                    | AbuseIPDB                  |
| -------------- | --------------------------------------------- | -------------------------- |
| **Malicious**  | 3 or more vendors flag it malicious           | abuse confidence 75–100%   |
| **Suspicious** | 1–2 malicious, or any suspicious              | abuse confidence 25–74%    |
| **Clean**      | analysed, nothing flagged                     | abuse confidence below 25% |
| **Unknown**    | VirusTotal has never seen it / never analysed | —                          |

The raw numbers are always shown next to the verdict, and **Full report ↗**
opens the provider's page. **Esc** or a click elsewhere closes the card;
the copy button copies the cleaned-up (refanged) indicator.

## Development

Requires Node.js 22+ (see `.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` rebuilds `dist/` on every change: load `dist/` as an unpacked
extension, then hit the reload icon on `chrome://extensions` after edits.

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm run build`         | Production build into `dist/` + release checks            |
| `npm test`              | Unit tests (Vitest)                                       |
| `npm run test:coverage` | Unit tests with coverage thresholds (90% lines/functions) |
| `npm run e2e`           | End-to-end tests: real Chromium with the extension loaded |
| `npm run lint`          | ESLint (strict, type-aware)                               |
| `npm run typecheck`     | TypeScript, strict mode                                   |
| `npm run check`         | Everything CI runs, except e2e                            |
| `npm run package`       | Build and zip into `4ntl-vX.Y.Z.zip`                      |
| `npm run icons`         | Regenerate the PNG icons from code                        |

First-time e2e setup: `npm run e2e:install` downloads Playwright's Chromium.
If your machine blocks running programs from `%LOCALAPPDATA%` (common with
corporate application control), put the browser somewhere allowed by setting
`PLAYWRIGHT_BROWSERS_PATH` (for example to `.cache/ms-playwright` inside the
repo, which git ignores) before both `e2e:install` and `e2e`.

### Project layout

```
src/
  core/        pure logic: indicator parsing, IP ranges, settings, cache, message types
  providers/   one module per threat-intel service + shared HTTP handling
  background/  service worker: menus, shortcut, lookup service, message router
  ui/          the result card (shared by the page overlay and the fallback window)
  content/     on-demand page script that hosts the card
  options/     settings page
  result/      fallback window for pages that can't host the card
scripts/       build, manifest, release guard, packaging, icon generator
e2e/           Playwright tests
tests/         shared test helpers and recorded API responses
docs/          architecture, how to add a provider, roadmap
```

More: [architecture](docs/ARCHITECTURE.md) · [adding a provider](docs/ADDING_A_PROVIDER.md) ·
[security](SECURITY.md) · [roadmap](docs/NEXT.md) · [changelog](CHANGELOG.md)
