# Isometric illustrations

Colour illustrations from the Ekylibre SAS graphic archive (2019–2021), converted from
Adobe Illustrator to plain SVG. They are **not** part of the icon font: the build
(`npm run build`), the gem and the npm package ignore this folder.

| Folder | Content |
|---|---|
| `kit/<category>/<id>.svg` | 18 elements cut out of the isometric farm scene (buildings, machinery, animals, a farmer, objects, weather). Categories: `batiments`, `machines`, `animaux`, `personnages`, `objets`, `cultures`, `capteurs`. |
| `sources/` | 63 whole drawings: Ekylibre logos and brand pictograms, product logos (Ekyagri, Ekyviti, Clic&Farm), Ekyviti vineyard icons, IFT, and farm and office illustrations. |
| `index.json` | One entry per file: source file in the archive, size (raw and gzip); for the kit, title (FR/EN), category, cut-out frame and ground point (`foot`). |

## How they were made

1. Each `.ai` file was opened through its PDF stream and exported as plain SVG with
   Inkscape 1.4 (`--export-plain-svg`).
2. Kit elements were cut out by rectangle: every object whose bounding box lies inside
   the frame is kept, with the definitions it references; then `--vacuum-defs` and
   svgo (precision 1).
3. Whole drawings were cropped to their content (`--export-area-drawing`) and
   optimised with svgo.

The scripts live in the website repository
([ekylibre/ekylibre-sas](https://github.com/ekylibre/ekylibre-sas)):
`scripts/kit/convert.mjs`, `scripts/kit/extract.py` and
`docs/kit-isometrique/elements.yaml`. The kit is used by the “Four free software
projects, one system” diagram on ekylibre.com.

Not included: business cards, letterheads, invitations and other documents with
personal details, third-party brands and event material, and stock or downloaded
vector packs found in the archive.

## Notes

- Some drawings are large: `kit/batiments/chai.svg` is about 6 MB
  (≈ 640 KB gzipped). For the web, prefer a raster export of those.
- White logo variants (`*_white_*`) are invisible on a white background.

## License

MIT, like the rest of this repository. These illustrations are the property of
Ekylibre SAS, which publishes them under this license.
