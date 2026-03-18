# GLB Screenshot Exporter (vNext2)

This is the correct GLB screenshot/export tool (not the UV app).

## Requirements
- Serve with a local HTTP server (import maps do not work on file://).
- Provide a local `./three/` folder next to index.html:
  - ./three/build/three.module.js
  - ./three/examples/jsm/...

## Run
python -m http.server 8080
then open http://localhost:8080

## HDRIs (session-based)
- Use "Load HDRI Folder" or "Load HDRI ZIP".
- Accepts .hdr and .exr files.
- Uses RGBELoader (HDR) and EXRLoader (EXR), then PMREMGenerator.

Notes:
- showDirectoryPicker is available only in secure contexts and is not supported everywhere (Chromium is best).
- EXR files can be large; loading them in-browser may be slow.

## POIs
- Select an object via 📷 to enter POI mode.
- Adjust camera/zoom.
- Done saves POI and adds an additional exported image for each POI.

## Export
- Exports 12 / 15 / 18 base shots + 1 image per POI.
- Can cycle HDRIs during export and apply helix light.

