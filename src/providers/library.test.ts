import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { NOW, TEST_SETTINGS } from '../../tests/helpers';
import type { Indicator } from '../core/indicator';
import { library, toReport } from './library';
import type { LibraryMatch, WinbindexSummary } from './library-data';

const NONE: LibraryMatch = { drivers: [], hijack: [] };
const MS: WinbindexSummary = {
  builds: 128,
  latestVersion: '10.0.26100.1742',
  description: 'Local Security Authority Process',
  signed: true,
};
const RUNDLL32: LibraryMatch = {
  lolbas: {
    description: 'Used by Windows to execute dll files',
    paths: ['C:\\Windows\\System32\\rundll32.exe'],
    commands: [
      { usecase: 'Execute DLL file', mitre: 'T1218.011', category: 'Execute' },
      { usecase: 'Execute from SMB share', mitre: 'T1218.011', category: 'Execute' },
    ],
    detections: 9,
    url: 'https://lolbas-project.github.io/lolbas/Binaries/Rundll32/',
  },
  drivers: [],
  hijack: [],
};

describe('Local library card', () => {
  it('a core Windows process: its expected parent first, then path, instances and account', () => {
    const report = toReport('lsass.exe', NONE, MS);
    expect(report).toMatchObject({
      verdict: 'unknown',
      pill: 'Core Windows',
      headline: 'wininit.exe',
      caption: 'is its expected parent',
      tags: ['Core Windows', 'Signed by Microsoft'],
    });
    expect(report.facts.map((f) => f.label)).toEqual([
      'About',
      'Expected parent',
      'Expected path',
      'Instances',
      'Runs as',
      'Microsoft builds',
    ]);
    expect(report.facts).toContainEqual({
      label: 'Microsoft builds',
      value: '128, latest 10.0.26100.1742',
    });
    expect(report.links).toEqual([
      { label: 'Winbindex', url: 'https://winbindex.m417z.com/?file=lsass.exe' },
    ]);
  });

  it('a LOLBin: its abuse techniques with MITRE IDs, known paths, detections and LOLBAS page', () => {
    const report = toReport('rundll32.exe', RUNDLL32, undefined);
    expect(report).toMatchObject({
      pill: 'LOLBin',
      headline: '2',
      caption: 'abuse techniques on LOLBAS',
    });
    expect(report.tags).toEqual(['LOLBin', 'T1218.011']);
    expect(report.lists).toEqual([
      {
        label: 'Abuse (LOLBAS)',
        wide: true,
        prose: true,
        items: [
          { name: 'Execute DLL file', detail: 'T1218.011' },
          { name: 'Execute from SMB share', detail: 'T1218.011' },
        ],
      },
      {
        label: 'Known paths',
        wide: true,
        items: [{ name: 'C:\\Windows\\System32\\rundll32.exe', detail: '' }],
      },
    ]);
    expect(report.facts).toContainEqual({ label: 'Detection rules', value: '9 linked on LOLBAS' });
    expect(report.links?.[0]?.label).toBe('LOLBAS');
  });

  it('the same technique from several LOLBAS command lines is listed once', () => {
    const repeated: LibraryMatch = {
      ...RUNDLL32,
      lolbas: {
        description: 'Windows binary used for handling certificates',
        paths: [],
        detections: 0,
        url: '',
        commands: [
          { usecase: 'Download file from Internet', mitre: 'T1105', category: 'Download' },
          { usecase: 'Download file from Internet', mitre: 'T1105', category: 'Download' },
          { usecase: 'Decode files', mitre: 'T1140', category: 'Decode' },
        ],
      },
    };
    const report = toReport('certutil.exe', repeated, undefined);
    expect(report.headline).toBe('2');
    expect(report.lists?.[0]?.items.map((i) => i.name)).toEqual([
      'Download file from Internet',
      'Decode files',
    ]);
  });

  it('a driver: malicious beats vulnerable, with its hashes to compare', () => {
    const drivers = [
      {
        id: 'b51c441a-12c7',
        malicious: false,
        description: 'Kernel read/write',
        hashes: ['a'.repeat(64)],
      },
      { id: '00561455-9da1', malicious: true, description: 'EDR killer', hashes: ['b'.repeat(64)] },
    ];
    const report = toReport('evil.sys', { drivers, hijack: [] }, undefined);
    expect(report).toMatchObject({
      verdict: 'malicious',
      pill: 'Malicious driver',
      headline: '2',
      caption: 'known bad driver files (LOLDrivers)',
    });
    expect(report.lists?.[0]).toEqual({
      label: 'Known bad driver hashes (LOLDrivers)',
      wide: true,
      items: [
        { name: 'a'.repeat(64), detail: 'vulnerable' },
        { name: 'b'.repeat(64), detail: 'malicious' },
      ],
    });
    expect(
      toReport('x.sys', { drivers: drivers.slice(0, 1), hijack: [] }, undefined),
    ).toMatchObject({
      verdict: 'suspicious',
      pill: 'Vulnerable driver',
    });
  });

  it('a DLL hijack target: which programs load it, and where it belongs', () => {
    const hijack = [
      {
        vendor: 'Microsoft',
        locations: ['%SYSTEM32%'],
        executables: [{ path: '%SYSTEM32%\\winsat.exe', type: 'Sideloading' }],
        cve: '',
        url: 'https://hijacklibs.net/entries/microsoft/built-in/version.html',
      },
    ];
    const report = toReport('version.dll', { drivers: [], hijack }, undefined);
    expect(report).toMatchObject({ pill: 'DLL hijack target', headline: '1' });
    expect(report.lists?.map((l) => l.label)).toEqual([
      'Known paths',
      'Programs that can load a fake copy (HijackLibs)',
    ]);
  });

  it('a service named like a JavaScript built-in gets a normal card', () => {
    for (const name of ['constructor', '__proto__', 'tostring', 'valueof']) {
      expect(toReport(name, NONE, undefined).pill).toBe('No findings');
    }
  });

  it('nothing known: says so plainly', () => {
    expect(toReport('notepad++.exe', NONE, undefined)).toMatchObject({
      pill: 'No findings',
      headline: '—',
      caption: 'not in LOLBAS, LOLDrivers, HijackLibs or Winbindex',
      tags: [],
      facts: [],
    });
  });

  it('asks Winbindex live (gzip) for Microsoft file types only, and survives it failing', async () => {
    const body = gzipSync(
      JSON.stringify({
        x: { fileInfo: { sha256: 'c'.repeat(64), version: '10.0.1', signingStatus: 'Signed' } },
      }),
    );
    const fetch = vi.fn(() => Promise.resolve(new Response(body, { status: 200 })));
    const ctx = (f: typeof fetch) => ({
      apiKey: '',
      settings: { ...TEST_SETTINGS, processes: true },
      fetch: f,
      timeoutMs: 1000,
      now: () => NOW,
      library: { find: () => Promise.resolve(NONE) },
    });
    const svchost: Indicator = { type: 'process', value: 'svchost.exe' };
    const report = await library.lookup(svchost, ctx(fetch));
    expect(fetch).toHaveBeenCalledWith(
      'https://winbindex.m417z.com/data/by_filename_compressed/svchost.exe.json.gz',
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect(report.facts).toContainEqual({ label: 'Microsoft builds', value: '1, latest 10.0.1' });

    // A service name isn't a file: Winbindex isn't asked.
    const fetch2 = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
    await library.lookup({ type: 'process', value: 'spooler' }, ctx(fetch2));
    expect(fetch2).not.toHaveBeenCalled();

    // Winbindex down: the rest of the library still answers.
    const down = vi.fn(() => Promise.reject(new Error('offline')));
    expect((await library.lookup(svchost, ctx(down))).pill).toBe('Core Windows');
  });
});
