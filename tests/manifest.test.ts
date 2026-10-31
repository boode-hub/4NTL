import { describe, expect, it } from 'vitest';
import { createManifest, GECKO_ID } from '../scripts/manifest.mjs';

const API_HOSTS = ['https://www.virustotal.com/*', 'https://api.abuseipdb.com/*'];

describe('manifest', () => {
  const chromium = createManifest({ version: '1.2.3' });
  const firefox = createManifest({ version: '1.2.3', browser: 'firefox' });

  it('Chromium: a service worker, and nothing Firefox-specific', () => {
    expect(chromium.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(chromium.minimum_chrome_version).toBe('123');
    expect(chromium.browser_specific_settings).toBeUndefined();
  });

  it('Firefox: an event page, a fixed add-on ID and declared data collection', () => {
    expect(firefox.background).toEqual({ scripts: ['background.js'], type: 'module' });
    expect(firefox.minimum_chrome_version).toBeUndefined();
    expect(firefox.browser_specific_settings?.gecko).toEqual({
      id: GECKO_ID,
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['websiteContent', 'authenticationInfo'] },
    });
    expect(GECKO_ID).toMatch(/^[\w.-]+@[\w.-]+$/);
  });

  it('both builds ask for exactly the same, minimal access', () => {
    for (const manifest of [chromium, firefox]) {
      expect(manifest.permissions).toEqual(['contextMenus', 'storage', 'activeTab', 'scripting']);
      expect(manifest.host_permissions).toEqual(API_HOSTS);
      expect(manifest).not.toHaveProperty('content_scripts');
      expect(manifest).not.toHaveProperty('web_accessible_resources');
    }
    const strip = (manifest: object) =>
      Object.fromEntries(
        Object.entries(manifest).filter(
          ([key]) =>
            !['background', 'minimum_chrome_version', 'browser_specific_settings'].includes(key),
        ),
      );
    expect(strip(firefox)).toEqual(strip(chromium));
  });

  it('the store edition adds only ExtensionPay: its host, its script on its own site, its API', () => {
    for (const browser of ['chromium', 'firefox'] as const) {
      const store = createManifest({ version: '1.2.3', browser, store: true });
      expect(store.host_permissions).toEqual([...API_HOSTS, 'https://extensionpay.com/*']);
      expect(store.content_scripts).toEqual([
        { matches: ['https://extensionpay.com/*'], js: ['ExtPay.js'], run_at: 'document_start' },
      ]);
      expect(store.content_security_policy?.extension_pages).toContain(
        'connect-src https://www.virustotal.com https://api.abuseipdb.com https://extensionpay.com;',
      );
      expect(store.permissions).toEqual(createManifest({ version: '1.2.3', browser }).permissions);
    }
  });

  it('only the test build gets broad host access', () => {
    expect(createManifest({ version: '1.2.3', e2e: true }).host_permissions).toEqual([
      ...API_HOSTS,
      '<all_urls>',
    ]);
  });
});
