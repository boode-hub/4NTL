/** Every provider the extension knows about. Add new ids here first (see docs/ADDING_A_PROVIDER.md). */
export const PROVIDER_IDS = ['abuseipdb', 'virustotal'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}
