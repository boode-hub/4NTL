# 4NTL privacy policy

_Last updated: 31 October 2026_

4NTL is a browser extension that looks up IP addresses, domains, URLs and file
hashes on VirusTotal and AbuseIPDB when you ask it to. This policy explains
exactly what it handles. In short: it only sends what you choose to look up, only
to the service you choose, and it collects nothing about you.

## What 4NTL sends, and to whom

When you choose a 4NTL lookup (right-click menu, keyboard shortcut, toolbar
icon or address-bar keyword), the indicator you selected or the link you
right-clicked is sent to:

- **VirusTotal** (`www.virustotal.com`, operated by Google), and/or
- **AbuseIPDB** (`api.abuseipdb.com`),

depending on the provider you picked, together with **your own API key** for
that service. The request goes directly from your browser to that service.
Nothing passes through any server of ours; 4NTL has no server.

4NTL never sends:

- private or reserved IP addresses (for example `10.x`, `192.168.x`, `fe80::`)
  or internal host names (single-word names, `.local`, `.internal`, `.corp`,
  `.lan`, and similar), not even inside links you right-click;
- anything automatically, in the background, or without you asking;
- files or URLs for analysis: it only reads existing reports and never submits
  anything to VirusTotal.

Those services handle the requests under their own privacy policies:
[VirusTotal](https://support.virustotal.com/hc/en-us/articles/115002168385-Privacy-Policy)
and [AbuseIPDB](https://www.abuseipdb.com/privacy-policy).

## Paying for the store edition (Chrome Web Store / Firefox Add-ons only)

The free edition on GitHub never contacts any payment service. The store edition
is free for everyone who installed it before 15 November 2026; later installs get
a 3-day trial and then a one-time $2 unlock. Payments are handled by
**ExtensionPay** (`extensionpay.com`) and **Stripe**:

- When you click **Unlock** or **Restore purchase**, the extension asks
  ExtensionPay for an anonymous key and opens its page. You pay, or enter the
  email you paid with, on ExtensionPay's and Stripe's pages, not inside 4NTL.
  4NTL never sees your card details or your email.
- To know whether you've paid, the extension sends that anonymous key to
  ExtensionPay (at most hourly during and after the trial; never once you've
  paid or if you installed early). The answer is remembered on your computer.
- The key and the date you first installed are kept in your browser's synced
  extension storage, so a purchase or early install is recognised on your other
  computers when you're signed in to the browser.

ExtensionPay's privacy policy: <https://extensionpay.com/privacy>. Stripe's:
<https://stripe.com/privacy>.

## What 4NTL stores, and where

- **Your API keys and settings** (theme, colors, cache lifetime,
  AbuseIPDB report window) are stored in your browser's local extension
  storage on your computer. They are never synced to your Google account and
  never sent anywhere except each key to its own service.
- **Your saved list**: the indicators you choose to save from a card, with
  their verdict summary, country and the time you saved them. It stays in your
  browser's local extension storage until you remove entries or clear the list,
  and is never sent anywhere. Exporting it (copy or CSV download) happens only
  when you ask.
- **Recent lookup results** are kept in memory for up to the time you choose
  in settings (30 minutes by default) so repeat lookups are instant. They are
  never written to disk and disappear when the browser closes.

## What 4NTL does not do

- No analytics, telemetry, tracking or advertising. The only third-party code is
  ExtensionPay's payment library, in the store edition only.
- No accounts, no sign-in, no personal information collected.
- It does not read or change pages you don't use it on. It only runs on a page
  after you invoke it there, and then only to show the result card, to read the
  selection, or to find where a right-clicked link or button leads.
- No data is sold, shared or transferred to anyone, other than the lookups you
  request going to the service you chose and, in the store edition, the
  anonymous payment key going to ExtensionPay.

## Removing your data

Delete your keys in the 4NTL settings page, or remove the extension: the
browser then deletes everything 4NTL stored.

## Contact

Questions or concerns: open an issue at
<https://github.com/boode-hub/4NTL/issues>.
