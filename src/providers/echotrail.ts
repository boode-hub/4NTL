/**
 * EchoTrail Insights — https://echotrail.io/docs
 * How a Windows process normally behaves, from 300 million+ real executions:
 * who starts it, what it starts, where it lives. A free key (10 a minute, 500 a
 * month) gets a summary with the usual parent; Team keys and up get the full
 * record with the top grandparents, parents and children. Only used when
 * "Look up Windows processes on EchoTrail" is on in the settings.
 */
import { formatNumber } from '../core/format';
import type { Indicator, IndicatorType } from '../core/indicator';
import { LookupError } from '../core/errors';
import type { Report, ReportList, Verdict } from '../core/result';
import { failForStatus, getJson } from './http';
import { facts, num, obj, str } from './json';
import type { KeyCheckContext, Provider, ProviderContext } from './types';

const NAME = 'EchoTrail';
const API = 'https://api.echotrail.io/v1';
const SITE = 'https://echotrail.io/insights';
const SUPPORTED: ReadonlySet<IndicatorType> = new Set(['process']);
/** Rows shown per ancestry list (the API sends up to 10). */
const LIST_ROWS = 5;
export const TEAM_KEY_NOTE =
  'Top grandparents, parents and children come with an EchoTrail Team key.';

function reportUrl(indicator: Indicator): string {
  return `${SITE}/${encodeURIComponent(indicator.value)}/`;
}

function processUrl(name: string): string {
  return `${API}/process/${encodeURIComponent(name)}`;
}

function errorDetail(body: unknown): string | undefined {
  return str(obj(obj(body).error).message) || undefined;
}

/**
 * A share as people read it. Never "0%" or "100%" for something that isn't:
 * a 0.04% parent or a 99.96% path is exactly the rare case an analyst hunts for.
 */
