// Builds every Agric deliverable from manifest.json + glyphs/.
//
//   node scripts/build.mjs               full build (gem assets + dist/)
//   node scripts/build.mjs --only=fonts  gem assets only (fonts + SCSS), used by CI
//
// The SVG font produced by svgicons2svgfont is the reference: every other format
// (SVG, sprite, PNG, VectorDrawable, iOS asset catalog) is derived from its glyph
// paths, so all formats render exactly the same shape.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import ttf2woff from 'ttf2woff';
import ttf2woff2 from 'ttf2woff2';
import svgpath from 'svgpath';
import sharp from 'sharp';
import svg2vectordrawable from 'svg2vectordrawable';
import * as sass from 'sass';
import { optimize } from 'svgo';
import { readManifest, iconsByCode, ROOT, GLYPHS_DIR } from './manifest.mjs';

const ONLY = (process.argv.find((arg) => arg.startsWith('--only=')) || '').split('=')[1];
const PNG_SIZES = [24, 36, 48, 72, 96]; // iOS @1x/@2x/@3x (24/48/72) + Android mdpi→xxxhdpi (24→96)
const VECTOR_SIZE_DP = 24;
// Fixed timestamp so that rebuilding unchanged sources gives byte-identical fonts.
const FONT_TIMESTAMP = Number(process.env.SOURCE_DATE_EPOCH || 1735689600);

const manifest = readManifest();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { family, filename, ascent, descent, units_per_em: unitsPerEm } = manifest.font;
const icons = iconsByCode(manifest);
const GEM_FONTS = path.join(ROOT, 'app', 'assets', 'fonts');
const GEM_STYLES = path.join(ROOT, 'app', 'assets', 'stylesheets');
const DIST = path.join(ROOT, 'dist');

const log = (message) => console.log(`\x1b[33m${message}\x1b[0m`);
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

// Normalizes source SVG quirks before font generation:
// - Illustrator exports polygons with trailing whitespace in `points`, which recent
//   path parsers turn into NaN coordinates.
// - circles/ellipses are converted to counter-clockwise arcs, the winding used by the
//   previous toolchain (with the nonzero fill rule the direction decides whether a
//   shape drawn over another one is filled or punched out).
function sanitizeSvg(svg) {
  return svg
    .replace(/\spoints="([^"]*)"/g, (_, points) => ` points="${points.trim().replace(/\s+/g, ' ')}"`)
    .replace(/<(circle|ellipse)\b([^>]*?)\/?>(\s*<\/\1>)?/g, (_, tag, attributes) => {
      const attr = (name) => attributes.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
      const num = (name) => parseFloat(attr(name) || '0');
      const [cx, cy] = [num('cx'), num('cy')];
      const rx = tag === 'circle' ? num('r') : num('rx');
      const ry = tag === 'circle' ? num('r') : num('ry');
      const keep = attributes.replace(/\s(cx|cy|rx|ry|r)="[^"]*"/g, '');
      const d = `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
      return `<path${keep} d="${d}"/>`;
    });
}

async function buildSvgFont() {
  const stream = new SVGIcons2SVGFontStream({
    fontName: family,
    fontHeight: unitsPerEm,
    descent,
    normalize: false,
    log: () => {},
  });
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  for (const [name, icon] of icons) {
    const glyph = Readable.from([sanitizeSvg(fs.readFileSync(path.join(GLYPHS_DIR, `${name}.svg`), 'utf8'))]);
    glyph.metadata = { name, unicode: [String.fromCodePoint(parseInt(icon.code, 16))] };
    stream.write(glyph);
  }
  stream.end();
  await done;
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

// Extracts { name: { width, d } } from the SVG font, with paths flipped back to SVG coordinates (y down).
function extractGlyphs(svgFont) {
  const glyphs = {};
  for (const match of svgFont.matchAll(/<glyph\b([^>]*)\/>/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const d = attrs.d ? svgpath(attrs.d).scale(1, -1).translate(0, ascent).round(1).toString() : '';
    glyphs[attrs['glyph-name']] = { width: Math.round(Number(attrs['horiz-adv-x'])), d };
  }
  return glyphs;
}

function buildFonts(svgFont) {
  const ttf = Buffer.from(
    svg2ttf(svgFont, {
      ts: FONT_TIMESTAMP,
      version: pkg.version.split('.').slice(0, 2).join('.'),
      description: `${family} icon font`,
      url: pkg.homepage,
    }).buffer,
  );
  return { ttf, woff: Buffer.from(ttf2woff(ttf)), woff2: ttf2woff2(ttf) };
}

function writeGemAssets(fonts) {
  log('Write gem fonts (app/assets/fonts)...');
  for (const ext of ['eot', 'svg']) fs.rmSync(path.join(GEM_FONTS, `${filename}.${ext}`), { force: true });
  for (const [ext, buffer] of Object.entries(fonts)) write(path.join(GEM_FONTS, `${filename}.${ext}`), buffer);

  log('Write gem stylesheets (app/assets/stylesheets/agric)...');
  // Plain relative url() on purpose (no sprockets font-url() helper): the stylesheet
  // compiles with any Sass implementation and works with both Sprockets and Propshaft,
  // which rewrite relative url() to digested asset URLs (hence no ?v= cache-busting).
  write(path.join(GEM_STYLES, 'agric', 'paths.scss'), fontFace((ext) => `url('${filename}.${ext}')`));
  writeIconStylesheets(path.join(GEM_STYLES, 'agric'));
}

// Icon gallery in README.md, between <!-- ICONS:START --> and <!-- ICONS:END -->, so the
// set stays browsable on GitHub.
function writeReadmeGallery(columns = 6) {
  log('Update README icons preview...');
  const readmeFile = path.join(ROOT, 'README.md');
  const cells = [...icons]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name]) => `<img src="glyphs/${name}.svg" width="32" height="32" alt="${name}" /><br /><sub>${name}</sub>`);
  const rows = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(`| ${cells.slice(i, i + columns).join(' | ')} |`);
  const section = [
    '## Icons preview',
    '',
    `_${icons.length} icons auto-generated from \`glyphs/\`. Do not edit by hand, run \`npm run build\` instead._`,
    '',
    '<!-- ICONS:START -->',
    `| ${Array(columns).fill(' ').join(' | ')} |`,
    `|${' --- |'.repeat(columns)}`,
    ...rows,
    '<!-- ICONS:END -->',
  ].join('\n');
  const readme = fs.readFileSync(readmeFile, 'utf8');
  const existing = /## Icons preview[\s\S]*?<!-- ICONS:END -->/;
  const updated = existing.test(readme)
    ? readme.replace(existing, () => section)
    : readme.replace('## Installation', () => `${section}\n\n## Installation`);
  fs.writeFileSync(readmeFile, updated);
}

