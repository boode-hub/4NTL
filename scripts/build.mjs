/**
 * Builds the extension into dist/ (or dist-e2e/ with --e2e).
 *
 *   node scripts/build.mjs           production build (minified, no source maps)
 *   node scripts/build.mjs --watch   development build, rebuilds on change
 *   node scripts/build.mjs --e2e     test build: test hooks + broad host access
 *   node scripts/build.mjs --firefox production build for Firefox, into dist-firefox/
 *   node scripts/build.mjs --store   store edition (paid unlock via ExtensionPay), into dist-store/
 *                                    (combine: --store --firefox → dist-store-firefox/)
 */
import { context, build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createManifest } from './manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const e2e = args.has('--e2e');
const browser = args.has('--firefox') ? 'firefox' : 'chromium';
const store = args.has('--store');
const production = !watch && !e2e;
// dist, dist-firefox, dist-store, dist-store-firefox, dist-e2e, dist-e2e-store
const outdir = path.join(
  root,
  ['dist', e2e && 'e2e', store && 'store', browser === 'firefox' && 'firefox']
    .filter(Boolean)
    .join('-'),
);

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

/** Service worker is an ES module; injected/page scripts are classic scripts. */
const entries = [
  { in: 'src/background/index.ts', out: 'background', format: 'esm' },
  { in: 'src/content/index.ts', out: 'content', format: 'iife' },
  { in: 'src/options/options.ts', out: 'options', format: 'iife' },
  { in: 'src/result/result.ts', out: 'result', format: 'iife' },
  { in: 'src/list/list.ts', out: 'list', format: 'iife' },
];

const staticFiles = [
  ['src/options/options.html', 'options.html'],
  ['src/options/options.css', 'options.css'],
  ['src/result/result.html', 'result.html'],
  ['src/list/list.html', 'list.html'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['public/icons', 'icons'],
  // ExtensionPay's own content script on extensionpay.com (reports purchases back).
  // Shipped as the unmodified library file (LGPL), store edition only.
  ...(store ? [['node_modules/extpay/dist/ExtPay.js', 'ExtPay.js']] : []),
];

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  target: ['chrome123', 'firefox140'],
  outdir,
  minify: production,
  sourcemap: production ? false : 'linked',
  legalComments: 'none',
  loader: { '.woff2': 'base64' },
  // The GitHub edition gets a stub instead of ExtensionPay: no payment code at all.
  alias: store ? {} : { extpay: path.join(root, 'src/background/extpay-free.ts') },
  logLevel: 'info',
  define: {
    __E2E__: JSON.stringify(e2e),
    __VERSION__: JSON.stringify(pkg.version),
    __STORE__: JSON.stringify(store),
    __BUILT_AT__: JSON.stringify(Date.now()),
  },
};

async function writeStatic() {
  await mkdir(outdir, { recursive: true });
  for (const [from, to] of staticFiles) {
    await cp(path.join(root, from), path.join(outdir, to), { recursive: true });
  }
  const manifest = createManifest({ version: pkg.version, e2e, browser, store });
  await writeFile(path.join(outdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(outdir, { recursive: true, force: true });
await writeStatic();

const configs = entries.map((entry) => ({
  ...shared,
  entryPoints: { [entry.out]: path.join(root, entry.in) },
  format: /** @type {'esm' | 'iife'} */ (entry.format),
}));

if (watch) {
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log(`Watching… load ${path.relative(root, outdir)}/ as an unpacked extension.`);
} else {
  await Promise.all(configs.map((config) => build(config)));
  console.log(
    `Built ${path.relative(root, outdir)}/ (v${pkg.version}${e2e ? ', e2e' : ''}${store ? ', store' : ''}).`,
  );
}