export function percent(value: number): string {
  if (value > 0 && value < 0.1) return '<0.1%';
  if (value > 99 && value < 100) return `${Math.floor(value * 10) / 10}%`;
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}%`;
}

interface Row {
  readonly name: string;
  readonly count: number | undefined;
  readonly percentage: number | undefined;
}

/** `{ top: [{ name | path, count, percentage }] }` → rows (untrusted: every field checked). */
function rows(value: unknown): Row[] {
  const top = obj(value).top;
  if (!Array.isArray(top)) return [];
  return top.flatMap((raw) => {
    const row = obj(raw);
    const name = (str(row.name) || str(row.path) || str(row.sha256)).slice(0, 260);
    // Hashes seen only in EchoTrail's lab have no count; their runs are under behavior.
    const count = num(row.count) ?? num(obj(row.behavior).executions);
    return name ? [{ name, count, percentage: num(row.percentage) }] : [];
  });
}

/** One ranked list: the share when EchoTrail gives one, else how often it was seen. */
function list(label: string, value: unknown, wide = false): ReportList | undefined {
  const items = rows(value)
    .slice(0, LIST_ROWS)
    .map((row) => ({
      name: row.name,
      detail:
        row.percentage !== undefined
          ? percent(row.percentage)
          : row.count !== undefined
            ? `${formatNumber(row.count)}×`
            : '',
    }));
  if (items.length === 0) return undefined;
  return wide ? { label, items, wide } : { label, items };
}

/** Both answer shapes: the free summary and the Team-and-up full record. */
export function toReport(indicator: Indicator, body: unknown): Report {
  const data = obj(body);
  const full = 'process_name' in data || 'parents' in data;
  const classification = obj(data.classification);
  const lab = obj(data.lab);
  const category = str(classification.category) || str(data.category);
  const publisher = str(classification.publisher) || str(data.publisher);
  const lolbin = classification.is_lolbin === true;
  const risk = str(classification.risk_level).toLowerCase();
  const executions = num(obj(data.executions).total);

  // The usual parent: the summary names it, the full record lists it first.
  const common = obj(data.most_common_parent);
  const [firstParent] = rows(data.parents);
  const parentName = str(common.name) || firstParent?.name || '';
  const parentShare = num(common.share_pct) ?? firstParent?.percentage;
  const [typicalPath] = rows(data.paths);

  const verdict: Verdict = risk === 'high' || risk === 'critical' ? 'suspicious' : 'unknown';
  const lists = full
    ? [
        list('Top grandparents', data.grandparents),
        list('Top parents', data.parents),
        list('Top children', data.children),
        list('Top paths', data.paths, true),
        list('Top hashes (SHA-256)', data.hashes, true),
      ].filter((item): item is ReportList => item !== undefined)
    : [];

  return {
    verdict,
    pill: lolbin ? 'LOLBin' : 'Known',
    headline:
      parentShare !== undefined && parentName
        ? percent(parentShare)
        : executions !== undefined
          ? formatNumber(executions)
          : 'Known',
    caption:
      parentShare !== undefined && parentName
        ? `of runs started by ${parentName}`
        : executions !== undefined
          ? 'executions seen'
          : category || 'Windows process',
    tags: [
      category,
      lolbin ? 'LOLBin' : '',
      risk ? `Risk: ${risk}` : '',
      obj(lab.persistence).present === true ? 'Persistence' : '',
      obj(lab.network).present === true ? 'Network activity' : '',
    ].filter((tag) => tag !== ''),
    facts: facts(
      ['Publisher', publisher || undefined],
      ['Expected parent', str(classification.expected_parent) || undefined],
      ['Executions', executions !== undefined ? formatNumber(executions) : undefined],
      [
        'Typical path',
        typicalPath && !full
          ? `${typicalPath.name}${typicalPath.percentage !== undefined ? ` (${percent(typicalPath.percentage)})` : ''}`
          : undefined,
      ],
      ['Signature', str(lab.signature_status) || undefined],
      ['About', str(data.description) || undefined],
    ),
    ...(lists.length > 0 ? { lists } : {}),
    ...(full ? {} : { note: TEAM_KEY_NOTE }),
    reportUrl: reportUrl(indicator),
  };
}

/** Not in EchoTrail's data yet: an answer, not a failure (EchoTrail queues it for its lab). */
function notSeen(indicator: Indicator, body: unknown): Report {
  const queued = obj(obj(body).error).queued_for_lab === true;
  return {
    verdict: 'unknown',
    pill: 'Not seen',
    headline: 'New',
    caption: 'not in EchoTrail’s data yet',
    tags: [],
    facts: facts(['Status', queued ? 'Queued for EchoTrail’s lab' : undefined]),
    reportUrl: reportUrl(indicator),
  };
}

async function lookup(indicator: Indicator, ctx: ProviderContext): Promise<Report> {
  const response = await getJson(processUrl(indicator.value), {
    providerName: NAME,
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
  });
  if (response.status === 404) return notSeen(indicator, response.body);
  // 403 is EchoTrail's plan gate, not a bad key.
  if (response.status === 403) {
    throw new LookupError(
      'bad_request',
      errorDetail(response.body) ?? `Your ${NAME} plan doesn't include this lookup.`,
    );
  }
  if (response.status !== 200) {
    failForStatus(response, NAME, errorDetail(response.body), ctx.now());
  }
  return toReport(indicator, response.body);
}

async function checkKey(ctx: KeyCheckContext): Promise<string> {
  // A real lookup: it counts as one of the month's requests.
  const response = await getJson(processUrl('svchost.exe'), {
    providerName: NAME,
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
  });
  if (response.status !== 200 && response.status !== 404) {
    failForStatus(response, NAME, errorDetail(response.body), ctx.now());
  }
  return 'process_name' in obj(response.body)
    ? 'Key is valid · full records with grandparents, parents and children.'
    : 'Key is valid · free plan: summaries and the usual parent, 500 lookups a month.';
}

export const echotrail: Provider = {
  id: 'echotrail',
  name: NAME,
  hosts: ['https://api.echotrail.io/*'],
  supports: SUPPORTED,
  supportsLabel: 'Windows process names',
  apiKeyPattern: /^et_live_[A-Za-z0-9_-]{8,}$/,
  apiKeyUrl: 'https://echotrail.io/developers/',
  reportUrl,
  lookup,
  checkKey,
};
