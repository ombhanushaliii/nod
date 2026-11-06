// Run after `expo export --platform web`, before uploading dist/ to Vercel.
//
// Expo puts the fonts and icons that come from packages under
// dist/assets/node_modules/. Vercel never uploads a folder called node_modules,
// so on the live site those files 404 (the app falls back to a serif font).
// This moves them to dist/assets/_pkgs/ and points the JS bundles there.
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const from = join(dist, 'assets/node_modules');
const to = join(dist, 'assets/_pkgs');

if (!existsSync(from)) {
  console.log('web-deploy-fix: nothing to move');
  process.exit(0);
}
renameSync(from, to);

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});

let changed = 0;
for (const file of files(dist).filter((f) => /\.(js|html|json)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('/assets/node_modules/')) continue;
  writeFileSync(file, text.replaceAll('/assets/node_modules/', '/assets/_pkgs/'));
  changed++;
}
console.log(`web-deploy-fix: moved package assets to assets/_pkgs, updated ${changed} file(s)`);
