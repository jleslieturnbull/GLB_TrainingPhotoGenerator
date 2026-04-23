# GLB Screenshot Exporter + GSplat POC v1.6.8

This build keeps the simple filenames `index.html` and `app.js`.

## Highlights
- GSplat section is now labeled **GSplat Scene (WIP)**.
- A hidden bootstrap directional light is spawned on load at **0 watts** with shadows enabled, and it is kept out of the normal viewport light-selection flow.
- Camera controls now include a **+ focus picker** beside focal distance so you can click the model and set an exact focus distance.
- DOF now uses the stored focus point when available, so focal distance changes are more visible and predictable in preview/export.
- Light scale is only shown for **spot**, **rect area**, and **helix** lights.
- Directional / spot / point shadow defaults were tightened to reduce acne / striping artifacts.
- Smart stage controls were removed from the lighting panel.
- A new **Colour Correction** section was added with **Levels** and **Curves** tabs.
- Colour correction is applied to preview/export, and the main viewport gets a live approximation so the shot stays visually closer to output.
- Advanced colour mode now applies both **input** and **output** colour-space transforms more clearly.
- PNG exports still embed per-image metadata plus optional additional information.

## Run
Serve with a local HTTP server, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.
