/**
 * Plain-text forms of a card's results: the full report for "Copy full report"
 * (pastes cleanly into tickets and chats) and the one-line summary kept in the
 * saved list.
 */
import { INDICATOR_LABELS, type Indicator } from './indicator';
import { VERDICT_LABELS, VERDICTS, type LookupOutcome, type Verdict } from './result';

export interface ProviderResult {
  readonly name: string;
  /** Missing while the lookup is still running. */
  readonly outcome?: LookupOutcome | undefined;
}

function providerLines({ name, outcome }: ProviderResult): string[] {
  if (!outcome) return [`${name}: still checking`];
  if (!outcome.ok) return [`${name}: ${outcome.error.message}`];
  const { report } = outcome;
  return [
    `${name}: ${VERDICT_LABELS[report.verdict]}, ${report.headline} ${report.caption}`,
    ...(report.tags.length > 0 ? [`  Tags: ${report.tags.join(', ')}`] : []),
    ...report.facts.map((fact) => `  ${fact.label}: ${fact.value}`),
    `  ${report.reportUrl}`,
  ];
}

export function formatReportText(
  indicator: Indicator,
  results: readonly ProviderResult[],
  nowMs: number,
): string {
  return [
    `${indicator.value} (${INDICATOR_LABELS[indicator.type]})`,
    `Checked with 4NTL, ${new Date(nowMs).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ...results.flatMap((result) => ['', ...providerLines(result)]),
  ].join('\n');
}

/** The most severe verdict among finished lookups, or undefined if none finished. */
export function worstVerdict(results: readonly ProviderResult[]): Verdict | undefined {
  const found = new Set(results.map((r) => (r.outcome?.ok ? r.outcome.report.verdict : null)));
  return VERDICTS.find((verdict) => found.has(verdict));
}

/** "AbuseIPDB: Malicious 100% · VirusTotal: Malicious 14 / 94". */
export function summarize(results: readonly ProviderResult[]): string {
  return results
    .flatMap(({ name, outcome }) =>
      outcome?.ok
        ? [`${name}: ${VERDICT_LABELS[outcome.report.verdict]} ${outcome.report.headline}`]
        : [],
    )
    .join(' · ');
}

/** The first "Country" fact any provider reported. */
export function countryOf(results: readonly ProviderResult[]): string {
  for (const { outcome } of results) {
    const fact = outcome?.ok && outcome.report.facts.find((f) => f.label === 'Country');
    if (fact) return fact.value;
  }
  return '';
}
