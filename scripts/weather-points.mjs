// Representative weather points (summit / mid / base) per Powderline region.
// Run: node scripts/weather-points.mjs [regionId ...]   (no args = all built-in regions; prints a summary only)
//
// Source: dist/data/ski/<region>.geojson (OpenSkiData / OpenSkiMap, ODbL). Its LineString coordinates are
// [lng, lat, elevation_m] (elevation from the OpenSkiData DEM step, attributed "© Mapterhorn").
//   summit = highest endpoint of an operating lift of the region's primary ski area (lift top station)
//   base   = lowest endpoint of an operating lift of the primary ski area (lift bottom station)
//   mid    = vertex of an operating downhill run of the primary ski area whose elevation is closest to
//            (summit + base) / 2
// Every point is cross-checked against the Open-Meteo Elevation API (Copernicus DEM GLO-90). A point that
// cannot be derived, has no elevation, or disagrees with the DEM is returned with status 'needs_review' and
// must not be stored as a confirmed value.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {weatherRegionById, weatherRegionIds} from './weather-regions.mjs';

// The region GeoJSON also holds neighbouring ski areas (e.g. kiroro.geojson includes Sapporo Kokusai), and the
// extract aliases are broad (/moiwa/i also matches Sapporo Moiwayama), so the primary ski area is named here.
export const primarySkiAreas = {
  asahidake: /Asahidake/i,
  rusutsu: /Rusutsu Resort/i,
  furano: /Furano ski resort/i,
  niseko: /Niseko United/i,
  kamui: /Kamui Ski Links/i,
  kiroro: /Kiroro Resort/i,
  dontan: /Sahoro|サホロ/i,
  abcdef: /Welli|웰리|Alpensia|알펜시아/i,
  yongpyong: /Yongpyong|용평/i,
  phoenix: /Pheonix|Phoenix|휘닉스/i,
  region_cdqt3r41: /Jisan|지산/i,
  region_huyvh4ar: /HiOne|High1|하이원/i,
  region_wxkfnu11: /Konjiam|곤지암/i,
  region_tsbh66ti: /Kurodake|黒岳/i,
  region_q49t34uk: /Asarigawa|朝里川/i
};
if (Object.keys(primarySkiAreas).join('|') !== weatherRegionIds.join('|')) {
  throw new Error('weather point region IDs differ from the registered weather-region snapshot');
}
const MID_MAX_ELEVATION_GAP_M = 30; // mid vertex must be this close to the target elevation
const DEM_MAX_DIFF_M = 50; // allowed |source elevation - Copernicus DEM| (90 m grid on steep terrain)

const round = (value, digits) => Number(value.toFixed(digits));
const validCoord = c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);
const hasElevation = c => validCoord(c) && Number.isFinite(c[2]);

function belongsTo(feature, pattern) {
  return (feature.properties?.skiAreas || []).some(area => pattern.test(area?.properties?.name || ''));
}
function skiAreaName(feature, pattern) {
  return (feature.properties?.skiAreas || []).map(area => area?.properties?.name || '').find(name => pattern.test(name)) || null;
}

export async function fetchDemElevations(coords) {
  if (!coords.length) return [];
  const url = new URL('https://api.open-meteo.com/v1/elevation');
  url.search = new URLSearchParams({
    latitude: coords.map(c => c[1]).join(','), longitude: coords.map(c => c[0]).join(',')
  }).toString();
  const response = await fetch(url, {signal: AbortSignal.timeout(20000)});
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.elevation)) throw new Error(`Elevation API HTTP ${response.status}: ${body?.reason || 'invalid body'}`);
  return body.elevation;
}

function point(regionId, type, coord, derivation) {
  return {
    region_id: regionId, point_id: `${regionId}:${type}`, point_type: type,
    latitude: round(coord[1], 6), longitude: round(coord[0], 6),
    elevation: hasElevation(coord) ? round(coord[2], 1) : null,
    elevation_source: 'openskidata_geojson',
    dem_elevation: null, dem_source: 'open-meteo elevation (Copernicus GLO-90)', dem_diff: null,
    derivation, status: 'needs_review', issues: []
  };
}

