// Static LIVE CAM mapping and safety checks. Network/player/device playback is deliberately not claimed here.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {excludedWeatherRegions, weatherRegionIds} from './weather-regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/livecams.json'), 'utf8'));
const js = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
const css = readFileSync(path.join(ROOT, 'dist/weather.css'), 'utf8');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});

const japan = ['asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro', 'dontan', 'region_tsbh66ti', 'region_q49t34uk'];
const korea = ['abcdef', 'yongpyong', 'phoenix', 'region_cdqt3r41', 'region_huyvh4ar', 'region_wxkfnu11'];
const expected = [...japan, ...korea].sort();
const ids = Object.keys(data.regions || {}).sort();
const cameras = Object.values(data.regions || {}).flatMap(region => region.cameras || []);
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

check('schema_v1_region_map', data.schemaVersion === 1 && data.regions && !Array.isArray(data.regions));
check('japan_9_korea_6_exact_mapping', JSON.stringify(ids) === JSON.stringify(expected), {japan: japan.length, korea: korea.length, total: ids.length});
check('matches_registered_weather_region_ids', JSON.stringify(ids) === JSON.stringify([...weatherRegionIds].sort()));
check('dongtan_excluded', data.excludedRegionIds?.includes('region_5n0cllub') && !data.regions.region_5n0cllub);
check('matches_registered_exclusion', excludedWeatherRegions.some(region => region.id === 'region_5n0cllub'));
check('region_ids_match_keys', Object.entries(data.regions).every(([id, region]) => region.regionId === id));
check('external_page_for_every_region', Object.values(data.regions).every(region => region.external?.type === 'external' && region.external.enabled === true && https(region.external.url) && region.external.embedUrl === null));
check('camera_required_fields', cameras.every(camera => typeof camera.cameraId === 'string' && camera.cameraId && typeof camera.name === 'string' && camera.name
  && ['youtube', 'iframe', 'image', 'hls'].includes(camera.type) && https(camera.url)
  && (camera.type === 'hls' ? /^https?:\/\/.+\.m3u8$/.test(camera.embedUrl) : https(camera.embedUrl))
  && typeof camera.enabled === 'boolean' && typeof camera.verificationStatus === 'string'));
check('camera_ids_unique', new Set(cameras.map(camera => camera.cameraId)).size === cameras.length, {cameras: cameras.length});
check('enabled_only_when_verified', cameras.every(camera => !camera.enabled || camera.verificationStatus.startsWith('verified_')));
const koreaCount = {abcdef: 6, yongpyong: 5, phoenix: 7, region_cdqt3r41: 5, region_huyvh4ar: 18, region_wxkfnu11: 5};
check('hls_only_in_korea', japan.every(id => (data.regions[id].cameras || []).every(camera => camera.type !== 'hls')));
check('korea_hls_camera_counts', Object.entries(koreaCount).every(([id, n]) => data.regions[id].cameras.length === n && data.regions[id].cameras.every(camera => camera.type === 'hls')));
check('http_streams_flagged_mixed_content', cameras.filter(camera => camera.type === 'hls' && camera.embedUrl.startsWith('http:')).every(camera => /mixed_content/.test(camera.verificationStatus)));
check('mixed_content_not_bypassed', /location\.protocol === 'https:' && new URL\(camera\.embedUrl\)\.protocol === 'http:'/.test(js) && !/allowMixedContent|upgrade-insecure/.test(js));
check('previous_stream_destroyed', /function destroyCamPlayer/.test(js) && (js.match(/destroyCamPlayer\(\);/g) || []).length >= 4);
check('autoplay_blocked_play_button', js.includes('wxCamPlay') && js.includes("setCamState('paused')"));
check('hls_retry_and_source_link', js.includes('wxCamRetry') && js.includes('safeHttpsUrl(selected.url)'));
check('altitude_bar_hidden_in_cam', /\.wx-cam-active \.wx-alt-card \{ visibility: hidden; \}/.test(css) && js.includes("classList.add('wx-cam-active')") && js.includes("classList.remove('wx-cam-active')"));
check('autoplay_disabled', cameras.every(camera => !/[?&]autoplay=1(?:&|$)/.test(camera.embedUrl))); // iframe/YouTube; HLS uses muted video.play()
check('expected_internal_camera_count', cameras.length === 66, {cameras: cameras.length});
const japanCount = {asahidake: 1, rusutsu: 3, furano: 2, niseko: 6, kamui: 1, kiroro: 4, dontan: 1, region_tsbh66ti: 2, region_q49t34uk: 0};
check('japan_20_cameras_per_region', Object.entries(japanCount).every(([id, n]) => data.regions[id].cameras.length === n), Object.fromEntries(japan.map(id => [id, data.regions[id].cameras.length])));
check('rusutsu_force_urls_verbatim', data.regions.rusutsu.cameras.every(camera => camera.type === 'image' && /^https:\/\/powdercam\.net\/app\/show\.php\?serial_number=[0-9a-f]{16}&force=WaU9xDcru3a3cWAm&202611191620$/.test(camera.embedUrl)));
check('region_connection_is_id_based', /cfg\?\.regions\?\.\[regionId\]/.test(js) && /entry\?\.regionId === regionId/.test(js));
check('no_other_resort_fallback', !/cameras\s*\[\s*0\s*\].*region/i.test(js) && js.includes('등록된 라이브캠이 없습니다.'));
check('weather_state_kept_under_overlay', /wx-cam-view \{ position: absolute; inset: 0;/.test(css) && /plWeatherCam/.test(js));
check('player_error_and_external_fallback', js.includes('wxCamMediaError') && js.includes('원본 웹캠 열기') && js.includes("addEventListener('error'"));
check('multi_camera_selector', js.includes('data-camera-id') && js.includes('selectedCameraByRegion'));

const summary = {passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length};
const output = {ranAt: new Date().toISOString(), scope: 'static mapping and UI logic; no real browser or device playback', summary, results};
writeFileSync(path.join(ROOT, 'work/weather/livecam-tests.json'), JSON.stringify(output, null, 2) + '\n');
for (const result of results) if (!result.pass) console.log('FAIL', JSON.stringify(result));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
