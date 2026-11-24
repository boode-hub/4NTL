/**
 * "Local library": what the open-source Windows projects (LOLBAS, LOLDrivers,
 * HijackLibs, Winbindex) and 4NTL's own core-process baseline say about a file
 * name. Free and keyless. The first three come from the library downloaded to
 * this computer (see background/library-store.ts); Winbindex is asked live,
 * per file name, because it's far too big to keep.
 */
import { formatNumber } from '../core/format';
import type { Indicator, IndicatorType } from '../core/indicator';
import { LookupError } from '../core/errors';
import type { Fact, Report, ReportLink, ReportList, Verdict } from '../core/result';
import { own, summarizeWinbindex, type LibraryMatch, type WinbindexSummary } from './library-data';
import { facts } from './json';
import type { Provider, ProviderContext } from './types';
import { WINDOWS_BASELINE } from './windows-baseline';

const NAME = 'Local library';
const SUPPORTED: ReadonlySet<IndicatorType> = new Set(['process']);
const WINBINDEX = 'https://winbindex.m417z.com';
/** Winbindex is extra: the local answer never waits longer than this for it. */
const WINBINDEX_TIMEOUT_MS = 5_000;
/** Rows per list; the source's page has the rest. */
const ROWS = 8;

/** File types Microsoft ships and Winbindex indexes. */
const WINBINDEX_TYPES = /\.(exe|dll|sys|cpl|ocx|drv|scr|msc|efi|mui)$/;

/** Genuine Microsoft builds of a file name, or undefined (not a Microsoft file, or unreachable). */
async function winbindex(
  name: string,
  ctx: ProviderContext,
): Promise<WinbindexSummary | undefined> {
  if (!WINBINDEX_TYPES.test(name)) return undefined;
  try {
    const response = await ctx.fetch(
      `${WINBINDEX}/data/by_filename_compressed/${encodeURIComponent(name)}.json.gz`,
      {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(Math.min(ctx.timeoutMs, WINBINDEX_TIMEOUT_MS)),
      },
    );
    if (!response.ok || !response.body) return undefined;
    const unzipped = response.body.pipeThrough(new DecompressionStream('gzip'));
    return summarizeWinbindex(await new Response(unzipped).json());
  } catch {
    // Winbindex is extra: the rest of the library still answers.
    return undefined;
  }
}