function fontFace(url) {
  return `/* Auto-generated by scripts/build.mjs. Nothing to touch! */
@font-face {
  font-family: '${family}';
  font-weight: normal;
  font-style: normal;
  font-display: block;
  src: ${url('woff2')} format('woff2'),
    ${url('woff')} format('woff'),
    ${url('ttf')} format('truetype');
}
`;
}

function writeIconStylesheets(dir) {
  const sorted = [...icons].sort((a, b) => a[0].localeCompare(b[0]));
  const header = '/* Auto-generated by scripts/build.mjs. Nothing to touch! */\n';
  write(
    path.join(dir, 'list.scss'),
    `${header}$agric-icons: (\n${sorted.map(([name, icon]) => `  ("${name}" "\\${icon.code}")\n`).join('')})\n`,
  );
  write(
    path.join(dir, 'icons.scss'),
    header +
      sorted.map(([name, icon]) => `$agric-icons-${name}: "\\${icon.code}";\n`).join('') +
      '\n' +
      sorted.map(([name]) => `.icon-${name}:before { content: $agric-icons-${name} };\n`).join(''),
  );
}

const svgDocument = (glyph, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${glyph.width} ${ascent + descent}"${extra}><path d="${glyph.d}"/></svg>`;

async function mapLimit(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function writeDist(fonts, glyphs) {
  fs.rmSync(DIST, { recursive: true, force: true });
  const height = ascent + descent;

  log('Optimize glyph paths with SVGO...');
  for (const glyph of Object.values(glyphs)) {
    if (!glyph.d) continue;
    const optimized = optimize(svgDocument(glyph), { multipass: true }).data;
    glyph.d = optimized.match(/\sd="([^"]*)"/)?.[1] ?? glyph.d;
  }

  log('Write dist/fonts...');
  for (const [ext, buffer] of Object.entries(fonts)) write(path.join(DIST, 'fonts', `${filename}.${ext}`), buffer);

  log('Write dist/scss and dist/css...');
  fs.cpSync(GEM_STYLES, path.join(DIST, 'scss'), { recursive: true });
  write(
    path.join(DIST, 'scss', 'agric', 'paths.scss'),
    `$agric-font-path: "../fonts" !default;\n` +
      fontFace((ext) => `url('#{$agric-font-path}/${filename}.${ext}?v=${pkg.version}')`),
  );
  const css = sass.compile(path.join(DIST, 'scss', 'agric.scss'), {
    style: 'expanded',
    silenceDeprecations: ['slash-div', 'import', 'global-builtin'],
  }).css;
  write(path.join(DIST, 'css', 'agric.css'), css);

  log('Write dist/agric.json and dist/react-native/agric.json...');
  const index = Object.fromEntries(
    icons.map(([name, icon]) => [name, { code: icon.code, char: String.fromCodePoint(parseInt(icon.code, 16)) }]),
  );
  write(path.join(DIST, 'agric.json'), JSON.stringify({ family, version: pkg.version, icons: index }, null, 2) + '\n');
  // Glyph map format of react-native-vector-icons (createIconSet).
  write(
    path.join(DIST, 'react-native', 'agric.json'),
    JSON.stringify(Object.fromEntries(icons.map(([name, icon]) => [name, parseInt(icon.code, 16)])), null, 2) + '\n',
  );
  fs.copyFileSync(path.join(DIST, 'fonts', `${filename}.ttf`), path.join(DIST, 'react-native', `${family}.ttf`));

  log('Write dist/svg and dist/sprite...');
  const symbols = [];
  for (const [name] of icons) {
    const glyph = glyphs[name];
    write(path.join(DIST, 'svg', `${name}.svg`), svgDocument(glyph, ' fill="currentColor"') + '\n');
    symbols.push(`<symbol id="agric-${name}" viewBox="0 0 ${glyph.width} ${height}"><path d="${glyph.d}"/></symbol>`);
  }
  write(
    path.join(DIST, 'sprite', 'agric.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>\n`,
  );

  log('Write dist/ios/Agric.xcassets...');
  const xcassets = path.join(DIST, 'ios', `${family}.xcassets`);
  write(path.join(xcassets, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
  for (const [name] of icons) {
    const imageset = path.join(xcassets, `${name}.imageset`);
    write(path.join(imageset, `${name}.svg`), svgDocument(glyphs[name]) + '\n');
    write(
      path.join(imageset, 'Contents.json'),
      JSON.stringify(
        {
          images: [{ filename: `${name}.svg`, idiom: 'universal' }],
          info: { author: 'xcode', version: 1 },
          properties: { 'preserves-vector-representation': true, 'template-rendering-intent': 'template' },
        },
        null,
        2,
      ) + '\n',
    );
  }

  log(`Write dist/android/drawable and dist/png (${PNG_SIZES.join(', ')} px)...`);
  let done = 0;
  await mapLimit(icons, 8, async ([name]) => {
    const glyph = glyphs[name];
    const svg = svgDocument(glyph);
    const resource = `${filename}_${name.replace(/-/g, '_')}`;
    const vector = (await svg2vectordrawable(svg, { floatPrecision: 1 }))
      .replace(/android:width="[^"]*"/, `android:width="${Math.round((VECTOR_SIZE_DP * glyph.width) / height)}dp"`)
      .replace(/android:height="[^"]*"/, `android:height="${VECTOR_SIZE_DP}dp"`);
    write(path.join(DIST, 'android', 'drawable', `${resource}.xml`), vector);

    const master = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
    for (const size of PNG_SIZES) {
      const png = await sharp(master)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      write(path.join(DIST, 'png', String(size), `${name}.png`), png);
    }
    if (++done % 250 === 0) console.log(`  ${done}/${icons.length}`);
  });

  log('Write dist/preview.html...');
  write(path.join(DIST, 'preview.html'), previewPage());
}

function previewPage() {
  const cells = icons
    .map(([name, icon]) => {
      const source = icon.source === 'legacy' ? '' : ` data-source="${icon.source}"`;
      return `<figure${source}><i class="icon-${name}"></i><figcaption>${name}<small>${icon.code}</small></figcaption></figure>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agric ${pkg.version}</title>
<link rel="stylesheet" href="css/agric.css">
<style>
body{font:14px system-ui,sans-serif;margin:16px;background:#fff;color:#222}
input{font:inherit;padding:6px 10px;width:min(400px,100%);margin-bottom:16px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
figure{margin:0;padding:12px 4px;border:1px solid #eee;border-radius:6px;text-align:center}
figure[data-source]{border-color:#7cb342}
i{font-size:32px}
figcaption{font-size:11px;margin-top:6px;word-break:break-all}
small{display:block;color:#999}
</style></head><body>
<h1>Agric ${pkg.version} — ${icons.length} icons</h1>
<input type="search" placeholder="Filter…" oninput="for(const f of document.querySelectorAll('figure'))f.hidden=!f.textContent.includes(this.value)">
<main>
${cells}
</main></body></html>
`;
}

log(`Build ${family} ${pkg.version} (${icons.length} icons)...`);
const svgFont = await buildSvgFont();
write(path.join(ROOT, 'tmp', `${filename}.svg`), svgFont); // reference font, kept for debugging (git-ignored)
const glyphs = extractGlyphs(svgFont);
const empty = icons.filter(([name]) => !glyphs[name]?.d).map(([name]) => name);
if (empty.length) console.warn(`\x1b[31mEmpty glyphs: ${empty.join(', ')}\x1b[0m`);
const fonts = buildFonts(svgFont);
writeGemAssets(fonts);
writeReadmeGallery();
if (ONLY !== 'fonts') await writeDist(fonts, glyphs);
console.log('\x1b[32mFinished!\x1b[0m');
