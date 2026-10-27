/**
 * VirusTotal API v3 — https://docs.virustotal.com/reference/overview
 * Free keys allow 4 lookups/minute and 500/day. 4NTL only ever *reads*
 * existing reports; it never submits anything (submissions are public).
 */
import { formatBytes, formatCountry, formatNumber, formatAgo } from '../core/format';
import type { Indicator, IndicatorType } from '../core/indicator';
import { LookupError } from '../core/errors';
import type { Fact, Report, Verdict } from '../core/result';
import { failForStatus, getJson } from './http';
import { facts, num, obj, str } from './json';
import type { KeyCheckContext, Provider, ProviderContext } from './types';

const NAME = 'VirusTotal';
const API = 'https://www.virustotal.com/api/v3';
const GUI = 'https://www.virustotal.com/gui';

/** This many "malicious" engine verdicts make the overall verdict malicious; fewer is suspicious. */
export const MALICIOUS_THRESHOLD = 3;

const SUPPORTED: ReadonlySet<IndicatorType> = new Set([
  'ipv4',
  'ipv6',
  'domain',
  'url',
  'md5',
  'sha1',
  'sha256',
]);

/** VirusTotal's URL identifier: unpadded base64url of the URL. */
export function urlId(url: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(url)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function apiPath(indicator: Indicator): string {
  const { type, value } = indicator;
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `/ip_addresses/${value}`;
    case 'domain':
      return `/domains/${value}`;
    case 'md5':
    case 'sha1':
    case 'sha256':
      return `/files/${value}`;
    case 'url':
      return `/urls/${urlId(value)}`;
  }
}

function reportUrl(indicator: Indicator, objectId?: string): string {
  const { type, value } = indicator;
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `${GUI}/ip-address/${value}`;
    case 'domain':
      return `${GUI}/domain/${value}`;
    case 'md5':
    case 'sha1':
    case 'sha256':
      return `${GUI}/file/${value}`;
    case 'url':
      // URL reports are keyed by a SHA-256 id that only the API response tells us.
      return objectId ? `${GUI}/url/${objectId}` : `${GUI}/search/${encodeURIComponent(value)}`;
  }
}

function errorDetail(body: unknown): string | undefined {
  return str(obj(obj(body).error).message) || undefined;
}

export function verdictFor(malicious: number, suspicious: number, analysed: number): Verdict {
  if (analysed === 0) return 'unknown';
  if (malicious >= MALICIOUS_THRESHOLD) return 'malicious';
  if (malicious > 0 || suspicious > 0) return 'suspicious';
  return 'clean';
}

function when(epochSeconds: unknown, nowMs: number): string | undefined {
  const seconds = num(epochSeconds);
  return seconds === undefined ? undefined : formatAgo(seconds * 1000, nowMs);
}

function reputation(attrs: Record<string, unknown>): string | undefined {
  const value = num(attrs.reputation);
  return value === undefined ? undefined : formatNumber(value);
}

function typeFacts(indicator: Indicator, attrs: Record<string, unknown>, nowMs: number): Fact[] {
  switch (indicator.type) {
    case 'ipv4':
    case 'ipv6': {
      const asn = num(attrs.asn);
      const owner = [str(attrs.as_owner), asn === undefined ? '' : `AS${asn}`]
        .filter(Boolean)
        .join(' · ');
      const country = str(attrs.country);
      return facts(
        ['Owner', owner],
        ['Country', country && formatCountry(country)],
        ['Network', str(attrs.network)],
        ['Reputation', reputation(attrs)],
        ['Last analysis', when(attrs.last_analysis_date, nowMs)],
      );
    }
    case 'domain': {
      const categories = [
        ...new Set(Object.values(obj(attrs.categories)).map(str).filter(Boolean)),
      ];
      return facts(
        ['Registrar', str(attrs.registrar)],
        ['Created', when(attrs.creation_date, nowMs)],
        ['Categories', categories.slice(0, 3).join(', ')],
        ['Reputation', reputation(attrs)],
        ['Last analysis', when(attrs.last_analysis_date, nowMs)],
      );
    }
    case 'md5':
    case 'sha1':
    case 'sha256': {
      const size = num(attrs.size);
      return facts(
        ['Threat label', str(obj(attrs.popular_threat_classification).suggested_threat_label)],
        ['Name', str(attrs.meaningful_name)],
        ['Type', str(attrs.type_description)],
        ['Size', size === undefined ? undefined : formatBytes(size)],
        ['First seen', when(attrs.first_submission_date, nowMs)],
      );
    }
    case 'url': {
      const finalUrl = str(attrs.last_final_url);
      return facts(
        ['Title', str(attrs.title)],
        ['Final URL', finalUrl !== indicator.value ? finalUrl : undefined],
        ['Reputation', reputation(attrs)],
        ['Last analysis', when(attrs.last_analysis_date, nowMs)],
      );
    }
  }
}

