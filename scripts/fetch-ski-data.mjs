import {mkdir, rename, unlink, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, join} from 'node:path';

const legacyRegions = [
  ['asahidake', 43.663, 142.854, 12000],
  ['rusutsu', 42.740, 140.900, 12000],
  ['furano', 43.325, 142.355, 12000],
  ['niseko', 42.860, 140.690, 16000],
  ['kamui', 43.700, 142.190, 12000],
  ['kiroro', 43.070, 140.990, 12000]
];
const endpoints = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const requestedRegionId = option('--region-id');
const requestedBbox = option('--bbox');
const outputDir = option('--output-dir')
  ? resolve(option('--output-dir'))
  : fileURLToPath(new URL('../dist/data/ski/', import.meta.url));
await mkdir(outputDir, {recursive: true});
const summary = {};

function legacyBbox(lat, lon, distance) {
  const latDelta = distance / 111000;
  const lonDelta = distance / (111000 * Math.cos(lat * Math.PI / 180));
  return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta];
}

function parseBbox(value) {
  const bbox = String(value || '').trim().replace(/^\[|\]$/g, '').split(',').map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error('bbox must be west,south,east,north');
  const [west, south, east, north] = bbox;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error('bbox coordinates are outside the valid world range or order');
  }
  return bbox;
}

function props(element, powderlineType, region) {
  const tags = element.tags || {};
  return {
    powderlineType,
    powderlineRegion: region,
    id: `${element.type}/${element.id}`,
    type: powderlineType,
    liftType: powderlineType === 'lift' ? tags.aerialway || null : null,
    difficulty: powderlineType === 'run' ? tags['piste:difficulty'] || null : null,
    grooming: powderlineType === 'run' ? tags['piste:grooming'] || null : null,
    name: tags.name || tags['name:en'] || tags['name:ja'] || null,
    ref: tags.ref || null
  };
}

function convert(elements, region) {
  const features = [];
  let lifts = 0;
  let runs = 0;
  for (const element of elements) {
    if (!element?.type || element.id == null || !element.geometry?.length || element.geometry.length < 2) continue;
    const coordinates = element.geometry
      .filter(point => Number.isFinite(point?.lon) && Number.isFinite(point?.lat))
      .map(point => [point.lon, point.lat]);
    if (coordinates.length < 2) continue;
    if (element.tags?.aerialway) {
      const properties = props(element, 'lift', region);
      features.push({type: 'Feature', geometry: {type: 'LineString', coordinates}, properties});
      lifts += 1;
    } else if (/(^|;)downhill(;|$)/.test(element.tags?.['piste:type'] || '')) {
      features.push({type: 'Feature', geometry: {type: 'LineString', coordinates}, properties: props(element, 'run', region)});
      runs += 1;
    }
  }
  return {features, lifts, runs};
}

async function fetchElements(region, bbox) {
  const [west, south, east, north] = bbox;
  const bounds = [south, west, north, east].map(value => value.toFixed(6)).join(',');
  const query = `[out:json][timeout:25];(way["aerialway"]["aerialway"!~"^(station|pylon)$"](${bounds});way["piste:type"~"(^|;)downhill(;|$)"](${bounds}););out geom;`;
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {method: 'POST', headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Powderline-Hokkaido/1.0 static data builder'}, body: new URLSearchParams({data: query}), signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.elements) || payload.remark) {
        throw new Error(payload?.remark || 'invalid Overpass response');
      }
      return {elements: payload.elements, sourceEndpoint: endpoint};
    } catch (error) {
      failures.push(`${new URL(endpoint).host}: ${error.message}`);
      console.warn(`${region}: ${new URL(endpoint).host} failed (${error.message})`);
    }
  }
  throw new Error(`Overpass failed (${failures.join('; ')})`);
}

async function replaceGeoJson(region, collection) {
  const destination = join(outputDir, `${region}.geojson`);
  const temporary = join(outputDir, `.${region}.${process.pid}.${Date.now()}.tmp`);
  try {
    const serialized = `${JSON.stringify(collection)}\n`;
    JSON.parse(serialized);
    await writeFile(temporary, serialized, 'utf8');
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

if ((requestedRegionId && !requestedBbox) || (!requestedRegionId && requestedBbox)) {
  throw new Error('--region-id and --bbox must be provided together');
}
if (requestedRegionId && !/^[a-z][a-z0-9_]{0,49}$/.test(requestedRegionId)) {
  throw new Error('regionId must match ^[a-z][a-z0-9_]{0,49}$');
}

const regions = requestedRegionId
  ? [{region: requestedRegionId, bbox: parseBbox(requestedBbox)}]
  : legacyRegions.map(([region, lat, lon, distance]) => ({region, bbox: legacyBbox(lat, lon, distance)}));

for (const {region, bbox} of regions) {
  try {
    const {elements, sourceEndpoint} = await fetchElements(region, bbox);
    const data = convert(elements, region);
    const status = data.features.length ? 'available' : 'empty';
    const collection = {type: 'FeatureCollection', metadata: {region, status, generatedAt: new Date().toISOString(), source: 'OpenStreetMap via Overpass API', sourceEndpoint, license: 'ODbL 1.0', counts: {lifts: data.lifts, runs: data.runs, stations: 0}}, features: data.features};
    await replaceGeoJson(region, collection);
    summary[region] = {...collection.metadata.counts, status};
    console.log(`${region}: ${data.lifts} lifts, ${data.runs} runs (${status})`);
  } catch (error) {
    summary[region] = {status: 'failed', error: error.message};
    process.exitCode = 1;
    console.error(`${region}: failed (${error.message}); existing GeoJSON was kept`);
  }
}

console.log(JSON.stringify(summary));
