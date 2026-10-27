/**
 * Indicator (IOC) detection: turns whatever the analyst selected into a
 * canonical, typed indicator. Pure and dependency-free so it can run in any
 * extension context and is exhaustively unit-tested.
 */
import { unwrapRedirect } from './redirects';

export const INDICATOR_TYPES = ['ipv4', 'ipv6', 'md5', 'sha1', 'sha256', 'domain', 'url'] as const;
export type IndicatorType = (typeof INDICATOR_TYPES)[number];

export interface Indicator {
  readonly type: IndicatorType;
  /** Canonical form: refanged, lower-cased where case-insensitive, IP ports stripped. */
  readonly value: string;
}

export const INDICATOR_LABELS: Readonly<Record<IndicatorType, string>> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  domain: 'Domain',
  url: 'URL',
};

/** Selections longer than this are truncated before scanning. */
export const MAX_SELECTION_LENGTH = 10_000;
/** At most this many indicators are offered when a selection contains several. */
export const MAX_CHOICES = 12;
const MAX_TOKEN_LENGTH = 2048;

export function isIndicatorType(value: unknown): value is IndicatorType {
  return typeof value === 'string' && (INDICATOR_TYPES as readonly string[]).includes(value);
}

export function indicatorKey(indicator: Indicator): string {
  return `${indicator.type}:${indicator.value}`;
}

const REFANG_RULES: readonly (readonly [RegExp, string])[] = [
  [/\[\s*(?:\.|dot)\s*\]|\(\s*(?:\.|dot)\s*\)|\{\s*(?:\.|dot)\s*\}/gi, '.'],
  [/\\\./g, '.'],
  [/\[\s*:\/\/\s*\]/g, '://'],
  [/\[\s*:\s*\]/g, ':'],
  [/\[\s*\/\s*\]/g, '/'],
  [/\bh[x*]{2}p(s?)\b/gi, 'http$1'],
];