export function toReport(indicator: Indicator, body: unknown, nowMs: number): Report {
  const data = obj(obj(body).data);
  const attrs = obj(data.attributes);
  if (Object.keys(attrs).length === 0) {
    throw new LookupError('bad_response', `${NAME} sent a response 4NTL couldn't read.`);
  }
  const stats = obj(attrs.last_analysis_stats);
  const count = (key: string) => num(stats[key]) ?? 0;
  const malicious = count('malicious');
  const suspicious = count('suspicious');
  const analysed = malicious + suspicious + count('harmless') + count('undetected');

  return {
    verdict: verdictFor(malicious, suspicious, analysed),
    headline: analysed === 0 ? 'No scans' : `${malicious} / ${analysed}`,
    caption:
      analysed === 0
        ? 'not analysed by any vendor yet'
        : 'security vendors flagged it as malicious',
    tags: suspicious > 0 ? [`${suspicious} suspicious`] : [],
    facts: typeFacts(indicator, attrs, nowMs),
    reportUrl: reportUrl(indicator, str(data.id) || undefined),
  };
}

function notFound(indicator: Indicator): Report {
  return {
    verdict: 'unknown',
    headline: 'Not found',
    caption: `${NAME} has no record of this ${indicator.type === 'url' ? 'URL' : 'indicator'}`,
    tags: [],
    facts: [],
    reportUrl: reportUrl(indicator),
  };
}

async function lookup(indicator: Indicator, ctx: ProviderContext): Promise<Report> {
  if (!SUPPORTED.has(indicator.type)) {
    throw new LookupError('unsupported', `${NAME} can't look up this kind of indicator.`);
  }
  const response = await getJson(API + apiPath(indicator), {
    providerName: NAME,
    headers: { 'x-apikey': ctx.apiKey },
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
  });
  const now = ctx.now();
  if (response.status === 404) return notFound(indicator);
  if (response.status !== 200) failForStatus(response, NAME, errorDetail(response.body), now);
  return toReport(indicator, response.body, now);
}

async function checkKey(ctx: KeyCheckContext): Promise<string> {
  // The quota endpoint accepts the key itself as the user id and doesn't consume lookups.
  const response = await getJson(`${API}/users/${encodeURIComponent(ctx.apiKey)}/overall_quotas`, {
    providerName: NAME,
    headers: { 'x-apikey': ctx.apiKey },
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
  });
  if (response.status !== 200) failForStatus(response, NAME, errorDetail(response.body), ctx.now());
  const daily = obj(obj(obj(obj(response.body).data).api_requests_daily).user);
  const used = num(daily.used);
  const allowed = num(daily.allowed);
  return used === undefined || allowed === undefined
    ? 'Key is valid.'
    : `Key is valid · ${formatNumber(used)} of ${formatNumber(allowed)} daily lookups used.`;
}

export const virustotal: Provider = {
  id: 'virustotal',
  name: NAME,
  supports: SUPPORTED,
  supportsLabel: 'IPs, domains, URLs and file hashes',
  apiKeyPattern: /^[0-9a-f]{64}$/i,
  apiKeyUrl: 'https://www.virustotal.com/gui/my-apikey',
  reportUrl: (indicator) => reportUrl(indicator),
  lookup,
  checkKey,
};
