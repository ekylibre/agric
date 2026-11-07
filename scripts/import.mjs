// Imports external SVG icons into glyphs/ and declares them in manifest.json.
//
//   node scripts/import.mjs <batch.json>
//
// batch.json is a list of entries:
//   {
//     "name": "potato",                       // Agric icon name (kebab-case)
//     "url": "https://…/russet-potato.svg",   // original file (http(s) URL or local path)
//     "source": "open-crop-icons",            // icon set name
//     "license": "CC0-1.0",                   // SPDX id, see ALLOWED_LICENSES
//     "mode": "vector" | "trace",             // optional, default "vector"
//     "trace": { "detail": 35 }               // trace mode only, optional tuning (see trace())
//   }
//
// Modes:
// - vector: monochrome icons (filled or stroked, e.g. Lucide, Healthicons). Strokes are
//   converted to outlines and all shapes are merged with Inkscape, so the glyph is a
//   plain filled path as required by fonts.
// - trace: multi-colour illustrations (e.g. Open Crop Icons). The icon is rendered,
//   dark colours become ink and light colours become cut-outs, then it is vectorized
//   back with potrace.
//
// Every glyph is then scaled and centered to fit a 850×850 box in the 1000×1000 grid,
// which matches the median footprint of the existing icons.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import potrace from 'potrace';
import { optimize } from 'svgo';
import { readManifest, writeManifest, nextFreeCode, ROOT, GLYPHS_DIR, NAME_PATTERN, ALLOWED_LICENSES } from './manifest.mjs';

const GRID = 1000;
const BOX = 850;
const WORK_DIR = path.join(ROOT, 'tmp', 'import'); // inside $HOME so a sandboxed (snap) Inkscape can read it
const INKSCAPE = process.env.INKSCAPE || 'inkscape';

async function fetchSvg(location) {
  if (/^https?:\/\//.test(location)) {
    const response = await fetch(location);
    if (!response.ok) throw new Error(`${location}: HTTP ${response.status}`);
    return response.text();
  }
  return fs.readFileSync(location, 'utf8');
}

function viewBoxOf(svg) {
  const root = svg.match(/<svg\b[^>]*>/)[0];
  const viewBox = root.match(/viewBox="([^"]*)"/)?.[1];
  if (viewBox) return viewBox.trim().split(/[\s,]+/).map(Number);
  const size = (name) => parseFloat(root.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] || '0');
  return [0, 0, size('width'), size('height')];
}

const innerOf = (svg) => svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// Rasterizes an SVG so that its longest side is `size` pixels. The density is computed
// from the intrinsic size (width/height attributes), which may differ from the viewBox.
async function render(svg, size) {
  const buffer = Buffer.from(svg);
  const { width, height } = await sharp(buffer).metadata();
  return sharp(buffer, { density: (72 * size) / Math.max(width, height) });
}