/** Reverses common IOC "defanging": `1.2.3[.]4`, `evil(dot)com`, `hxxps[:]//…`. */
export function refang(text: string): string {
  return REFANG_RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

const LEADING_JUNK = /^["'`<({]+/;
const TRAILING_JUNK = /["'`>}\],;!?.]+$/;
const KEY_VALUE = /^[a-z_][\w.-]*=(.+)$/i;
const SCHEME = /^(?:https?|ftp):\/\//i;

/** Strips quotes, brackets and sentence punctuation that cling to tokens copied from prose or logs. */
function cleanToken(raw: string): string {
  let token = raw.trim();
  // `src=1.2.3.4` (log key/value) → `1.2.3.4`, but leave URLs with query strings alone.
  const kv = SCHEME.test(token) ? null : KEY_VALUE.exec(token);
  if (kv?.[1]) token = kv[1];
  token = token.replace(LEADING_JUNK, '');
  // A closing `)` or `]` is only junk when unbalanced, e.g. `(1.2.3.4)` vs `…/Foo_(bar)`.
  for (;;) {
    const before = token;
    token = token.replace(TRAILING_JUNK, (junk) =>
      junk.includes(']') ? keepBalanced(token, junk) : '',
    );
    if (token.endsWith(')') && count(token, '(') < count(token, ')')) token = token.slice(0, -1);
    if (token === before) return token;
  }
}

function keepBalanced(token: string, junk: string): string {
  // `[2001:db8::1]` keeps its bracket; `1.2.3.4]` loses it.
  const body = token.slice(0, token.length - junk.length);
  return body.includes('[') ? junk.slice(0, junk.indexOf(']') + 1) : '';
}

function count(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n++;
  return n;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?$/;

function parseIPv4(token: string): Indicator | null {
  const match = IPV4.exec(token);
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  // Number() also normalises zero-padded octets from logs (192.168.001.010).
  return { type: 'ipv4', value: octets.join('.') };
}

const BRACKETED = /^\[([^\]]+)\](?::\d{1,5})?$/;
const IPV6_CHARS = /^[0-9a-f:.]+$/i;

function parseIPv6(token: string): Indicator | null {
  const inner = (BRACKETED.exec(token)?.[1] ?? token).replace(/%[\w.-]+$/, '');
  if (!inner.includes(':') || !IPV6_CHARS.test(inner)) return null;
  try {
    // The WHATWG URL parser is a complete, battle-tested IPv6 validator and
    // serialises to the canonical compressed lower-case form.
    const host = new URL(`http://[${inner}]/`).hostname;
    return { type: 'ipv6', value: host.slice(1, -1) };
  } catch {
    return null;
  }
}

const HASH_TYPES: Readonly<Record<number, IndicatorType>> = { 32: 'md5', 40: 'sha1', 64: 'sha256' };
const HEX = /^[0-9a-f]+$/i;

function parseHash(token: string): Indicator | null {
  const type = HASH_TYPES[token.length];
  return type && HEX.test(token) ? { type, value: token.toLowerCase() } : null;
}

/**
 * Common file extensions that are not TLDs, so `payload.exe` or `Node.js` are
 * not mistaken for domains. Extensions that are real TLDs (.zip, .mov, .py, .sh)
 * are deliberately absent.
 */
const NON_TLD_EXTENSIONS = new Set(
  (
    'exe dll sys drv bat cmd ps1 psm1 psd1 vbs vbe js jse wsf wsh hta scr cpl msi msp lnk inf reg ' +
    'jar class php asp aspx jsp cgi htm html xhtml xml json yml yaml txt log csv tsv ini cfg conf ' +
    'dat tmp bak pdf doc docx docm dotm xls xlsx xlsm ppt pptx pptm rtf odt ods eml msg png jpg ' +
    'jpeg gif bmp svg ico webp mp3 mp4 wav avi mkv iso img vhd vhdx dmg apk deb rpm gz tgz bz2 xz ' +
    'rar tar elf dylib bin ts tsx jsx css scss toml pem crt cer pfx p12 der csr sql db sqlite plist'
  ).split(' '),
);

const DOMAIN =
  /^(?=.{4,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const PORT_SUFFIX = /:\d{1,5}$/;

function parseDomain(token: string): Indicator | null {
  let domain = token.replace(PORT_SUFFIX, '').replace(/\.$/, '').toLowerCase();
  if (/[^\p{ASCII}]/u.test(domain)) {
    // Internationalised domain → punycode (what the threat-intel APIs index).
    try {
      domain = new URL(`http://${domain}/`).hostname;
    } catch {
      return null;
    }
  }
  if (!DOMAIN.test(domain)) return null;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return NON_TLD_EXTENSIONS.has(tld) ? null : { type: 'domain', value: domain };
}

const CIDR_SUFFIX = /^\/\d{1,3}$/;

function parseUrl(token: string): Indicator | null {
  let candidate = token;
  if (!SCHEME.test(candidate)) {
    // Scheme-less `evil.com/payload` → URL, but `10.0.0.0/8` is a CIDR, not a URL.
    const slash = candidate.indexOf('/');
    if (slash <= 0) return null;
    const host = candidate.slice(0, slash);
    if (CIDR_SUFFIX.test(candidate.slice(slash))) return null;
    if (!parseIPv4(host) && !parseDomain(host)) return null;
    candidate = `http://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (!url.hostname) return null;
    // Safe Links, Proofpoint, Google… wrappers: look up where the link really goes.
    return { type: 'url', value: unwrapRedirect(candidate) };
  } catch {
    return null;
  }
}

function parseToken(raw: string): Indicator | null {
  const token = cleanToken(raw);
  if (!token || token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) return null;
  // Order matters: an IPv4 or hash must never fall through to the domain/URL rules.
  return (
    parseIPv4(token) ??
    parseIPv6(token) ??
    parseHash(token) ??
    parseUrl(token) ??
    parseDomain(token) ??
    parseBracketedOther(token)
  );
}

/** `[1.2.3.4]` or `[evil.com]` (bracket-wrapped in reports) → the inner indicator. */
function parseBracketedOther(token: string): Indicator | null {
  const inner = BRACKETED.exec(token)?.[1];
  return inner ? parseToken(inner) : null;
}

/** Parses the whole text as exactly one indicator, or returns null. */
export function parseIndicator(text: string): Indicator | null {
  return parseToken(refang(text));
}

const TOKEN_SEPARATORS = /[\s,;|"'`<>{}]+/;

/** Finds distinct indicators in free text (log lines, report paragraphs), in order of appearance. */
export function extractIndicators(text: string, limit = MAX_CHOICES + 1): Indicator[] {
  const seen = new Set<string>();
  const found: Indicator[] = [];
  for (const token of refang(text).split(TOKEN_SEPARATORS)) {
    const indicator = parseToken(token);
    if (!indicator || seen.has(indicatorKey(indicator))) continue;
    seen.add(indicatorKey(indicator));
    found.push(indicator);
    if (found.length >= limit) break;
  }
  return found;
}

export type SelectionResolution =
  | { readonly kind: 'single'; readonly indicator: Indicator }
  | {
      readonly kind: 'multiple';
      readonly indicators: readonly Indicator[];
      readonly truncated: boolean;
    }
  | { readonly kind: 'none' };

/** Decides what a selection means: one indicator, a choice between several, or nothing usable. */
export function resolveSelection(text: string): SelectionResolution {
  const capped = text.slice(0, MAX_SELECTION_LENGTH);
  const whole = parseIndicator(capped);
  if (whole) return { kind: 'single', indicator: whole };

  const found = extractIndicators(capped, MAX_CHOICES + 1);
  const [first] = found;
  if (!first) return { kind: 'none' };
  if (found.length === 1) return { kind: 'single', indicator: first };
  return {
    kind: 'multiple',
    indicators: found.slice(0, MAX_CHOICES),
    truncated: found.length > MAX_CHOICES,
  };
}
