/**
 * The local process library: open-source Windows intel, slimmed for the browser.
 *
 * - LOLBAS (https://lolbas-project.github.io) — binaries attackers abuse ("LOLBins").
 * - LOLDrivers (https://www.loldrivers.io) — vulnerable and malicious drivers.
 * - HijackLibs (https://hijacklibs.net) — DLLs that programs can be tricked into loading.
 * - Winbindex (https://winbindex.m417z.com) — every genuine Microsoft build of a file
 *   (asked live, per file name: too big to keep).
 *
 * The data is downloaded by each user's own browser from those public projects
 * (4NTL ships none of it) and reduced to what the card shows. Everything here is
 * untrusted input: every field is type-checked, and anything odd is dropped.
 */
import { obj, str } from './json';

export interface LolbasEntry {
  readonly description: string;
  readonly paths: readonly string[];
  readonly commands: readonly {
    readonly usecase: string;
    readonly mitre: string;
    readonly category: string;
  }[];
  /** How many detection rules LOLBAS links (Sigma, Elastic, Splunk…). */
  readonly detections: number;
  readonly url: string;
}

export interface DriverEntry {
  readonly id: string;
  readonly malicious: boolean;
  readonly description: string;
  readonly hashes: readonly string[];
}

export interface HijackEntry {
  readonly vendor: string;
  readonly locations: readonly string[];
  readonly executables: readonly { readonly path: string; readonly type: string }[];
  readonly cve: string;
  readonly url: string;
}

/** Each source as stored: entries by lower-case file name. */
export type LolbasIndex = Readonly<Record<string, LolbasEntry>>;
export type DriverIndex = Readonly<Record<string, readonly DriverEntry[]>>;
export type HijackIndex = Readonly<Record<string, readonly HijackEntry[]>>;

const MAX_TEXT = 400;
const MAX_ITEMS = 40;

/** A nested list (paths, commands…), capped: a source can't flood the card. */
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 500) : [];
}

/** A whole source: thousands of entries is normal, millions isn't. */
function entries(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 50_000) : [];
}

function text(value: unknown, max = MAX_TEXT): string {
  const s = str(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Only links to the project's own https site make it into the card. */
function httpsUrl(value: unknown, host: string): string {
  const s = str(value);
  try {
    const url = new URL(s);
    return url.protocol === 'https:' && url.hostname === host ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * An index lookup that only sees the index's own entries: a file name such as
 * "constructor" or "__proto__" must never reach Object.prototype.
 */
export function own<T>(index: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(index, key) ? index[key] : undefined;
}

function bucket<T>(out: Record<string, T[]>, key: string): T[] {
  const existing = own(out, key);
  if (existing) return existing;
  const fresh: T[] = [];
  out[key] = fresh;
  return fresh;
}

/** A plain file name: no paths, nothing a key could be abused with. */
function fileKey(value: unknown): string {
  const name = str(value).toLowerCase();
  return /^[\w.$~+()-][\w.$~+() -]{0,127}$/.test(name) && !name.startsWith('__') ? name : '';
}

export function slimLolbas(raw: unknown): LolbasIndex {
  const out: Record<string, LolbasEntry> = {};
  for (const item of entries(raw)) {
    const entry = obj(item);
    const name = fileKey(entry.Name);
    if (!name) continue;
    out[name] = {
      description: text(entry.Description),
      paths: list(entry.Full_Path)
        .map((p) => text(obj(p).Path, 260))
        .filter(Boolean)
        .slice(0, MAX_ITEMS),
      commands: list(entry.Commands)
        .map((c) => {
          const command = obj(c);
          return {
            usecase: text(command.Usecase, 160),
            mitre: text(command.MitreID, 20),
            category: text(command.Category, 40),
          };
        })
        .filter((c) => c.usecase)
        .slice(0, MAX_ITEMS),
      detections: list(entry.Detection).length,
      url: httpsUrl(entry.url, 'lolbas-project.github.io'),
    };
  }
  return out;
}

export function slimLoldrivers(raw: unknown): DriverIndex {
  const out: Record<string, DriverEntry[]> = {};
  for (const item of entries(raw)) {
    const entry = obj(item);
    const id = str(entry.Id);
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) continue;
    const driver: DriverEntry = {
      id,
      malicious: str(entry.Category).toLowerCase() === 'malicious',
      description: text(obj(entry.Commands).Description),
      hashes: list(entry.KnownVulnerableSamples)
        .map((s) => str(obj(s).SHA256).toLowerCase())
        .filter((h) => /^[0-9a-f]{64}$/.test(h))
        .slice(0, 10),
    };
    // LOLDrivers names a driver's files in its tags.
    for (const tag of list(entry.Tags)) {
      const name = fileKey(tag);
      if (name) bucket(out, name).push(driver);
    }
  }
  return out;
}

export function slimHijacklibs(raw: unknown): HijackIndex {
  const out: Record<string, HijackEntry[]> = {};
  for (const item of entries(raw)) {
    const entry = obj(item);
    const name = fileKey(entry.Name);
    if (!name) continue;
    bucket(out, name).push({
      vendor: text(entry.Vendor, 80),
      locations: list(entry.ExpectedLocations)
        .map((l) => text(l, 260))
        .filter(Boolean)
        .slice(0, MAX_ITEMS),
      executables: list(entry.VulnerableExecutables)
        .map((e) => ({ path: text(obj(e).Path, 260), type: text(obj(e).Type, 40) }))
        .filter((e) => e.path)
        .slice(0, MAX_ITEMS),
      cve: text(entry.CVE, 40),
      url: httpsUrl(entry.url, 'hijacklibs.net'),
    });
  }
  return out;
}

export interface WinbindexSummary {
  /** How many distinct genuine builds (hashes) Microsoft shipped. */
  readonly builds: number;
  readonly latestVersion: string;
  readonly description: string;
  /** Every known build is signed. */
  readonly signed: boolean;
}

/** Compares "10.0.26100.1742 (WinBuild…)" style versions numerically. */
function versionParts(version: string): number[] {
  return (version.match(/^\d+(?:\.\d+)*/)?.[0] ?? '').split('.').map(Number);
}

function newer(a: string, b: string): boolean {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Winbindex's per-file index (sha256 → { fileInfo, windowsVersions }) → a summary. */
export function summarizeWinbindex(raw: unknown): WinbindexSummary | undefined {
  const files = Object.values(obj(raw)).slice(0, 5000);
  let builds = 0;
  let latestVersion = '';
  let description = '';
  let signed = true;
  for (const file of files) {
    const info = obj(obj(file).fileInfo);
    if (!/^[0-9a-f]{64}$/i.test(str(info.sha256))) continue;
    builds++;
    if (str(info.signingStatus) !== 'Signed') signed = false;
    const version = str(info.version);
    if (version && (!latestVersion || newer(version, latestVersion))) {
      latestVersion = version;
      description = text(info.description, 160) || description;
    }
  }
  if (builds === 0) return undefined;
  return {
    builds,
    latestVersion: latestVersion.replace(/\s*\(.*\)$/, ''),
    description,
    signed,
  };
}

/** What the library knows about one file name. */
export interface LibraryMatch {
  readonly lolbas?: LolbasEntry | undefined;
  readonly drivers: readonly DriverEntry[];
  readonly hijack: readonly HijackEntry[];
}
