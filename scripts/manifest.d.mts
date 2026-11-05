/** Types for manifest.mjs, so tests can import it. */
export declare const GECKO_ID: string;

export declare function createManifest(options: {
  version: string;
  e2e?: boolean;
  store?: boolean;
}): chrome.runtime.ManifestV3 & {
  minimum_chrome_version?: string;
  optional_host_permissions?: string[];
  browser_specific_settings?: {
    gecko: {
      id: string;
      strict_min_version: string;
      data_collection_permissions: { required: string[] };
    };
    gecko_android: { strict_min_version: string };
  };
  background: { service_worker?: string; scripts?: string[]; type?: string };
};
