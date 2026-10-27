/**
 * Unwraps link-protection and tracking redirects (Outlook Safe Links,
 * Proofpoint URL Defense, Google, Facebook, …) so lookups hit the real
 * destination instead of the wrapper. Pure; never makes a request.
 */

type Unwrap = (url: URL) => string | null | undefined;

const param =
  (name: string): Unwrap =>
  (url) =>
    url.searchParams.get(name);

/** Proofpoint v2: `-XX` is a percent escape and `_` is a slash. */
const proofpointV2: Unwrap = (url) => {
  const encoded = url.searchParams.get('u');
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded.replace(/-/g, '%').replace(/_/g, '/'));
  } catch {
    return undefined;
  }
};

const RUN_LENGTHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Proofpoint v3: `/v3/__<url>__;<base64url>!!…`. Characters Proofpoint
 * replaced with `*` (or `**X`, a run of several) are restored, in order, from
 * the base64 block.
 */
const proofpointV3: Unwrap = (url) => {
  const match = /\/v3\/__(.+?)__;([A-Za-z0-9_-]*)!!/.exec(url.href);
  const [, encoded, base64] = match ?? [];
  if (encoded === undefined || base64 === undefined) return undefined;
  let replacements: string[];
  try {
    const padded = base64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    replacements = Array.from(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  let next = 0;
  const decoded = encoded.replace(/\*(\*.)?/g, (_star, run: string | undefined) => {
    const count = run ? RUN_LENGTHS.indexOf(run.charAt(1)) + 2 : 1;
    next += count;
    return replacements.slice(next - count, next).join('');
  });
  // Too few replacement characters: the link is damaged, don't guess.
  return next <= replacements.length ? decoded : undefined;
};

const RULES: readonly (readonly [host: RegExp, path: RegExp, unwrap: Unwrap])[] = [
  [/(^|\.)safelinks\.protection\.outlook\.com$/, /^\//, param('url')],
  [/^urldefense\.proofpoint\.com$/, /^\/v1\/url/, param('u')],
  [/^urldefense\.proofpoint\.com$/, /^\/v2\/url/, proofpointV2],
  [/^urldefense\.com$/, /^\/v3\//, proofpointV3],
  [/^linkprotect\.cudasvc\.com$/, /^\/url/, param('a')],
  [
    /^(www\.)?google\.[a-z.]+$/,
    /^\/url$/,
    (url) => url.searchParams.get('q') ?? url.searchParams.get('url'),
  ],
  [/^(l|lm)\.facebook\.com$/, /^\/l\.php$/, param('u')],
  [/^l\.instagram\.com$/, /^\/$/, param('u')],
  [/^(www\.)?youtube\.com$/, /^\/redirect$/, param('q')],
  [/^slack-redir\.net$/, /^\/link$/, param('url')],
  [/^(www\.)?linkedin\.com$/, /^\/(redir\/redirect|safety\/go)/, param('url')],
  [/^(www\.)?steamcommunity\.com$/, /^\/linkfilter\//, param('url')],
];

const HTTP_URL = /^https?:\/\//i;

/** Returns the real destination of a known redirect wrapper (nested up to 3 deep), else the input. */
export function unwrapRedirect(input: string): string {
  let current = input;
  for (let depth = 0; depth < 3; depth++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return current;
    }
    const rule = RULES.find(([host, path]) => host.test(url.hostname) && path.test(url.pathname));
    const next = rule?.[2](url)?.trim();
    if (!next || !HTTP_URL.test(next)) return current;
    current = next;
  }
  return current;
}
