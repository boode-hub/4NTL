/** Compile-time constants injected by esbuild (see scripts/build.mjs) and vitest.config.ts. */
declare const __E2E__: boolean;
declare const __VERSION__: string;
/** The Chrome Web Store / Firefox Add-ons edition, with the paid unlock. */
declare const __STORE__: boolean;
/** Build time (ms since epoch). */
declare const __BUILT_AT__: number;

/** Font files are inlined as base64 strings (esbuild `loader: { '.woff2': 'base64' }`). */
declare module '*.woff2' {
  const base64: string;
  export default base64;
}
