// Shared helpers around manifest.json, the single source of truth of the icon set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
export const GLYPHS_DIR = path.join(ROOT, 'glyphs');
export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Licenses compatible with redistribution inside an MIT package without per-icon conditions.
export const ALLOWED_LICENSES = ['MIT', 'ISC', 'CC0-1.0', 'Apache-2.0', 'OFL-1.1'];

export function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

// One icon per line keeps diffs readable when icons are added.
export function writeManifest(manifest) {
  const icons = Object.keys(manifest.icons)
    .sort()
    .map((name) => `    ${JSON.stringify(name)}: ${JSON.stringify(manifest.icons[name])}`)
    .join(',\n');
  const head = Object.entries(manifest)
    .filter(([key]) => key !== 'icons')
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');
  fs.writeFileSync(MANIFEST_PATH, `{\n${head},\n  "icons": {\n${icons}\n  }\n}\n`);
}

export function puaRange(manifest) {
  const [min, max] = manifest.font.pua.map((hex) => parseInt(hex, 16));
  return { min, max };
}

// Next free code point in the private use area.
export function nextFreeCode(manifest) {
  const { min, max } = puaRange(manifest);
  const used = new Set(Object.values(manifest.icons).map((icon) => parseInt(icon.code, 16)));
  for (let code = min; code <= max; code++) {
    if (!used.has(code)) return code.toString(16);
  }
  throw new Error('No free code point left in the private use area');
}

// Icons sorted by code point, as [name, icon] pairs.
export function iconsByCode(manifest) {
  return Object.entries(manifest.icons).sort((a, b) => parseInt(a[1].code, 16) - parseInt(b[1].code, 16));
}
