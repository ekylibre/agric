// Checks manifest.json and glyphs/ are consistent. Exits with 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { readManifest, puaRange, GLYPHS_DIR, NAME_PATTERN, ALLOWED_LICENSES } from './manifest.mjs';

const manifest = readManifest();
const { min, max } = puaRange(manifest);
const errors = [];
const codes = new Map();

for (const [name, icon] of Object.entries(manifest.icons)) {
  if (!NAME_PATTERN.test(name)) errors.push(`${name}: invalid name (expected ${NAME_PATTERN})`);
  if (!/^[0-9a-f]{4,5}$/.test(icon.code)) {
    errors.push(`${name}: invalid code "${icon.code}" (expected lowercase hex)`);
  } else {
    const code = parseInt(icon.code, 16);
    if (code < min || code > max) errors.push(`${name}: code ${icon.code} is outside the private use area ${manifest.font.pua.join('-')}`);
    if (codes.has(code)) errors.push(`${name}: code ${icon.code} already used by ${codes.get(code)}`);
    codes.set(code, name);
  }
  if (!icon.source) errors.push(`${name}: missing source`);
  if (icon.source !== 'legacy') {
    if (!ALLOWED_LICENSES.includes(icon.license)) errors.push(`${name}: license "${icon.license}" not in ${ALLOWED_LICENSES.join(', ')}`);
    if (!icon.url) errors.push(`${name}: missing url of the original icon`);
  }
  const file = path.join(GLYPHS_DIR, `${name}.svg`);
  if (!fs.existsSync(file)) {
    errors.push(`${name}: missing glyphs/${name}.svg`);
  } else if (!/<svg[\s>]/.test(fs.readFileSync(file, 'utf8'))) {
    errors.push(`${name}: glyphs/${name}.svg is not an SVG file`);
  }
}

for (const file of fs.readdirSync(GLYPHS_DIR)) {
  const name = path.basename(file, '.svg');
  if (!file.endsWith('.svg') || !manifest.icons[name]) errors.push(`glyphs/${file}: not declared in manifest.json`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`✓ ${codes.size} icons valid`);
