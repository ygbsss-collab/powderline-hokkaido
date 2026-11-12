import {createReadStream} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream';
import {pathToFileURL} from 'node:url';

// stream-json is loaded lazily so scripts that only import the constants/helpers below
// (e.g. the queue check in CI) work without `npm ci`.
async function loadStreamTools() {
  const [json, filter, streamer] = await Promise.all([
    import('stream-json'), import('stream-json/filters/Pick.js'), import('stream-json/streamers/StreamArray.js')
  ]);
  return {parser: json.default.parser, pick: filter.default.pick, streamArray: streamer.default.streamArray};
}

// Built-in regions: matched by ski-area name alias first, then by distance from center.
export const builtinRegions = {
  asahidake: {center: [142.854, 43.663], radiusKm: 15, aliases: [/asahidake/i, /旭岳/]},
  rusutsu: {center: [140.900, 42.740], radiusKm: 15, aliases: [/rusutsu/i, /ルスツ/]},
  furano: {center: [142.355, 43.325], radiusKm: 15, aliases: [/furano/i, /富良野/]},
  niseko: {center: [140.690, 42.860], radiusKm: 22, aliases: [/niseko/i, /ニセコ/, /hirafu/i, /hanazono/i, /annupuri/i, /moiwa/i]},
  kamui: {center: [142.190, 43.700], radiusKm: 15, aliases: [/kamui ski links/i, /カムイスキーリンクス/]},
  kiroro: {center: [140.990, 43.070], radiusKm: 15, aliases: [/kiroro/i, /キロロ/]}
};
export const defaultInputs = {
  skiAreas: 'work/openskidata-ski_areas.geojson.gz',
  lifts: 'work/openskidata-lifts.geojson.gz',
  runs: 'work/openskidata-runs.geojson.gz',
  spots: 'work/openskidata-spots.geojson.gz'
};
export const sourceUrls = {
  skiAreas: 'https://tiles.openskimap.org/geojson/ski_areas.geojson',
  lifts: 'https://tiles.openskimap.org/geojson/lifts.geojson',
  runs: 'https://tiles.openskimap.org/geojson/runs.geojson',
  spots: 'https://tiles.openskimap.org/geojson/spots.geojson'
};

async function* features(path) {
  // stream.pipeline (unlike .pipe) forwards read/gunzip/parse errors to the consumer so callers can handle them.
  const {parser, pick, streamArray} = await loadStreamTools();
  const items = streamArray();
  pipeline(createReadStream(path), createGunzip(), parser(), pick({filter: 'features'}), items, () => {});
  for await (const {value} of items) yield value;
}

function geometryCenter(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = value => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
    } else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return Number.isFinite(bounds[0]) ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null;
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function areaName(feature) {
  return String(feature?.properties?.name || '');
}

// Region definitions are either {center, radiusKm, aliases?} (built-in style) or
// {bbox: [west, south, east, north]} (dynamic regions registered in the database).
// A feature belongs to a bbox region when the centre of its geometry lies inside the bbox.
export function validateBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const numbers = bbox.map(Number);
  const [west, south, east, north] = numbers;
  if (!numbers.every(Number.isFinite) || west >= east || south >= north ||
      west < -180 || east > 180 || south < -90 || north > 90) return null;
  return numbers;
}

export async function extractRegions(regionDefs, {inputs = defaultInputs} = {}) {
  const ids = Object.keys(regionDefs);
  const output = Object.fromEntries(ids.map(id => [id, []]));
  const skiAreaRegion = new Map();

  const linkedRegion = feature => {
    for (const area of feature.properties?.skiAreas || []) {
      const region = skiAreaRegion.get(area.properties?.id);
      if (region) return region;
    }
    return null;
  };

  const coordinateRegion = feature => {
    const point = geometryCenter(feature.geometry);
    if (!point) return null;
    let closest = null;
    let closestDistance = Infinity;
    for (const [id, region] of Object.entries(regionDefs)) {
      let center = region.center;
      if (region.bbox) {
        const [west, south, east, north] = region.bbox;
        if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) continue;
        center = [(west + east) / 2, (south + north) / 2];
      } else if (distanceKm(point, center) > region.radiusKm) continue;
      const distance = distanceKm(point, center);
      if (distance < closestDistance) {
        closest = id;
        closestDistance = distance;
      }
    }
    return closest;
  };

  const namedRegion = feature => {
    const name = areaName(feature);
    return Object.entries(regionDefs).find(([, region]) => region.aliases?.some(pattern => pattern.test(name)))?.[0] || null;
  };

  const add = (region, feature, type) => {
    output[region].push({...feature, properties: {...feature.properties, powderlineType: type, powderlineRegion: region}});
  };

  for await (const feature of features(inputs.skiAreas)) {
    const region = namedRegion(feature) || coordinateRegion(feature);
    if (region && feature.properties?.id) skiAreaRegion.set(feature.properties.id, region);
  }

  for await (const feature of features(inputs.lifts)) {
    const region = linkedRegion(feature) || coordinateRegion(feature);
    if (region) add(region, feature, 'lift');
  }

  for await (const feature of features(inputs.runs)) {
    if (!feature.properties?.uses?.includes('downhill')) continue;
    const region = linkedRegion(feature) || coordinateRegion(feature);
    if (region) add(region, feature, 'run');
  }

  for await (const feature of features(inputs.spots)) {
    if (feature.properties?.spotType !== 'lift_station') continue;
    const region = linkedRegion(feature) || coordinateRegion(feature);
    if (region) add(region, feature, 'station');
  }

  const extractedAt = new Date().toISOString();
  const collections = {};
  for (const [region, regionFeatures] of Object.entries(output)) {
    const counts = regionFeatures.reduce((result, feature) => {
      const key = `${feature.properties.powderlineType}s`;
      result[key] += 1;
      return result;
    }, {lifts: 0, runs: 0, stations: 0});
    collections[region] = {
      type: 'FeatureCollection',
      metadata: {region, extractedAt, source: 'OpenSkiData / OpenSkiMap.org', sourceUrls, license: 'ODbL 1.0', attribution: 'Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who\'s On First, © Mapterhorn', counts, status: regionFeatures.length ? 'available' : 'unavailable'},
      features: regionFeatures
    };
  }
  return collections;
}

// CLI. Without --region the six built-in regions are extracted exactly as before.
// With --region <id> --bbox <west,south,east,north> only that dynamic region is extracted.
// --out <dir> changes the output directory (default dist/data/ski).
async function main() {
  const args = process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const outDir = option('--out') || 'dist/data/ski';
  const regionId = option('--region');
  let regionDefs = builtinRegions;
  if (regionId !== undefined || option('--bbox') !== undefined) {
    const bbox = validateBbox((option('--bbox') || '').split(','));
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(regionId || '') || !bbox) {
      throw new Error('Usage: --region <id> --bbox <west,south,east,north>');
    }
    if (builtinRegions[regionId]) throw new Error(`${regionId} is a built-in region; run without --region.`);
    regionDefs = {[regionId]: {bbox}};
  }

  const collections = await extractRegions(regionDefs);
  await mkdir(outDir, {recursive: true});
  const summary = {};
  for (const [region, collection] of Object.entries(collections)) {
    await writeFile(`${outDir}/${region}.geojson`, `${JSON.stringify(collection)}\n`);
    summary[region] = {...collection.metadata.counts, status: collection.metadata.status};
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
