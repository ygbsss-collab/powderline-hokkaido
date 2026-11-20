// Korea model policy tests (offline). A synthetic Korean region is built from the kiroro Best Match file with the
// points moved to Korean coordinates; model data and run meta are stubs. Also checks that Japan is unchanged and that
// nothing KMA-related exists. Writes work/weather/weather-korea-tests.json.
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, countryOf, profileConfig, profileModels, weightsFor} from './weather-multimodel-engine.mjs';
import {publishRegion} from './weather-multimodel-publish.mjs';
import {perRegion, scenario, collectorRequest, weight} from './weather-api-usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const near = (a, b, e = 0.006) => a != null && b != null && Math.abs(a - b) < e;
const cfg = loadConfig();

// country detection (same boxes as the app)
check('country.yongpyong_kr', countryOf(cfg, 'x', 37.64, 128.68) === 'KR');
check('country.high1_kr', countryOf(cfg, 'x', 37.21, 128.83) === 'KR');
check('country.kiroro_jp', countryOf(cfg, 'kiroro', 43.06, 141.03) === 'JP');
check('country.outside_null', countryOf(cfg, 'x', 46.5, 7.9) === null);
check('country.override_wins', countryOf({...cfg, country_detection: {...cfg.country_detection, region_country: {x: 'KR'}}}, 'x', 43, 141) === 'KR');

// profiles
const KR = profileConfig(cfg, 'KR'), JP = profileConfig(cfg, 'JP');
check('profile.kr_models_no_jma', JSON.stringify(Object.keys(profileModels(KR)).sort()) === JSON.stringify(['best_match', 'ecmwf_ifs025', 'gfs_seamless']));
check('profile.jp_models_unchanged', JSON.stringify(Object.keys(profileModels(JP)).sort()) === JSON.stringify(['best_match', 'ecmwf_ifs025', 'gfs_seamless', 'jma_msm']));
check('profile.jp_bands_are_default', JP.bands === cfg.bands && JP.transitions === cfg.transitions);
check('profile.kr_0_72_best_match', JSON.stringify(weightsFor(KR, 1).weights) === '{"best_match":1}' && JSON.stringify(weightsFor(KR, 72).weights) === '{"best_match":1}');
check('profile.kr_73_168_ecmwf_gfs', JSON.stringify(weightsFor(KR, 73).weights) === '{"ecmwf_ifs025":0.75,"gfs_seamless":0.25}' && weightsFor(KR, 168).band === 'd4_7');
check('profile.kr_169_240_ecmwf', JSON.stringify(weightsFor(KR, 200).weights) === '{"ecmwf_ifs025":1}');
check('profile.kr_241_384_best_match', JSON.stringify(weightsFor(KR, 300).weights) === '{"best_match":1}' && weightsFor(KR, 241).band === 'd11_16');
check('profile.jp_0_72_still_jma_ecmwf', JSON.stringify(weightsFor(JP, 10).weights) === '{"jma_msm":0.65,"ecmwf_ifs025":0.35}');

