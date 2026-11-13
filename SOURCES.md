# GitHub source review

These are the most relevant open-source projects found for the Powderline MVP:

| Source | License | Use in this project |
| --- | --- | --- |
| [maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause | Core WebGL map, rotation, pitch, raster DEM terrain |
| [gpxstudio/gpx.studio](https://github.com/gpxstudio/gpx.studio) | MIT | Reference for GPX parsing, editing patterns, import/export UX |
| [maplibre/maplibre-gl-directions](https://github.com/maplibre/maplibre-gl-directions) | MIT | Optional future routed-mode UI; not used for the free-draw MVP because it snaps to a routing provider |
| [GSI Japan tiles](https://maps.gsi.go.jp/development/ichiran.html) | GSI content terms | Live satellite imagery and standard topo/contour basemaps; no API key required, attribution required |
| [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | Source-dependent open data terms | Real global Terrarium DEM used by MapLibre 3D terrain; no API key required |
| [mapforge-org/mapforge](https://github.com/mapforge-org/mapforge) | AGPL-3.0 | Reference for a larger MapLibre + GPX/KML/GeoJSON editing product; do not copy into a permissive app without handling AGPL obligations |
| [clement-igonet/maplibre-gl-3dtiles-terrain](https://github.com/clement-igonet/maplibre-gl-3dtiles-terrain) | BSD-3-Clause | Future option to feed Cesium-style quantized-mesh terrain into MapLibre |
| [ChrisAichinger/MapsEvolved](https://github.com/ChrisAichinger/MapsEvolved) | See repository | Reference for ski-touring terrain analysis, elevation, slope aspect, and GPX drawing |
| [rotadsr/web-gpx-library](https://github.com/rotadsr/web-gpx-library) | See repository | Reference for 3D terrain, slope overlays, elevation profiles, and local-first GPX library UX |

## Decision

The MVP uses MapLibre GL JS directly, GSI raster basemaps, and AWS Terrarium DEM tiles. It keeps freehand points in GeoJSON and intentionally does not use a route engine, so the user's line is not snapped to trails. The area selector covers Asahidake, Rusutsu, Furano, Niseko, Kamui Ski Links, and Kiroro, and can be extended by adding a center/zoom preset. The GPX editor and ski-touring projects are useful references, but copying their larger application code would add unnecessary licensing and dependency complexity at this stage.
