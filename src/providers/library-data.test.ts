import { describe, expect, it } from 'vitest';
import { slimHijacklibs, slimLolbas, slimLoldrivers, summarizeWinbindex } from './library-data';

// Shapes as the projects publish them (fields trimmed to what 4NTL reads).
const LOLBAS = [
  {
    Name: 'Rundll32.exe',
    Description: 'Used by Windows to execute dll files',
    Commands: [
      { Usecase: 'Execute DLL file', MitreID: 'T1218.011', Category: 'Execute' },
      { Usecase: 'Execute code from alternate data stream', MitreID: 'T1564.004', Category: 'ADS' },
    ],
    Full_Path: [
      { Path: 'C:\\Windows\\System32\\rundll32.exe' },
      { Path: 'C:\\Windows\\SysWOW64\\rundll32.exe' },
    ],
    Detection: [{ Sigma: 'https://x' }, { Elastic: 'https://y' }],
    url: 'https://lolbas-project.github.io/lolbas/Binaries/Rundll32/',
  },
];

const LOLDRIVERS = [
  {
    Id: '00561455-9da1-4f0c-8564-e4c99b716a74',
    Category: 'malicious',
    Commands: { Description: 'Poortry variant used to kill EDR.' },
    Tags: ['driver_090d409f.sys'],
    KnownVulnerableSamples: [
      { SHA256: '090D409F86430E078694E621AD0BD5E458D32AA727F0EB99BDA3961577DF8D49' },
    ],
  },
  {
    Id: 'b51c441a-12c7-407d-9517-559cc0030cf6',
    Category: 'vulnerable driver',
    Commands: { Description: 'Arbitrary kernel read/write.' },
    Tags: ['RTCore64.sys', 'rtcore32.sys'],
    KnownVulnerableSamples: [
      { SHA256: '01aa278b07b58dc46c84bd0b1b5c8e9ee4e62ea0bf7a695862444af32e87f1fd' },
      { SHA256: 'not-a-hash' },
    ],
  },
];

const HIJACKLIBS = [
  {
    Name: 'version.dll',
    Vendor: 'Microsoft',
    CVE: null,
    ExpectedLocations: ['%SYSTEM32%', '%SYSWOW64%'],
    VulnerableExecutables: [{ Path: '%SYSTEM32%\\winsat.exe', Type: 'Sideloading' }],
    url: 'https://hijacklibs.net/entries/microsoft/built-in/version.html',
  },
];

describe('local library data', () => {
  it('LOLBAS: by lower-case name, with abuse, paths, detections and its page', () => {
    expect(slimLolbas(LOLBAS)['rundll32.exe']).toEqual({
      description: 'Used by Windows to execute dll files',
      paths: ['C:\\Windows\\System32\\rundll32.exe', 'C:\\Windows\\SysWOW64\\rundll32.exe'],
      commands: [
        { usecase: 'Execute DLL file', mitre: 'T1218.011', category: 'Execute' },
        { usecase: 'Execute code from alternate data stream', mitre: 'T1564.004', category: 'ADS' },
      ],
      detections: 2,
      url: 'https://lolbas-project.github.io/lolbas/Binaries/Rundll32/',
    });
  });

  it('LOLDrivers: every tagged file name points at its driver, hashes checked and lower-cased', () => {
    const index = slimLoldrivers(LOLDRIVERS);
    expect(index['driver_090d409f.sys']?.[0]).toMatchObject({
      malicious: true,
      hashes: ['090d409f86430e078694e621ad0bd5e458d32aa727f0eb99bda3961577df8d49'],
    });
    expect(index['rtcore64.sys']?.[0]).toMatchObject({
      malicious: false,
      hashes: [expect.any(String)],
    });
    expect(index['rtcore32.sys']).toEqual(index['rtcore64.sys']);
  });

  it('HijackLibs: locations, vulnerable programs and its page', () => {
    expect(slimHijacklibs(HIJACKLIBS)['version.dll']).toEqual([
      {
        vendor: 'Microsoft',
        locations: ['%SYSTEM32%', '%SYSWOW64%'],
        executables: [{ path: '%SYSTEM32%\\winsat.exe', type: 'Sideloading' }],
        cve: '',
        url: 'https://hijacklibs.net/entries/microsoft/built-in/version.html',
      },
    ]);
  });

  it('untrusted downloads: junk is dropped, never thrown, and links stay on the project’s site', () => {
    for (const junk of [null, 42, 'x', {}, [null, 1, 'a', { Name: 7 }]]) {
      expect(slimLolbas(junk)).toEqual({});
      expect(slimLoldrivers(junk)).toEqual({});
      expect(slimHijacklibs(junk)).toEqual({});
    }
    const evil = slimLolbas([
      { Name: 'a.exe', url: 'javascript:alert(1)' },
      { Name: 'b.exe', url: 'https://evil.example/x' },
      { Name: '../../x.exe' },
      { Name: '__proto__' },
    ]);
    expect(evil['a.exe']?.url).toBe('');
    expect(evil['b.exe']?.url).toBe('');
    expect(Object.keys(evil)).toEqual(['a.exe', 'b.exe']);
  });

  it('names that are also built-in JavaScript properties are just names', () => {
    const drivers = slimLoldrivers([
      {
        Id: '00561455-9da1-4f0c',
        Category: 'vulnerable driver',
        Tags: ['constructor', 'hasOwnProperty'],
      },
    ]);
    expect(drivers.constructor).toEqual([expect.objectContaining({ id: '00561455-9da1-4f0c' })]);
    expect(Object.keys(slimHijacklibs([{ Name: 'constructor' }, { Name: 'toString' }]))).toEqual([
      'constructor',
      'tostring',
    ]);
  });

  it('Winbindex: how many genuine builds, the latest version and whether all are signed', () => {
    const file = (sha: string, version: string, signed = true) => ({
      fileInfo: {
        sha256: sha.repeat(64),
        version,
        description: 'Local Security Authority Process',
        signingStatus: signed ? 'Signed' : 'Unsigned',
      },
    });
    expect(
      summarizeWinbindex({
        a: file('a', '10.0.15063.1418 (WinBuild.160101.0800)'),
        b: file('b', '10.0.26100.1742 (WinBuild.160101.0800)'),
        c: file('c', '10.0.19041.1'),
      }),
    ).toEqual({
      builds: 3,
      latestVersion: '10.0.26100.1742',
      description: 'Local Security Authority Process',
      signed: true,
    });
    expect(summarizeWinbindex({ a: file('a', '1.0', false) })?.signed).toBe(false);
    expect(summarizeWinbindex({})).toBeUndefined();
    expect(summarizeWinbindex('junk')).toBeUndefined();
  });
});
