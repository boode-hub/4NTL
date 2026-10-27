/**
 * Release guard: fails if dist/ is not a clean production build. Catches the
 * e2e build (test hooks, <all_urls>) or debug artefacts ever being shipped.
 *
 *   node scripts/verify-dist.mjs
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const problems = [];

async function exists(file) {
  return stat(path.join(dist, file)).then(
    () => true,
    () => false,
  );
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dist, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    );
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  problems.push(`manifest version ${manifest.version} != package.json ${pkg.version}`);
}
if (manifest.host_permissions.some((host) => host === '<all_urls>' || host.startsWith('*://'))) {
  problems.push('manifest grants broad host access (e2e build?)');
}
if (manifest.content_scripts) {
  problems.push('manifest declares content_scripts; the UI must stay on-demand');
}

const referenced = [
  manifest.background.service_worker,
  manifest.options_ui.page,
  'content.js',
  'result.html',
  ...Object.values(manifest.icons),
];
for (const file of referenced) {
  if (!(await exists(file))) problems.push(`missing ${file}`);
}

for (const file of await listFiles(dist)) {
  if (file.endsWith('.map')) problems.push(`source map shipped: ${file}`);
  if (file.endsWith('.js')) {
    const code = await readFile(path.join(dist, file), 'utf8');
    if (code.includes('__4ntl')) problems.push(`test hook present in ${file}`);
    if (/\beval\(|new Function\(/.test(code)) problems.push(`dynamic code evaluation in ${file}`);
  }
}

if (problems.length > 0) {
  console.error(`dist/ failed release checks:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`dist/ v${manifest.version} passed release checks.`);
