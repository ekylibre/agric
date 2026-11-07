# Changelog

## 5.0.0

### Breaking changes

- **220 icons moved to the Unicode private use area.** Their code points were in
  `F900`–`FA51`, which belongs to CJK Compatibility Ideographs: they could render as
  Chinese characters with another font and were read aloud by screen readers. They
  now use `E000`–`E0DB`. The `.icon-*` classes and `$agric-icons-*` variables are
  unchanged; only code that hard-codes the characters (`"\fa51"`) is affected. The
  old code of each moved icon is kept in `manifest.json` (`legacy_code`).
- `header extension` is renamed `header-extension` (the space produced invalid SCSS).
- EOT and SVG fonts are no longer shipped (no browser in use still needs them).
  The `@font-face` now loads WOFF2, then WOFF, then TTF.

### Fixes

- `agric.woff2` and `agric.eot` were actually PostScript Type 1 files (FontForge
  fallback), so browsers could not use them. The WOFF2 is now a real WOFF2 (202 KB,
  instead of 474 KB for the WOFF that was actually used).

### New

- New build with Node.js only (`npm run build`), no more FontForge. The 1 912
  existing glyphs render identically to 4.1.0 (checked pixel by pixel).
- New formats: SVG per icon, SVG sprite, PNG (24 → 96 px), Android VectorDrawable,
  iOS asset catalog, JSON glyph maps (including react-native-vector-icons), preview
  page. Published as the npm package `@ekylibre/agric`.
- `manifest.json`: single source of truth (name, code point, source, license, URL),
  checked by `npm run validate` (unique code points, private use area, valid names,
  allowed licenses).
- `npm run import`: imports icons from open icon sets (Lucide, Healthicons, Open
  Crop Icons), including stroke-based and multi-colour ones.
- GitHub Actions CI replaces Travis CI.
