import { describe, expect, it } from 'vitest';
import { createManifest, GECKO_ID } from '../scripts/manifest.mjs';

const API_HOSTS = ['https://www.virustotal.com/*', 'https://api.abuseipdb.com/*'];

describe('manifest', () => {
  const manifest = createManifest({ version: '1.2.3' });

  it('one manifest for both browsers: Chromium runs the service worker, Firefox the event page', () => {
    expect(manifest.background).toEqual({
      service_worker: 'background.js',
      scripts: ['background.js'],
      type: 'module',
    });
    expect(manifest.minimum_chrome_version).toBe('123');
  });

  it('Firefox: a fixed add-on ID and declared data collection', () => {
    expect(manifest.browser_specific_settings?.gecko).toEqual({
      id: GECKO_ID,
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['websiteContent', 'authenticationInfo'] },
    });
    expect(manifest.browser_specific_settings?.gecko_android).toEqual({
      strict_min_version: '142.0',
    });
    expect(GECKO_ID).toMatch(/^[\w.-]+@[\w.-]+$/);
  });

  it('asks for exactly the minimal access', () => {
    expect(manifest.permissions).toEqual(['contextMenus', 'storage', 'activeTab', 'scripting']);
    expect(manifest.host_permissions).toEqual(API_HOSTS);
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest).not.toHaveProperty('web_accessible_resources');
  });

  it('the store edition adds only ExtensionPay: its host, its script on its own site, its API', () => {
    const store = createManifest({ version: '1.2.3', store: true });
    expect(store.host_permissions).toEqual([...API_HOSTS, 'https://extensionpay.com/*']);
    expect(store.content_scripts).toEqual([
      { matches: ['https://extensionpay.com/*'], js: ['ExtPay.js'], run_at: 'document_start' },
    ]);
    expect(store.content_security_policy?.extension_pages).toContain(
      'connect-src https://www.virustotal.com https://api.abuseipdb.com https://extensionpay.com;',
    );
    expect(store.permissions).toEqual(manifest.permissions);
  });

  it('broad access is only ever optional (the "embedded frames" switch), never granted at install', () => {
    expect(manifest.optional_host_permissions).toEqual(['<all_urls>']);
    expect(manifest.host_permissions).not.toContain('<all_urls>');
  });

  it('only the test build gets broad host access', () => {
    expect(createManifest({ version: '1.2.3', e2e: true }).host_permissions).toEqual([
      ...API_HOSTS,
      '<all_urls>',
    ]);
  });
});
