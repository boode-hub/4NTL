/**
 * Load, stress and worst-case-input tests. Time limits are deliberately loose
 * (CI machines vary): they catch accidental O(n²) code and regex blow-ups
 * (ReDoS), not micro-regressions.
 */
import { describe, expect, it, vi } from 'vitest';
import { REPORT_CACHE, TtlCache } from '../src/core/cache';
import {
  extractIndicators,
  MAX_SELECTION_LENGTH,
  parseIndicator,
  resolveSelection,
} from '../src/core/indicator';
import { unwrapRedirect } from '../src/core/redirects';
import type { Report } from '../src/core/result';
import { LookupService } from '../src/background/lookup-service';
import { PROVIDERS } from '../src/providers/registry';
import type { Provider } from '../src/providers/types';
import { MemoryStore, TEST_SETTINGS } from './helpers';

/** Milliseconds `fn` takes (best of 3, to ignore one-off GC pauses). */
function timed(fn: () => unknown): number {
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

const REPORT: Report = {
  verdict: 'clean',
  headline: '0 / 90',
  caption: '',
  tags: [],
  facts: [],
  reportUrl: 'https://example.test/',
};

describe('parser under load', () => {
  const logLines = Array.from(
    { length: 120 },
    (_, i) =>
      `2026-10-27 09:${String(i % 60).padStart(2, '0')}:02 DENY src=10.0.${i % 255}.5 dst=185.220.${i % 255}.4 ` +
      `host=cdn${i}.evil[.]com url=hxxps://evil[.]com/p/${i} sha256=${'ab'.repeat(32)}`,
  ).join('\n');

  it(`resolves a full ${MAX_SELECTION_LENGTH.toLocaleString()}-character log selection quickly`, () => {
    expect(logLines.length).toBeGreaterThan(MAX_SELECTION_LENGTH);
    const ms = timed(() => resolveSelection(logLines));
    expect(ms).toBeLessThan(150);
    const result = resolveSelection(logLines);
    expect(result.kind).toBe('multiple');
  });

  it('stops scanning once it has enough indicators', () => {
    const ips = Array.from({ length: 5000 }, (_, i) => `8.${i >> 8}.${i & 255}.1`).join(' ');
    expect(timed(() => extractIndicators(ips))).toBeLessThan(150);
    expect(extractIndicators(ips)).toHaveLength(13);
  });

  // Inputs shaped to trigger catastrophic regex backtracking, if any existed.
  const adversarial: Record<string, string> = {
    'long label run': 'a'.repeat(5000),
    'dots without labels': '.'.repeat(5000),
    'dotted digits': '1.'.repeat(3000),
    'almost a domain': `${'a-'.repeat(2000)}.`,
    'many labels': `${'a.'.repeat(2000)}x`,
    colons: ':'.repeat(5000),
    'hex and colons': 'ab:'.repeat(2000),
    brackets: '['.repeat(5000),
    'closing parens': `https://x.com/${')'.repeat(3000)}`,
    'refang soup': 'hxxp[.]('.repeat(1500),
    'key=value chain': `${'k='.repeat(3000)}1.2.3.4`,
    'url-ish': `http://${'a.'.repeat(1500)}com/${'b/'.repeat(1500)}`,
    'unicode domain': `${'пример.'.repeat(500)}рф`,
    'max-length junk run then letter': `${'.'.repeat(9_990)}a`,
    'max-length closing parens': `https://x.com/${')'.repeat(9_980)}`,
    'max-length bracket run': `[${']'.repeat(9_990)}`,
  };
  it.each(Object.entries(adversarial))('handles "%s" input in linear time', (_name, input) => {
    expect(timed(() => resolveSelection(input))).toBeLessThan(150);
    expect(timed(() => parseIndicator(input))).toBeLessThan(150);
  });

  it('unwraps adversarial redirect wrappers quickly', () => {
    const stars = `https://urldefense.com/v3/__https://evil.com/${'*'.repeat(20_000)}__;${'QUFB'.repeat(5000)}!!x`;
    expect(timed(() => unwrapRedirect(stars))).toBeLessThan(150);
    let nested = 'https://evil.com/';
    for (let i = 0; i < 50; i++) {
      nested = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(nested)}`;
    }
    expect(timed(() => unwrapRedirect(nested))).toBeLessThan(50);
  });
});

function burstSetup(options: { delayMs?: number; maxEntries?: number } = {}) {
  const store = new MemoryStore();
  const delay = options.delayMs ?? 0;
  const lookup = vi.fn(() =>
    delay === 0
      ? Promise.resolve(REPORT)
      : new Promise<Report>((resolve) =>
          setTimeout(() => {
            resolve(REPORT);
          }, delay),
        ),
  );
  const service = new LookupService({
    cache: new TtlCache<Report>(store, {
      ...REPORT_CACHE,
      maxEntries: options.maxEntries ?? REPORT_CACHE.maxEntries,
    }),
    loadSettings: () => Promise.resolve(TEST_SETTINGS),
    fetch: vi.fn(),
    providers: { ...PROVIDERS, virustotal: { ...PROVIDERS.virustotal, lookup } },
  });
  return { service, lookup, store };
}

describe('lookup service under load', () => {
  it('sends ONE request for 1,000 simultaneous identical lookups', async () => {
    const { service, lookup } = burstSetup({ delayMs: 20 });
    const indicator = { type: 'ipv4', value: '185.220.101.4' } as const;
    const outcomes = await Promise.all(
      Array.from({ length: 1000 }, () => service.lookup('virustotal', indicator)),
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  });

  it('handles 500 different lookups at once, each exactly once', async () => {
    const { service, lookup } = burstSetup();
    const indicators = Array.from({ length: 500 }, (_, i) => ({
      type: 'ipv4' as const,
      value: `8.8.${i >> 8}.${i & 255}`,
    }));
    const start = performance.now();
    const outcomes = await Promise.all(indicators.map((i) => service.lookup('virustotal', i)));
    expect(performance.now() - start).toBeLessThan(2000);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(500);
    expect(lookup).toHaveBeenCalledTimes(500);
  });

  it('keeps the result cache bounded no matter how many lookups happen', async () => {
    const { service, store } = burstSetup({ maxEntries: 100 });
    const start = performance.now();
    for (let i = 0; i < 1500; i++) {
      await service.lookup('virustotal', { type: 'ipv4', value: `9.9.${i >> 8}.${i & 255}` });
    }
    // maxEntries plus at most one prune interval (20 writes) of slack.
    expect(store.data.size).toBeLessThanOrEqual(100 + 20);
    expect(performance.now() - start).toBeLessThan(4000);
  });

  it('serves a repeat lookup from the cache after the worker restarts', async () => {
    const store = new MemoryStore();
    const make = (lookup: Provider['lookup']) =>
      new LookupService({
        cache: new TtlCache<Report>(store, REPORT_CACHE),
        loadSettings: () => Promise.resolve(TEST_SETTINGS),
        fetch: vi.fn(),
        providers: { ...PROVIDERS, virustotal: { ...PROVIDERS.virustotal, lookup } },
      });
    const indicator = { type: 'ipv4', value: '185.220.101.4' } as const;
    await make(() => Promise.resolve(REPORT)).lookup('virustotal', indicator);
    const afterRestart = vi.fn(() => Promise.resolve(REPORT));
    // A brand-new service (the worker was shut down) over the same session storage.
    expect(await make(afterRestart).lookup('virustotal', indicator)).toMatchObject({
      cached: true,
    });
    expect(afterRestart).not.toHaveBeenCalled();
  });
});
