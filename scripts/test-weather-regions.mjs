// Offline regression checks for the Supabase-derived weather-region snapshot and altitude points.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {weatherRegions, weatherRegionById, weatherRegionCounts, excludedWeatherRegions} from './weather-regions.mjs';
import {deriveRegionPoints, primarySkiAreas} from './weather-points.mjs';
import {loadConfig, countryOf} from './weather-multimodel-engine.mjs';
import {registeredScenario} from './weather-api-usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const expectedKorea = ['abcdef', 'yongpyong', 'phoenix', 'region_cdqt3r41', 'region_huyvh4ar', 'region_wxkfnu11'];
const existingJapan = ['asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro'];

check('catalog.count_15', weatherRegions.length === 15, {count: weatherRegions.length});
check('catalog.country_counts', weatherRegionCounts.JP === 9 && weatherRegionCounts.KR === 6, weatherRegionCounts);
check('catalog.ids_unique', new Set(weatherRegions.map(region => region.id)).size === weatherRegions.length);
check('catalog.test_region_excluded', !weatherRegionById.region_5n0cllub && excludedWeatherRegions.some(region => region.id === 'region_5n0cllub'));
check('catalog.korea_six_exact', JSON.stringify(weatherRegions.filter(region => region.country === 'KR').map(region => region.id)) === JSON.stringify(expectedKorea));
check('catalog.cli_region_set', JSON.stringify(Object.keys(primarySkiAreas)) === JSON.stringify(weatherRegions.map(region => region.id)));

const cfg = loadConfig();
for (const region of weatherRegions) {
  const derived = await deriveRegionPoints(region.id);
  const types = derived.points.map(point => point.point_type);
  check(`${region.id}.three_points`, JSON.stringify(types) === JSON.stringify(['summit', 'mid', 'base']), {types});
  check(`${region.id}.point_ids`, derived.points.every(point => point.point_id === `${region.id}:${point.point_type}`));
  check(`${region.id}.confirmed_dem`, derived.points.every(point => point.status === 'confirmed' && Math.abs(point.dem_diff) <= 50),
    {points: derived.points.map(point => ({type: point.point_type, diff: point.dem_diff, status: point.status}))});
  check(`${region.id}.elevation_order`, derived.points[0].elevation > derived.points[1].elevation && derived.points[1].elevation > derived.points[2].elevation);
  check(`${region.id}.country_policy`, countryOf(cfg, region.id, derived.points[0].latitude, derived.points[0].longitude) === region.country);
}

// The six pre-existing Japanese forecast point coordinates/elevations must stay byte-for-number equivalent.
for (const id of existingJapan) {
  const published = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather', `${id}.json`), 'utf8'));
  const actual = weatherRegionById[id].points.map(point => ({point_type: point.point_type, latitude: point.latitude,
    longitude: point.longitude, elevation: point.elevation}));
  const previous = published.points.map(point => ({point_type: point.point_type, latitude: point.latitude,
    longitude: point.longitude, elevation: point.elevation}));
  check(`regression.${id}.points_unchanged`, JSON.stringify(actual) === JSON.stringify(previous), {actual, previous});
}

const workflow = readFileSync(path.join(ROOT, '.github/workflows/weather-update.yml'), 'utf8');
check('workflow.two_hour_cron', /cron:\s*['"]0 \*\/2 \* \* \*['"]/.test(workflow));
check('workflow.budget_guard_before_pipeline', workflow.indexOf('weather-api-usage.mjs') < workflow.indexOf('weather-pipeline.mjs all'));
const usage = registeredScenario(2);
check('usage.registered_within_limits', usage.within_free_limits, usage);
check('usage.registered_counts', usage.jp === 9 && usage.kr === 6 && usage.regions === 15, usage);

const summary = {passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-region-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const result of results) if (!result.pass) console.log('FAIL', JSON.stringify(result).slice(0, 800));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;

