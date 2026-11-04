import {mkdir, writeFile} from 'node:fs/promises';

const regions = [
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
const outputDir = new URL('../dist/data/ski/', import.meta.url);
await mkdir(outputDir, {recursive: true});
const summary = {};

function bbox(lat, lon, distance) {
  const latDelta = distance / 111000;
  const lonDelta = distance / (111000 * Math.cos(lat * Math.PI / 180));
  return [lat - latDelta, lon - lonDelta, lat + latDelta, lon + lonDelta].map(value => value.toFixed(6)).join(',');
}

function props(element, featureType, region) {
  const tags = element.tags || {};
  return {featureType, region, osmType: element.type, osmId: element.id, name: tags.name || tags['name:en'] || tags['name:ja'] || null, liftType: tags.aerialway || null, difficulty: tags['piste:difficulty'] || null, grooming: tags['piste:grooming'] || null, ref: tags.ref || null};
}

function convert(elements, region) {
  const features = [];
  let lifts = 0;
  let runs = 0;
  for (const element of elements) {
    if (!element.geometry?.length || element.geometry.length < 2) continue;
    const coordinates = element.geometry.map(point => [point.lon, point.lat]);
    if (element.tags?.aerialway) {
      const properties = props(element, 'lift', region);
      features.push({type: 'Feature', geometry: {type: 'LineString', coordinates}, properties});
      features.push({type: 'Feature', geometry: {type: 'Point', coordinates: coordinates[0]}, properties: {...properties, featureType: 'terminal', terminalRole: 'lower'}});
      features.push({type: 'Feature', geometry: {type: 'Point', coordinates: coordinates.at(-1)}, properties: {...properties, featureType: 'terminal', terminalRole: 'upper'}});
      lifts += 1;
    } else if (/(^|;)downhill(;|$)/.test(element.tags?.['piste:type'] || '')) {
      features.push({type: 'Feature', geometry: {type: 'LineString', coordinates}, properties: props(element, 'run', region)});
      runs += 1;
    }
  }
  return {features, lifts, runs};
}

for (const [region, lat, lon, distance] of regions) {
  const bounds = bbox(lat, lon, distance);
  const query = `[out:json][timeout:25];(way["aerialway"]["aerialway"!~"station|pylon"](${bounds});way["piste:type"~"(^|;)downhill(;|$)"](${bounds}););out geom;`;
  let elements = null;
  let sourceEndpoint = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {method: 'POST', headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Powderline-Hokkaido/1.0 static data builder'}, body: new URLSearchParams({data: query}), signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      elements = (await response.json()).elements || [];
      sourceEndpoint = endpoint;
      break;
    } catch (error) {
      console.warn(`${region}: ${new URL(endpoint).host} failed (${error.message})`);
    }
  }
  const data = convert(elements || [], region);
  const status = elements && (data.lifts || data.runs) ? 'available' : 'unavailable';
  const collection = {type: 'FeatureCollection', metadata: {region, status, generatedAt: new Date().toISOString(), source: 'OpenStreetMap via Overpass API', sourceEndpoint, license: 'ODbL 1.0', counts: {lifts: data.lifts, runs: data.runs}}, features: data.features};
  await writeFile(new URL(`${region}.geojson`, outputDir), `${JSON.stringify(collection)}\n`);
  summary[region] = {...collection.metadata.counts, status};
  console.log(`${region}: ${data.lifts} lifts, ${data.runs} runs (${status})`);
}

console.log(JSON.stringify(summary));