// Strokes → outlines, everything merged into one filled path.
function outline(svg, name) {
  const input = path.join(WORK_DIR, `${name}.in.svg`);
  const output = path.join(WORK_DIR, `${name}.out.svg`);
  fs.writeFileSync(input, svg.replace(/currentColor/g, '#000'));
  execFileSync(
    INKSCAPE,
    [
      input,
      '--actions=select-all:all;selection-ungroup;select-all:all;selection-ungroup;select-all:all;object-to-path;object-stroke-to-path;select-all:all;path-union;export-plain-svg;export-filename:' +
        output +
        ';export-do',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return fs.readFileSync(output, 'utf8');
}

// Turns a colour illustration into a solid silhouette, then vectorizes it with potrace:
// - every opaque, non-white pixel is ink (silhouette);
// - white highlights are cut out;
// - inside the silhouette, lines clearly darker than their neighbourhood (contours
//   between parts, seeds, spots…) are cut out too, so the shape keeps its details.
async function trace(svg, { detail = 12, highlight = 235, border = 64, radius = 9 } = {}) {
  const { data, info } = await (await render(svg, GRID)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const raw = () => ({ raw: { width, height, channels: 1 } });
  const pixels = width * height;
  const luminance = Buffer.alloc(pixels);
  const silhouette = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i++) {
    const [r, g, b, a] = data.subarray(i * 4, i * 4 + 4);
    luminance[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    silhouette[i] = a > 127 && luminance[i] < highlight ? 255 : 0;
  }
  // Interior = silhouette eroded by `border` px (a pixel d px inside a straight edge keeps
  // more than 98% after a Gaussian blur of sigma d/2.05), so that the dark outer outline of the
  // illustration is not mistaken for an inner detail (blur + strict threshold).
  const interior = await sharp(silhouette, raw()).blur(border / 2.05).toColourspace('b-w').raw().toBuffer();
  const neighbourhood = await sharp(luminance, raw()).blur(radius).toColourspace('b-w').raw().toBuffer();
  const mono = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i++) {
    const isDetail = interior[i] > 250 && luminance[i] < neighbourhood[i] - detail;
    mono[i] = silhouette[i] && !isDetail ? 0 : 255;
  }
  const png = await sharp(mono, raw()).png().toBuffer();
  if (process.env.AGRIC_DEBUG) fs.writeFileSync(path.join(WORK_DIR, `debug-${Date.now()}.png`), png);
  const traced = await new Promise((resolve, reject) =>
    potrace.trace(png, { threshold: 128, turdSize: 30, optTolerance: 0.3 }, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
  return traced.replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${info.width} ${info.height}">`);
}

// Scales and centers the drawing into the BOX, in a GRID×GRID viewBox, as one path.
async function fit(svg) {
  const [minX, minY, width, height] = viewBoxOf(svg);
  const probe = GRID * 2;
  const scale = probe / Math.max(width, height);
  const { info } = await (await render(svg, probe)).trim().toBuffer({ resolveWithObject: true });
  const [left, top] = [-(info.trimOffsetLeft || 0) / scale, -(info.trimOffsetTop || 0) / scale];
  const [w, h] = [info.width / scale, info.height / scale];
  const k = BOX / Math.max(w, h);
  const tx = (GRID - w * k) / 2 - (left + minX) * k;
  const ty = (GRID - h * k) / 2 - (top + minY) * k;
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}"><g transform="translate(${tx} ${ty}) scale(${k})">${innerOf(svg)}</g></svg>`;
  const optimized = optimize(wrapped, {
    multipass: true,
    plugins: [
      { name: 'preset-default', params: { overrides: { convertPathData: { applyTransforms: true } } } },
      'removeDimensions',
      { name: 'removeAttrs', params: { attrs: ['fill', 'stroke', 'class', 'style', 'id', 'data-name'] } },
    ],
  }).data;
  return optimized;
}

async function importIcon(entry, manifest) {
  const { name, url, source, license, mode = 'vector', trace: traceOptions } = entry;
  if (!NAME_PATTERN.test(name)) throw new Error(`${name}: invalid name`);
  if (!ALLOWED_LICENSES.includes(license)) throw new Error(`${name}: license ${license} not allowed`);
  if (manifest.icons[name] && manifest.icons[name].url !== url) throw new Error(`${name}: already exists`);

  const original = await fetchSvg(url);
  fs.writeFileSync(path.join(WORK_DIR, `${name}.original.svg`), original);
  // potrace draws holes for the even-odd rule; the Inkscape union re-winds them for fonts (nonzero).
  const monochrome = outline(mode === 'trace' ? await trace(original, traceOptions) : original, name);
  const glyph = await fit(monochrome);
  fs.writeFileSync(path.join(GLYPHS_DIR, `${name}.svg`), glyph + '\n');

  const code = manifest.icons[name]?.code || nextFreeCode(manifest);
  manifest.icons[name] = { code, source, license, url };
  console.log(`✓ ${name} (${code}) ← ${source} [${mode}]`);
}

const batchFile = process.argv[2];
if (!batchFile) {
  console.error('Usage: node scripts/import.mjs <batch.json>');
  process.exit(1);
}
fs.mkdirSync(WORK_DIR, { recursive: true });
const manifest = readManifest();
let failures = 0;
for (const entry of JSON.parse(fs.readFileSync(batchFile, 'utf8'))) {
  try {
    await importIcon(entry, manifest);
  } catch (error) {
    failures++;
    console.error(`✗ ${entry.name}: ${error.message}`);
  }
}
writeManifest(manifest);
if (failures) process.exit(1);
