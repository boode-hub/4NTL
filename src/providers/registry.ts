import type { Indicator } from '../core/indicator';
import type { ProviderInfo } from '../core/messages';
import type { ProviderId } from '../core/provider-ids';
import { abuseipdb } from './abuseipdb';
import { echotrail } from './echotrail';
import { library } from './library';
import type { Provider } from './types';
import { virustotal } from './virustotal';

/** Display/menu order. Adding a provider = implement Provider + list it here. */
export const PROVIDERS: Readonly<Record<ProviderId, Provider>> = {
  abuseipdb,
  virustotal,
  echotrail,
  library,
};

export const PROVIDER_LIST: readonly Provider[] = Object.values(PROVIDERS);

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}

export function providersFor(indicator: Indicator): Provider[] {
  return PROVIDER_LIST.filter((provider) => provider.supports.has(indicator.type));
}

export function toInfo(provider: Provider): ProviderInfo {
  return { id: provider.id, name: provider.name };
}

/** Providers that only look up Windows processes (EchoTrail, the local library). */
export function isProcessProvider(provider: Provider): boolean {
  return [...provider.supports].every((type) => type === 'process');
}