export async function deriveRegionPoints(regionId, {geojsonDir = 'dist/data/ski', checkDem = true, useConfigured = true} = {}) {
  const configured = weatherRegionById[regionId];
  if (useConfigured && configured) {
    const points = configured.points.map(value => ({
      ...structuredClone(value), region_id: regionId,
      point_id: `${regionId}:${value.point_type}`
    }));
    return {
      region_id: regionId,
      primary_ski_area: configured.label,
      terrain_source: configured.terrain_source,
      terrain_note: configured.terrain_note || null,
      points,
      issues: points.flatMap(value => value.issues.map(issue => `${value.point_type}: ${issue}`)),
      counts: {configured_points: points.length}
    };
  }
  const pattern = primarySkiAreas[regionId];
  const result = {region_id: regionId, primary_ski_area: null, points: [], issues: []};
  if (!pattern) { result.issues.push('primary ski area is not defined for this region'); return result; }
  let geojson;
  try {
    geojson = JSON.parse(await readFile(`${geojsonDir}/${regionId}.geojson`, 'utf8'));
  } catch (error) {
    result.issues.push(`region GeoJSON unavailable: ${error.message}`);
    return result;
  }
  const features = (geojson.features || []).filter(f => f?.geometry?.type === 'LineString' && belongsTo(f, pattern));
  const lifts = features.filter(f => f.properties?.type === 'lift' && f.properties?.status === 'operating');
  const runs = features.filter(f => f.properties?.type === 'run' && f.properties?.status === 'operating'
    && (f.properties?.uses || []).includes('downhill'));
  result.primary_ski_area = skiAreaName(lifts[0] || runs[0] || {}, pattern);
  result.counts = {lifts: lifts.length, runs: runs.length};

  const endpoints = lifts.flatMap(lift => {
    const c = lift.geometry.coordinates;
    return [c[0], c.at(-1)].filter(hasElevation).map(coord => ({coord, lift}));
  });
  if (!endpoints.length) {
    result.issues.push('no operating lift endpoint with elevation');
    return result;
  }
  const top = endpoints.reduce((a, b) => (b.coord[2] > a.coord[2] ? b : a));
  const bottom = endpoints.reduce((a, b) => (b.coord[2] < a.coord[2] ? b : a));
  const summit = point(regionId, 'summit', top.coord,
    {method: 'highest operating lift endpoint', feature_id: top.lift.properties.id, name: top.lift.properties.name, lift_type: top.lift.properties.liftType});
  const base = point(regionId, 'base', bottom.coord,
    {method: 'lowest operating lift endpoint', feature_id: bottom.lift.properties.id, name: bottom.lift.properties.name, lift_type: bottom.lift.properties.liftType});
  result.points.push(summit, base);

  const target = (top.coord[2] + bottom.coord[2]) / 2;
  let best = null;
  for (const run of runs) {
    for (const coord of run.geometry.coordinates) {
      if (!hasElevation(coord)) continue;
      const gap = Math.abs(coord[2] - target);
      if (!best || gap < best.gap) best = {coord, run, gap};
    }
  }
  if (best) {
    const mid = point(regionId, 'mid', best.coord, {
      method: 'operating downhill run vertex closest to (summit + base) / 2',
      target_elevation: round(target, 1), elevation_gap: round(best.gap, 1),
      feature_id: best.run.properties.id, name: best.run.properties.name, difficulty: best.run.properties.difficulty
    });
    if (best.gap > MID_MAX_ELEVATION_GAP_M) mid.issues.push(`mid vertex is ${round(best.gap, 1)} m from the target elevation`);
    result.points.splice(1, 0, mid);
  } else {
    result.issues.push('no operating downhill run vertex with elevation (mid point not derived)');
  }

  if (checkDem) {
    try {
      const dem = await fetchDemElevations(result.points.map(p => [p.longitude, p.latitude]));
      result.points.forEach((p, i) => {
        if (!Number.isFinite(dem[i])) { p.issues.push('DEM elevation unavailable'); return; }
        p.dem_elevation = round(dem[i], 1);
        if (p.elevation != null) {
          p.dem_diff = round(p.elevation - dem[i], 1);
          if (Math.abs(p.dem_diff) > DEM_MAX_DIFF_M) p.issues.push(`source elevation differs from DEM by ${p.dem_diff} m`);
        }
      });
    } catch (error) {
      result.points.forEach(p => p.issues.push(`DEM check failed: ${error.message}`));
    }
  } else {
    result.points.forEach(p => p.issues.push('DEM check skipped'));
  }
  for (const p of result.points) {
    if (p.elevation == null) p.issues.push('no source elevation');
    p.status = p.issues.length ? 'needs_review' : 'confirmed';
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(primarySkiAreas);
  for (const id of ids) {
    const r = await deriveRegionPoints(id);
    console.log(JSON.stringify({region: id, ski_area: r.primary_ski_area, counts: r.counts, issues: r.issues}));
    for (const p of r.points) {
      console.log(JSON.stringify({point: p.point_type, lat: p.latitude, lng: p.longitude, ele: p.elevation,
        dem: p.dem_elevation, diff: p.dem_diff, status: p.status, from: p.derivation.name, issues: p.issues}));
    }
  }
}
