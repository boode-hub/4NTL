# Chrome Web Store submission

Everything to paste into the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole), section by
section. Images are in this folder; the upload zip comes from `npm run store`.

## Package: two phases

**Phase 1, now (account: non-trader, while trader verification is pending).**
Upload the free build `4ntl-vX.Y.Z.zip` (from `npm run package`, or the GitHub
release). It has no payment code, so: do **not** tick "Contains in-app purchases",
and skip the extensionpay.com row in the permission table. It records each
user's install date, so everyone who installs before 15 November 2026 keeps 4NTL
free for life after phase 2.

**Phase 2, after trader verification and ExtensionPay are ready.** Switch the
account to Trader, then on the same item upload `4ntl-store-vX.Y.Z.zip` as an
update (from `npm run package:store`, which refuses to run until the
ExtensionPay ID is set in `src/core/license.ts`). Tick **"Contains in-app
purchases"**, add the extensionpay.com permission justification, and use the
phase 2 line in the description.

## Store listing

**Name** (from the manifest): 4NTL – Threat Intel Lookup

**Summary** (from the manifest, 132 chars max):

> Select an IP, hash, domain or URL, right-click, and see VirusTotal and AbuseIPDB verdicts right where you are.

**Description** (no lists of brand names or long keyword runs: the first upload was rejected as "Yellow Argon", excessive keywords, for listing redirect services by name):

```
Stop copy-pasting indicators into threat-intel sites.

★ Install now and 4NTL stays free for you, for life.

Select an IP address, domain, URL or file hash on any page, right-click, and 4NTL shows the VirusTotal and AbuseIPDB verdicts in a small card right next to your cursor. No new tabs, no copy-paste, no losing your place.

BUILT FOR ANALYSTS
• One click from the right-click menu, or select and press Alt+Shift+L.
• Understands analyst text: defanged indicators such as 1.2.3[.]4 or hxxps://evil[.]com, addresses with ports, and log fields. Select a whole log line and pick the indicator you want.
• Checks where links and buttons really go, even when a site hides the address in JavaScript. For buttons that only get an address when clicked, click once: 4NTL catches the destination and stops the page from going there.
• Sees through the protected and redirect links that email security tools and social sites add, and checks the real destination.
• Check the page you're on from the toolbar icon, or type "4ntl" and a space in the address bar and paste anything.
• Copy just the indicator, or the whole report as text for a ticket.
• Saved list: keep the indicators you find during an investigation, then copy them all at once or download a CSV.
• Country flags at a glance.

PRIVATE AND LIGHT
• Uses your own free API keys, stored only in your browser.
• Private and internal addresses are never sent anywhere.
• Only reads existing reports; never submits anything for analysis.
• Repeat lookups come from a short in-memory cache and don't use your quota.
• Nothing runs on a page until you use 4NTL there. No analytics or tracking.

MAKE IT YOURS
Light, dark and Sharingan themes, your own colors, and a card you can drag anywhere.

Open source: https://github.com/boode-hub/4NTL

4NTL is not affiliated with or endorsed by VirusTotal, AbuseIPDB or Google. The Sharingan theme is a fan tribute to Naruto by Masashi Kishimoto.
```

Phase 2: replace the ★ line with:

```
★ Install before 15 November 2026 and 4NTL is free for you, for life. After that: a 3-day free trial, then $2 once (no subscription). Prefer free? The open-source edition is on GitHub.
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

| Permission                                                                          | Justification                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextMenus`                                                                      | Adds the 4NTL entries to the right-click menu (look up a selection, check a link, check what a button opens). This is the main way the extension is used.                                               |
| `activeTab`                                                                         | Gives temporary access only to the tab where the user just invoked 4NTL, to show the result card there and read the selection. The extension never has standing access to any website.                  |
| `scripting`                                                                         | Injects the result card, and reads the selection or the right-clicked element, in the tab the user invoked 4NTL on (via activeTab). Injected only on demand; no content scripts run on pages otherwise. |
| `storage`                                                                           | Stores the user's own API keys, settings and saved list locally, and keeps recent results in memory so repeat lookups don't use API quota.                                                              |
| Host permission `https://www.virustotal.com/*`                                      | Sends the user's lookups to the VirusTotal API with the user's own API key.                                                                                                                             |
| Host permission `https://api.abuseipdb.com/*`                                       | Sends the user's IP lookups to the AbuseIPDB API with the user's own API key.                                                                                                                           |
| Phase 2 only: host permission `https://extensionpay.com/*` (and its content script) | The optional one-time purchase: ExtensionPay (with Stripe) runs the checkout and tells the extension when the user has paid or restored a purchase. Its script runs only on extensionpay.com.           |

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