// synthetic Korean region
const bmJP = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather/kiroro.json'), 'utf8'));
const bmKR = structuredClone(bmJP);
bmKR.region_id = 'test-kr';
const KRPTS = {summit: [37.616, 128.676, 1458], mid: [37.628, 128.684, 1050], base: [37.645, 128.682, 760]};
bmKR.points = bmKR.points.map(p => ({...p, latitude: KRPTS[p.point_type][0], longitude: KRPTS[p.point_type][1], elevation: KRPTS[p.point_type][2], grid_latitude: null, grid_longitude: null}));
const now = Date.parse(bmJP.fetched_at), anchor = Math.floor(now / HOUR) * HOUR;
const axis = bmJP.hourly.time.map(t => Date.parse(t));
const VAL = {best_match: -1, jma_msm: -2, ecmwf_ifs025: -4, gfs_seamless: -8};
const requested = [], metaAsked = [];
const fetchFn = async id => {
  requested.push(id);
  const at = new Map(), last = {};
  for (const t of axis) {
    const lead = Math.round((t - anchor) / HOUR);
    if (id !== 'best_match' && lead < 1) continue;
    const row = {temperature_2m: VAL[id], precipitation: 0.5, rain: 0.1, snowfall: 0.2, wind_speed_10m: 3, wind_direction_10m: 90, weather_code: 3};
    at.set(t, row); for (const k of Object.keys(row)) last[k] = t;
  }
  return {ok: true, at, last, range_utc: null, response_coordinate: {latitude: 37.6, longitude: 128.7}};
};
const metaFn = async name => { metaAsked.push(name); return {ok: true, initialisation_utc: '2026-11-18T18:00:00.000Z', availability_utc: '2026-11-19T01:00:00.000Z', update_interval_h: 6}; };
const lead = (mm, L) => mm.hourly.time.findIndex(t => Math.round((Date.parse(t) - anchor) / HOUR) === L);
{
  const {mm, issues} = await publishRegion('test-kr', {now, bm: bmKR, previous: null, fetchFn, metaFn});
  const s = mm.hourly.summit, src = mm.multimodel.hourly_source.summit, w = mm.multimodel.hourly_weights.summit;
  const bmAt = L => bmKR.hourly.summit.temperature_2m[lead(mm, L)];
  check('kr.valid', issues.length === 0, {issues});
  check('kr.country_recorded', mm.multimodel.country === 'KR' && mm.multimodel.country_label === '한국' && JSON.stringify(mm.multimodel.models_used.sort()) === JSON.stringify(['best_match', 'ecmwf_ifs025', 'gfs_seamless']));
  check('kr.jma_never_requested', !requested.includes('jma_msm') && !metaAsked.includes('jma_msm'), {requested: [...new Set(requested)], metaAsked: [...new Set(metaAsked)]});
  check('kr.d0_3_best_match', src[lead(mm, 10)] === 'd0_3' && JSON.stringify(w[lead(mm, 10)]) === '{"best_match":1}' && near(s.temperature_2m[lead(mm, 10)], bmAt(10)));
  check('kr.d4_7_ecmwf75_gfs25', near(s.temperature_2m[lead(mm, 100)], 0.75 * -4 + 0.25 * -8));
  check('kr.d8_10_ecmwf', near(s.temperature_2m[lead(mm, 200)], -4) && src[lead(mm, 200)] === 'd8_10');
  check('kr.transition_ecmwf_to_bm_kept', /transition/.test(mm.multimodel.hourly_reason.summit[lead(mm, 240)] || '') && near(s.temperature_2m[lead(mm, 300)], bmAt(300)));
  check('kr.best_match_api_not_requested', !requested.includes('best_match') && mm.multimodel.model_sources.summit.best_match.reused_published_file === true,
    {requested: [...new Set(requested)]});
  check('kr.past_hours_model_values', src[lead(mm, 0)] === 'best_match' && /past hour/.test(mm.multimodel.hourly_reason.summit[lead(mm, 0)]));
  check('kr.three_altitudes', ['summit', 'mid', 'base'].every(p => mm.hourly[p] && mm.hourly[p].temperature_2m.length === mm.hourly.time.length));
  check('kr.72_73_boundary_hourly_steps', Date.parse(mm.hourly.time[lead(mm, 73)]) - Date.parse(mm.hourly.time[lead(mm, 72)]) === HOUR && src[lead(mm, 73)] === 'd4_7');
}
// Japan through the same code path: unchanged policy
{
  requested.length = 0;
  const {mm, issues} = await publishRegion('kiroro', {now, previous: null, fetchFn, metaFn});
  check('jp.valid_country_jp', issues.length === 0 && mm.multimodel.country === 'JP' && requested.includes('jma_msm'));
  check('jp.d0_3_jma_ecmwf', near(mm.hourly.summit.temperature_2m[lead(mm, 10)], 0.65 * -2 + 0.35 * -4));
}
// undetermined country -> no multi-model file (app keeps Best Match)
{
  const bmX = structuredClone(bmJP); bmX.region_id = 'test-x'; bmX.points = bmX.points.map(p => ({...p, latitude: 46.5, longitude: 7.9}));
  let err = null; try { await publishRegion('test-x', {now, bm: bmX, previous: null, fetchFn, metaFn}); } catch (e) { err = e.message; }
  check('unknown_country_not_published', /country not determined/.test(err || ''), {err});
}
// no KMA anywhere (code, config, workflow)
{
  const files = [...readdirSync(path.join(ROOT, 'scripts')).filter(f => /\.(mjs|json)$/.test(f) && !/test-weather-korea/.test(f)).map(f => `scripts/${f}`),
    'dist/weather.js', 'dist/app.js', '.github/workflows/weather-update.yml'];
  // integration traces only (endpoints, key parameters, KMA modules); comments stating "no KMA" are allowed
  const hit = files.filter(f => /apihub\.kma|kma\.go\.kr|data\.go\.kr|serviceKey=|authKey=|KMA_[A-Z_]*KEY|kma-collect|import[^\n]*kma/i.test(readFileSync(path.join(ROOT, f), 'utf8')));
  check('no_kma_code_or_keys', hit.length === 0, {hit});
}
// past hours are labelled as model estimates in the UI (never as observations)
{
  const js = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
  check('ui_past_labelled_model_estimate', js.includes('과거 모델 추정') && js.includes('지난 시각 (모델 추정값)') && !/실측|관측값/.test(js.replace(/\/\/.*$/gm, '')));
}
// API usage model
{
  const col = collectorRequest();
  check('usage.weight_rule', weight(10, 14) === 1 && near(weight(15, 14), 1.5) && near(weight(15, 28), 3));
  check('usage.collector_from_code', col.variables === 33 && col.days === 19, col);
  check('usage.kr_cheaper_than_jp', perRegion('KR').weighted < perRegion('JP').weighted);
  check('usage.25_regions_2h_within_free', scenario({jp: 25, kr: 0, intervalH: 2}).within_free_limits);
  check('usage.30_regions_hourly_exceeds', !scenario({jp: 15, kr: 15, intervalH: 1}).within_free_limits);
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-korea-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 400));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
