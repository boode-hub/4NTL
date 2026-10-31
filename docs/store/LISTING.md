# Chrome Web Store submission

Everything to paste into the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole), section by
section. Images are in this folder; the upload zip comes from `npm run store`.

## Package

- Upload: `4ntl-store-vX.Y.Z.zip` from the repo root (made by `npm run package:store`,
  which refuses to run until the ExtensionPay ID is set in `src/core/license.ts`).
  Never upload `4ntl-vX.Y.Z.zip`: that is the free GitHub edition.
- Account: Trader (the store edition takes payments).
- When asked, tick **"Contains in-app purchases"**.

## Store listing

**Name** (from the manifest): 4NTL – Threat Intel Lookup

**Summary** (from the manifest, 132 chars max):

> Select an IP, hash, domain or URL, right-click, and see VirusTotal and AbuseIPDB verdicts right where you are.

**Description:**

```
Stop copy-pasting indicators into VirusTotal and AbuseIPDB.

★ Install before 15 November 2026 and 4NTL is free for you, for life. After that: a 3-day free trial, then $2 once (no subscription). Prefer free? The open-source edition is on GitHub.

Select an IP address, domain, URL or file hash on any page, right-click, and 4NTL shows the verdict in a small card right next to your cursor. No new tabs, no copy-paste, no losing your place.

BUILT FOR ANALYSTS
• One click: right-click → 4NTL → AbuseIPDB, VirusTotal or All providers. Or select and press Alt+Shift+L.
• Reads analyst text: defanged indicators (1.2.3[.]4, hxxps://evil[.]com), ip:port, [IPv6]:port, log fields like src=1.2.3.4. Select a whole log line and pick the indicator you want.
• Links and buttons: right-click any link, button or card to check where it really goes, even when the site hides the address in JavaScript. For buttons that only get an address when clicked, click once: 4NTL catches the destination and stops the page from going there.
• Unwraps protected links: Outlook Safe Links, Proofpoint, Barracuda, Google, Facebook, YouTube, Slack and LinkedIn redirects are checked as the real destination.
• Toolbar and address bar: click the 4NTL icon to check the page you're on, or type "4ntl" + space in the address bar and paste anything.
• Copy the indicator or the whole report as text, ready for a ticket.
• Saved list: bookmark indicators from the card as you investigate, then copy them all (one per line, ready for a block list) or download a CSV.
• Country flags next to each country.
• IPv4, IPv6, domains, URLs, MD5, SHA-1 and SHA-256.

PRIVATE AND LIGHT
• Uses your own free VirusTotal and AbuseIPDB API keys, stored only in your browser and never synced.
• Private and internal addresses (10.x, 192.168.x, .local, .corp, …) are never sent anywhere.
• Never submits anything for analysis: it only reads existing reports.
• Repeat lookups come from a short in-memory cache and don't use your API quota.
• Nothing runs on a page until you use 4NTL there. No analytics, no tracking, no third-party code.

MAKE IT YOURS
• Light, Dark, Auto and Sharingan themes, any accent and card background color, and a card you can drag anywhere.

Free API keys: virustotal.com (4 lookups/min, 500/day) and abuseipdb.com (1,000 checks/day).
Open source: https://github.com/boode-hub/4NTL (free edition there). Like it? Sponsor it on GitHub.

4NTL is not affiliated with or endorsed by VirusTotal, AbuseIPDB or Google. The Sharingan theme is a fan tribute to Naruto by Masashi Kishimoto.
```

**Category:** Developer Tools
**Language:** English

**Graphic assets** (this folder):

| Field                                   | File                                    |
| --------------------------------------- | --------------------------------------- |
| Store icon (128×128)                    | `../../public/icons/icon-128.png`       |
| Screenshots (1280×800)                  | `screenshot-1.png` … `screenshot-5.png` |
| Small promo tile (440×280)              | `promo-small.png`                       |
| Marquee promo tile (1400×560, optional) | `promo-marquee.png`                     |

**Additional fields:**

- Official URL: _none_ (requires a verified domain; leave empty)
- Homepage URL: https://github.com/boode-hub/4NTL
- Support URL: https://github.com/boode-hub/4NTL/issues

## Privacy practices

**Single purpose:**

> Look up IP addresses, domains, URLs and file hashes that the user selects or right-clicks on threat-intelligence services (VirusTotal and AbuseIPDB) and show the results next to the cursor.

**Permission justifications:**

| Permission                                                            | Justification                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextMenus`                                                        | Adds the 4NTL entries to the right-click menu (look up a selection, check a link, check what a button opens). This is the main way the extension is used.                                               |
| `activeTab`                                                           | Gives temporary access only to the tab where the user just invoked 4NTL, to show the result card there and read the selection. The extension never has standing access to any website.                  |
| `scripting`                                                           | Injects the result card, and reads the selection or the right-clicked element, in the tab the user invoked 4NTL on (via activeTab). Injected only on demand; no content scripts run on pages otherwise. |
| `storage`                                                             | Stores the user's own API keys, settings and saved list locally, and keeps recent results in memory so repeat lookups don't use API quota.                                                              |
| Host permission `https://www.virustotal.com/*`                        | Sends the user's lookups to the VirusTotal API with the user's own API key.                                                                                                                             |
| Host permission `https://api.abuseipdb.com/*`                         | Sends the user's IP lookups to the AbuseIPDB API with the user's own API key.                                                                                                                           |
| Host permission `https://extensionpay.com/*` (and its content script) | The optional one-time purchase: ExtensionPay (with Stripe) runs the checkout and tells the extension when the user has paid or restored a purchase. Its script runs only on extensionpay.com.           |

**Remote code:** No, I am not using remote code. (All code ships in the package; the extension's Content-Security-Policy is `script-src 'self'`.)

**Data usage**, tick:

- **Website content**: the text the user selects or the link they right-click is sent to the chosen lookup service, only when the user asks for a lookup.
- **Authentication information**: the user's own API keys, stored locally and sent only to their own service.

Leave every other category unticked. Then certify all three statements:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/boode-hub/4NTL/blob/main/PRIVACY.md

## Firefox Add-ons (AMO)

Submit `4ntl-store-firefox-vX.Y.Z.zip` at <https://addons.mozilla.org/developers/addon/submit/>
("On this site"). The same name, summary, description, screenshots and privacy
policy apply. AMO asks for the source code because the bundle is built: upload a
zip of the repository (without `node_modules`) and give these build steps:

```
Node.js 22+, then: npm ci && npm run build   → dist-firefox/ is the add-on
```

Data collection (declared in the manifest, shown at install): website content
(the indicator the user looks up) and authentication information (the user's
own API keys), both sent only to the service the user picked.

## Distribution

- Payments: free
- Visibility: Public (or Unlisted to try it with a direct link first)
- Regions: all

## Notes for the reviewer (Test instructions)

```
4NTL needs the user's own free API keys, which are entered in the settings page.
To test: install, open the settings page (it opens automatically), paste a VirusTotal and/or AbuseIPDB API key, then select an IP such as 185.220.101.4 on any web page, right-click → 4NTL → All providers. Without keys, the card explains that a key is needed and links to the settings.
The extension only reads existing reports; it never submits content for analysis.
```
