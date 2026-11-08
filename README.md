# Powderline

Powderline is a static MVP for planning freeform backcountry snowboard lines around major Hokkaido areas.

## Included

- MapLibre GL JS 3D terrain with rotation and tilt
- Asahidake, Rusutsu, Furano, Niseko, Kamui Ski Links, and Kiroro presets
- Freeform line drawing on the map (not snapped to trails)
- Vertex dragging for edits
- GPX import and export
- Browser-local route saving, plus per-user Supabase sync after sign-in
- Responsive PC / mobile layout

## Run locally

Open `dist/index.html` in a browser, or serve the repository with any static file server. The app is buildless and can be published from the `dist` folder as a GitHub Pages artifact.

## Terrain and licensing notes

The app uses real Terrarium elevation tiles from the [AWS Open Data Terrain Tiles dataset](https://registry.opendata.aws/terrain-tiles/) and explicitly configures MapLibre's `terrarium` decoder. Satellite imagery (`seamlessphoto`) and the contour-bearing standard map (`std`) come from the [Geospatial Information Authority of Japan](https://maps.gsi.go.jp/development/ichiran.html). These endpoints do not require an API key.

GSI permits live use of its tiles without an application when the source is displayed; the app keeps the required attribution visible. Individual imagery included in `seamlessphoto` can have additional source notes, so review the GSI tile list before commercial redistribution or bulk/offline use. AWS Terrain Tiles aggregate multiple open elevation datasets with their own attribution requirements; the app links the dataset attribution from the map.

GPX parsing stays in the browser. Routes stay local until a user configures Supabase and signs in, after which saves and loads use that user's rows in `powderline_routes`.

## Supabase setup

The app is connected to `https://lxfsvhwibiaspnaduhri.supabase.co`. Its publishable key is shared by the web and Capacitor builds; secret and service-role keys are intentionally rejected. The browser auth session is kept in local storage.

The `mapbox-public-token` Edge Function reads `MAPBOX_PUBLIC_TOKEN`, accepts only the project's publishable API key, and returns only a `pk.` Mapbox public token. The app requests it at startup and keeps the most recently received public token in local storage as an offline/failure fallback.

Apply `supabase/migrations/20261104000000_create_powderline_routes.sql` to create the table, grants, and owner-only Row Level Security policies. Email/password users can then sign in from the sidebar and save or load only their own routes. Logged-out use retains the existing browser-local route behavior.

## Mapbox terrain comparison

Open `dist/mapbox-compare.html` through a static web server, or use **Compare Mapbox** in the main map. The split view synchronizes the current MapLibre terrain and Mapbox Standard Satellite + Terrain-DEM at the same Furano camera. It uses the same automatically loaded Mapbox public token as the main app. Mapbox usage is subject to account quotas and terms, and its required logo and attribution are rendered by Mapbox GL JS.
