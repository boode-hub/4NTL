# Security

4NTL is a tool for security work, so it is built to be boring to attack.

## What it can access

- **Permissions:** `contextMenus`, `storage`, `activeTab`, `scripting`.
  It can only touch a page after you invoke it there (menu or shortcut), and
  only that tab.
- **Network:** only `https://www.virustotal.com` and `https://api.abuseipdb.com`,
  enforced twice: by `host_permissions` and by the extension's
  `connect-src` Content-Security-Policy.

## Your data

- **API keys** are stored in `chrome.storage.local` of your browser profile:
  never synced, and only ever sent to the provider they belong to. Like any
  extension storage they are not encrypted at rest; anyone with access to your
  OS account and browser profile can read them.
- **Lookups** send the selected indicator to the provider you chose. 4NTL
  never _submits_ anything for analysis (VirusTotal submissions are public).
  Private and reserved IP addresses, and internal host names (single-label
  names, `.local`, `.internal`, `.corp`, `.lan`, …) including inside links you
  right-click, are never sent at all.
- **Results** are cached in `chrome.storage.session`: memory only, cleared
  when the browser closes or settings change.
- No analytics, telemetry or third-party code.

## Hardening

- API responses are treated as untrusted input: every field is type-checked,
  and the UI renders text only (`innerHTML` and friends are banned by lint).
- Only `https://` report links are rendered, with `rel="noopener noreferrer"`.
- The in-page card lives in a closed shadow root; the page-side script never
  holds API keys and can only request lookups the service worker re-validates.
- Messages are accepted only from the extension itself and validated by shape.
- Zero runtime dependencies; dev dependencies are pinned and monitored by Dependabot.
- A release guard rejects builds containing test hooks, broad host access,
  source maps or dynamic code evaluation.

## Reporting a vulnerability

Please report issues privately to the maintainer rather than in a public
issue, with steps to reproduce and the affected version.
