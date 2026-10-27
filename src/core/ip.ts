/**
 * Public vs. private/reserved address classification. Non-public addresses are
 * never sent to third-party services: they cannot have reputation data, and
 * sending them would leak internal network details.
 */
import type { Indicator } from './indicator';

/** IPv4 ranges that are not globally routable (RFC 6890 special-purpose registry). */
const NON_PUBLIC_V4_CIDRS = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8', // private
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local
  '172.16.0.0/12', // private
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // documentation (TEST-NET-1)
  '192.168.0.0/16', // private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // documentation (TEST-NET-2)
  '203.0.113.0/24', // documentation (TEST-NET-3)
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved + limited broadcast
] as const;

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

const NON_PUBLIC_V4 = NON_PUBLIC_V4_CIDRS.map((cidr) => {
  const [base = '', bits = '32'] = cidr.split('/');
  const start = ipv4ToInt(base);
  return [start, start + 2 ** (32 - Number(bits)) - 1] as const;
});

/** @param ip canonical dotted-quad IPv4 */
export function isPublicIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return !NON_PUBLIC_V4.some(([start, end]) => n >= start && n <= end);
}

/** Expands a (compressed, hex-only) IPv6 address to its eight 16-bit groups. */
export function expandIPv6(ip: string): number[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string | undefined) => (part ? part.split(':') : []);
  const head = toGroups(halves[0]);
  const tail = toGroups(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** @param ip canonical IPv6 (as produced by the indicator parser) */
export function isPublicIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = g;
  // IPv4-mapped (::ffff:a.b.c.d): classify the embedded IPv4 address.
  if (g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) {
    return isPublicIPv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join('.'));
  }
  // Only global unicast (2000::/3) is public; this excludes ::1, fc00::/7, fe80::/10, ff00::/8…
  if ((g0 & 0xe000) !== 0x2000) return false;
  // …minus the documentation prefixes 2001:db8::/32 and 3fff::/20.
  if (g0 === 0x2001 && g1 === 0x0db8) return false;
  if (g0 === 0x3fff && (g1 & 0xf000) === 0) return false;
  return true;
}

/** True unless the indicator is an IP address outside the public internet. */
export function isPublicAddress(indicator: Indicator): boolean {
  switch (indicator.type) {
    case 'ipv4':
      return isPublicIPv4(indicator.value);
    case 'ipv6':
      return isPublicIPv6(indicator.value);
    default:
      return true;
  }
}