/** The badge, in order of what matters most to an analyst. */
function badge(match: LibraryMatch, core: boolean, microsoft: boolean): [string, Verdict] {
  if (match.drivers.some((d) => d.malicious)) return ['Malicious driver', 'malicious'];
  if (match.drivers.length > 0) return ['Vulnerable driver', 'suspicious'];
  if (match.lolbas) return ['LOLBin', 'unknown'];
  if (match.hijack.length > 0) return ['DLL hijack target', 'unknown'];
  if (core) return ['Core Windows', 'unknown'];
  if (microsoft) return ['Microsoft file', 'unknown'];
  return ['No findings', 'unknown'];
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toReport(
  name: string,
  match: LibraryMatch,
  ms: WinbindexSummary | undefined,
): Report {
  const core = own(WINDOWS_BASELINE, name);
  const { lolbas, drivers, hijack } = match;
  const [pill, verdict] = badge(match, core !== undefined, ms !== undefined);
  const malicious = drivers.filter((d) => d.malicious);
  const driverHashes = unique(drivers.flatMap((d) => d.hashes));
  const executables = hijack.flatMap((h) => h.executables);
  // LOLBAS lists each command line; the card lists each technique once.
  const seen = new Set<string>();
  const abuse = (lolbas?.commands ?? []).filter((c) => {
    const key = `${c.usecase.toLowerCase()}|${c.mitre}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // The headline: the one number (or name) that answers "is this normal?" first.
  const [headline, caption] =
    drivers.length > 0
      ? [formatNumber(driverHashes.length), 'known bad driver files (LOLDrivers)']
      : core
        ? [core.parent.replace(/ \(exits\)$/, ''), 'is its expected parent']
        : lolbas
          ? [formatNumber(abuse.length), 'abuse techniques on LOLBAS']
          : hijack.length > 0
            ? [formatNumber(executables.length), 'programs can be made to load a fake copy']
            : ms
              ? [formatNumber(ms.builds), 'genuine Microsoft builds (Winbindex)']
              : ['—', 'not in LOLBAS, LOLDrivers, HijackLibs or Winbindex'];

  const mitre = unique(lolbas?.commands.map((c) => c.mitre) ?? []);
  const tags = unique([
    ...(malicious.length > 0
      ? ['Malicious driver']
      : drivers.length > 0
        ? ['Vulnerable driver']
        : []),
    ...(lolbas ? ['LOLBin'] : []),
    ...(hijack.length > 0 ? ['DLL hijack'] : []),
    ...(core ? ['Core Windows'] : []),
    ...(ms ? [ms.signed ? 'Signed by Microsoft' : 'Microsoft file'] : []),
    ...hijack.map((h) => h.cve),
    ...mitre.slice(0, 4),
  ]);

  const details: Fact[] = facts(
    ['About', core?.about || lolbas?.description || ms?.description || undefined],
    ['Expected parent', core?.parent],
    ['Expected path', core?.path],
    ['Instances', core?.instances],
    ['Runs as', core?.user],
    [
      'Microsoft builds',
      ms ? `${formatNumber(ms.builds)}, latest ${ms.latestVersion || 'unknown'}` : undefined,
    ],
    ['Vendor', unique(hijack.map((h) => h.vendor)).join(', ') || undefined],
    ['Driver', drivers[0]?.description || undefined],
    [
      'Detection rules',
      lolbas && lolbas.detections > 0 ? `${lolbas.detections} linked on LOLBAS` : undefined,
    ],
  );

  const lists: ReportList[] = [
    {
      label: 'Abuse (LOLBAS)',
      wide: true,
      prose: true,
      items: abuse.slice(0, ROWS).map((c) => ({ name: c.usecase, detail: c.mitre })),
    },
    {
      label: 'Known paths',
      wide: true,
      items: unique([...(lolbas?.paths ?? []), ...hijack.flatMap((h) => h.locations)])
        .slice(0, ROWS)
        .map((path) => ({ name: path, detail: '' })),
    },
    {
      label: 'Programs that can load a fake copy (HijackLibs)',
      wide: true,
      items: executables.slice(0, ROWS).map((e) => ({ name: e.path, detail: e.type })),
    },
    {
      label: 'Known bad driver hashes (LOLDrivers)',
      wide: true,
      items: driverHashes.slice(0, ROWS).map((hash) => ({
        name: hash,
        detail: drivers.find((d) => d.hashes.includes(hash))?.malicious
          ? 'malicious'
          : 'vulnerable',
      })),
    },
  ].filter((list) => list.items.length > 0);

  const links: ReportLink[] = [
    ...(lolbas?.url ? [{ label: 'LOLBAS', url: lolbas.url }] : []),
    ...(drivers[0]
      ? [{ label: 'LOLDrivers', url: `https://www.loldrivers.io/drivers/${drivers[0].id}/` }]
      : []),
    ...(hijack[0]?.url ? [{ label: 'HijackLibs', url: hijack[0].url }] : []),
    ...(ms ? [{ label: 'Winbindex', url: `${WINBINDEX}/?file=${encodeURIComponent(name)}` }] : []),
  ];

  return {
    verdict,
    pill,
    headline,
    caption,
    tags,
    facts: details,
    ...(lists.length > 0 ? { lists } : {}),
    ...(links.length > 0 ? { links } : {}),
    reportUrl: '',
  };
}

async function lookup(indicator: Indicator, ctx: ProviderContext): Promise<Report> {
  if (!ctx.library) {
    throw new LookupError('internal', 'The local library isn’t available here.');
  }
  const name = indicator.value;
  const [match, ms] = await Promise.all([ctx.library.find(name), winbindex(name, ctx)]);
  return toReport(name, match, ms);
}

function checkKey(): Promise<string> {
  return Promise.resolve('No key needed.');
}

export const library: Provider = {
  id: 'library',
  name: NAME,
  keyless: true,
  supports: SUPPORTED,
  supportsLabel: 'Windows process names',
  apiKeyPattern: /^$/,
  apiKeyUrl: 'https://lolbas-project.github.io/',
  reportUrl: () => '',
  lookup,
  checkKey,
};
