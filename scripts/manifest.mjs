/**
 * Single source of truth for manifest.json. Generated at build time so that
 * per-target differences (Chromium, Firefox, the e2e build) live in one place.
 */

const API_HOSTS = ['https://www.virustotal.com', 'https://api.abuseipdb.com'];

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

/** Firefox needs a fixed add-on ID; it's also the AMO listing's identity. */
export const GECKO_ID = '4ntl@boode-hub';

/**
 * @param {{ version: string, e2e?: boolean, browser?: 'chromium' | 'firefox' }} options
 * @returns {chrome.runtime.ManifestV3}
 */
export function createManifest({ version, e2e = false, browser = 'chromium' }) {
  const firefox = browser === 'firefox';
  return {
    manifest_version: 3,
    name: e2e ? '4NTL (e2e)' : '4NTL – Threat Intel Lookup',
    short_name: '4NTL',
    version,
    description:
      'Select an IP, hash, domain or URL, right-click, and see VirusTotal and AbuseIPDB verdicts right where you are.',
    ...(firefox
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              // 140 (ESR): MV3 scripting in the page's world, storage.session, popovers,
              // light-dark(), and the data-collection consent shown at install.
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['websiteContent', 'authenticationInfo'] },
            },
          },
        }
      : { minimum_chrome_version: '123' }),
    icons: ICONS,
    action: { default_title: '4NTL – settings', default_icon: ICONS },
    // Firefox runs MV3 background code as an event page rather than a service worker.
    background: firefox
      ? { scripts: ['background.js'], type: 'module' }
      : { service_worker: 'background.js', type: 'module' },
    options_ui: { page: 'options.html', open_in_tab: true },
    // activeTab + scripting: the UI is injected only into the tab the user acts on,
    // so the extension never needs "read and change all your data on all websites".
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
    host_permissions: [
      ...API_HOSTS.map((origin) => `${origin}/*`),
      // The e2e harness drives the extension without real user gestures, so activeTab
      // is never granted there. Release builds must never contain this.
      ...(e2e ? ['<all_urls>'] : []),
    ],
    // Type "4ntl" + space in the address bar, then an IP, hash, domain or link.
    omnibox: { keyword: '4ntl' },
    commands: {
      'lookup-selection': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Look up the selected text on all providers',
      },
    },
    content_security_policy: {
      extension_pages: [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self'",
        `connect-src ${API_HOSTS.join(' ')}`,
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; '),
    },
  };
}
