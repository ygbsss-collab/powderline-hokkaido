import {createReadStream} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {createGunzip} from 'node:zlib';
import streamJson from 'stream-json';
import pickModule from 'stream-json/filters/Pick.js';
import streamArrayModule from 'stream-json/streamers/StreamArray.js';

const {parser} = streamJson;
const {pick} = pickModule;
const {streamArray} = streamArrayModule;
const regions = {
  asahidake: {center: [142.854, 43.663], radiusKm: 15, aliases: [/asahidake/i, /旭岳/]},
  rusutsu: {center: [140.900, 42.740], radiusKm: 15, aliases: [/rusutsu/i, /ルスツ/]},
  furano: {center: [142.355, 43.325], radiusKm: 15, aliases: [/furano/i, /富良野/]},
  niseko: {center: [140.690, 42.860], radiusKm: 22, aliases: [/niseko/i, /ニセコ/, /hirafu/i, /hanazono/i, /annupuri/i, /moiwa/i]},
  kamui: {center: [142.190, 43.700], radiusKm: 15, aliases: [/kamui ski links/i, /カムイスキーリンクス/]},
  kiroro: {center: [140.990, 43.070], radiusKm: 15, aliases: [/kiroro/i, /キロロ/]}
};
const inputs = {
  skiAreas: 'work/openskidata-ski_areas.geojson.gz',
  lifts: 'work/openskidata-lifts.geojson.gz',
  runs: 'work/openskidata-runs.geojson.gz',
  spots: 'work/openskidata-spots.geojson.gz'
};
const sourceUrls = {
  skiAreas: 'https://tiles.openskimap.org/geojson/ski_areas.geojson',
  lifts: 'https://tiles.openskimap.org/geojson/lifts.geojson',
  runs: 'https://tiles.openskimap.org/geojson/runs.geojson',
  spots: 'https://tiles.openskimap.org/geojson/spots.geojson'
};
const output = Object.fromEntries(Object.keys(regions).map(id => [id, []]));
const skiAreaRegion = new Map();

async function* features(path) {
  const pipeline = createReadStream(path).pipe(createGunzip()).pipe(parser()).pipe(pick({filter: 'features'})).pipe(streamArray());
  for await (const {value} of pipeline) yield value;
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

function linkedRegion(feature) {
  for (const area of feature.properties?.skiAreas || []) {
    const region = skiAreaRegion.get(area.properties?.id);
    if (region) return region;
  }
  return null;
}

function coordinateRegion(feature) {
  const point = geometryCenter(feature.geometry);
  if (!point) return null;
  let closest = null;
  let closestDistance = Infinity;
  for (const [id, region] of Object.entries(regions)) {
    const distance = distanceKm(point, region.center);
    if (distance <= region.radiusKm && distance < closestDistance) {
      closest = id;
      closestDistance = distance;
    }
  }
  return closest;
}

function namedRegion(feature) {
  const name = areaName(feature);
  return Object.entries(regions).find(([, region]) => region.aliases.some(pattern => pattern.test(name)))?.[0] || null;
}

function add(region, feature, type) {
  output[region].push({...feature, properties: {...feature.properties, powderlineType: type, powderlineRegion: region}});
}

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
await mkdir('dist/data/ski', {recursive: true});
const summary = {};
for (const [region, regionFeatures] of Object.entries(output)) {
  const counts = regionFeatures.reduce((result, feature) => {
    const key = `${feature.properties.powderlineType}s`;
    result[key] += 1;
    return result;
  }, {lifts: 0, runs: 0, stations: 0});
  const collection = {
    type: 'FeatureCollection',
    metadata: {region, extractedAt, source: 'OpenSkiData / OpenSkiMap.org', sourceUrls, license: 'ODbL 1.0', attribution: 'Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who\'s On First, © Mapterhorn', counts, status: regionFeatures.length ? 'available' : 'unavailable'},
    features: regionFeatures
  };
  await writeFile(`dist/data/ski/${region}.geojson`, `${JSON.stringify(collection)}\n`);
  summary[region] = {...counts, status: collection.metadata.status};
}
console.log(JSON.stringify(summary, null, 2));
