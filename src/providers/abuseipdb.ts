/**
 * AbuseIPDB API v2 — https://docs.abuseipdb.com/#check-endpoint
 * Free keys allow 1,000 checks/day. IP addresses only.
 */
import { formatCountry, formatNumber, formatAgo } from '../core/format';
import type { Indicator, IndicatorType } from '../core/indicator';
import { LookupError } from '../core/errors';
import type { Report, Verdict } from '../core/result';
import { failForStatus, getJson } from './http';
import { facts, num, obj, str } from './json';
import type { KeyCheckContext, Provider, ProviderContext } from './types';

const NAME = 'AbuseIPDB';
const API = 'https://api.abuseipdb.com/api/v2';
const SITE = 'https://www.abuseipdb.com';

/** Abuse confidence (0–100) at or above which an IP is malicious / suspicious. */
export const MALICIOUS_SCORE = 75;
export const SUSPICIOUS_SCORE = 25;

const SUPPORTED: ReadonlySet<IndicatorType> = new Set(['ipv4', 'ipv6']);

const reportUrl = (indicator: Indicator) => `${SITE}/check/${indicator.value}`;

function errorDetail(body: unknown): string | undefined {
  const [first] = Array.isArray(obj(body).errors) ? (obj(body).errors as unknown[]) : [];
  return str(obj(first).detail) || undefined;
}

export function verdictFor(score: number): Verdict {
  if (score >= MALICIOUS_SCORE) return 'malicious';
  if (score >= SUSPICIOUS_SCORE) return 'suspicious';
  return 'clean';
}

export function toReport(
  indicator: Indicator,
  body: unknown,
  maxAgeDays: number,
  nowMs: number,
): Report {
  const data = obj(obj(body).data);
  const score = num(data.abuseConfidenceScore);
  if (score === undefined) {
    throw new LookupError('bad_response', `${NAME} sent a response 4NTL couldn't read.`);
  }
  const reports = num(data.totalReports) ?? 0;
  const reporters = num(data.numDistinctUsers) ?? 0;
  const lastReported = Date.parse(str(data.lastReportedAt));
  const country = str(data.countryCode);

  return {
    verdict: verdictFor(score),
    headline: `${score}%`,
    caption: 'abuse confidence',
    score: Math.min(1, Math.max(0, score / 100)),
    tags: [
      ...(data.isTor === true ? ['Tor exit node'] : []),
      ...(data.isWhitelisted === true ? ['Whitelisted'] : []),
    ],
    facts: facts(
      [
        `Reports (${maxAgeDays} d)`,
        reports === 0
          ? 'None'
          : `${formatNumber(reports)} from ${formatNumber(reporters)} user${reporters === 1 ? '' : 's'}`,
      ],
      ['Last reported', Number.isNaN(lastReported) ? undefined : formatAgo(lastReported, nowMs)],
      ['ISP', str(data.isp)],
      ['Usage', str(data.usageType)],
      ['Country', country && formatCountry(country)],
      ['Domain', str(data.domain)],
    ),
    reportUrl: reportUrl(indicator),
  };
}

function checkUrl(ip: string, maxAgeDays: number): string {
  return `${API}/check?${new URLSearchParams({ ipAddress: ip, maxAgeInDays: String(maxAgeDays) })}`;
}

async function lookup(indicator: Indicator, ctx: ProviderContext): Promise<Report> {
  if (!SUPPORTED.has(indicator.type)) {
    throw new LookupError('unsupported', `${NAME} only checks IP addresses.`);
  }
  const maxAge = ctx.settings.abuseIpdbMaxAgeDays;
  const response = await getJson(checkUrl(indicator.value, maxAge), {
    providerName: NAME,
    headers: { Key: ctx.apiKey },
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
  });
  const now = ctx.now();
  if (response.status !== 200) failForStatus(response, NAME, errorDetail(response.body), now);
  return toReport(indicator, response.body, maxAge, now);
}

async function checkKey(ctx: KeyCheckContext): Promise<string> {
  // AbuseIPDB has no dedicated key endpoint; this costs one of the day's checks.
  const response = await getJson(checkUrl('8.8.8.8', 1), {
    providerName: NAME,
    headers: { Key: ctx.apiKey },
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
  });
  if (response.status !== 200) failForStatus(response, NAME, errorDetail(response.body), ctx.now());
  const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? NaN);
  const limit = Number(response.headers.get('x-ratelimit-limit') ?? NaN);
  return Number.isFinite(remaining) && Number.isFinite(limit)
    ? `Key is valid · ${formatNumber(remaining)} of ${formatNumber(limit)} daily checks left.`
    : 'Key is valid.';
}

export const abuseipdb: Provider = {
  id: 'abuseipdb',
  name: NAME,
  supports: SUPPORTED,
  supportsLabel: 'IP addresses',
  apiKeyPattern: /^[0-9a-f]{80}$/i,
  apiKeyUrl: 'https://www.abuseipdb.com/account/api',
  reportUrl,
  lookup,
  checkKey,
};
