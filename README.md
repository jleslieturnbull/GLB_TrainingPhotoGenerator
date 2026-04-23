# GLB Screenshot Exporter

Browser tool for loading a GLB, lighting it, previewing shots, and exporting labelled PNGs + metadata.

## Install

1. Keep `index.html`, `app.js`, and the local `three/` folder together.
2. Serve the folder with a local web server: 

```bash
python -m http.server 8080
```

3. Open `http://localhost:8080`.

## Recent update

- Gaussian Splat support via Spark JS framework
- Improved lighting and shadow workflow
- Up to 4K export
- Colour management and colour correction
- Depth of field controls
- Optional image labelling
- PNG/JSON metadata export

## Basic use

1. Load a `.glb` or `.gltf`.
2. Add an HDRI folder if needed.
3. Set camera, lighting, colour, and export options.
4. Use **Live Preview** to check the final frame.
5. Use **Capture button** for a single PNG, or **Export ZIP** for a full 360 shot set + points of interest.

## Notes

- ZIP export includes shot images and `metadata.json`.
- Fixed shot names include `front`, `back`, `left`, `right`, `top`, and `bottom`.
- 2048 is the default export size; 4096 is available.