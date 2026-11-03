# Powderline

Powderline is a static MVP for planning freeform backcountry snowboard lines around major Hokkaido areas.

## Included

- MapLibre GL JS 3D terrain with rotation and tilt
- Asahidake, Rusutsu, Furano, Niseko, Kamui Ski Links, and Kiroro presets
- Freeform line drawing on the map (not snapped to trails)
- Vertex dragging for edits
- GPX import and export
- Browser-local route saving
- Responsive PC / mobile layout

## Run locally

Open `dist/index.html` in a browser, or serve the repository with any static file server. The app is buildless and can be published from the `dist` folder as a GitHub Pages artifact.

## Terrain and licensing notes

The default terrain source is MapLibre's public demo terrain for development. For a real production map of Japan, enter a MapTiler Cloud API key in the Terrain provider panel. Keep required attribution visible and stay inside the provider's terms and quota. The MapTiler free plan is intended for testing, personal, or non-commercial use and currently lists 5,000 sessions/month, 2,000 3D sessions/month, and 100,000 API requests/month. Commercial or higher-volume use needs a paid plan.

The map renderer is MapLibre GL JS (BSD-3-Clause). GPX parsing and route data stay in the browser in this MVP; no server or account is required.
