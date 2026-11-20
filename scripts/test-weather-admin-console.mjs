// Tests of the admin "날씨 시스템 관리" console: pure state / render code from dist/app.js (run in a vm, real code),
// plus static wiring checks of dist/index.html / dist/app.js (card, view, PC tab, admin guard, back handling).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(ROOT, 'dist/app.js'), 'utf8');
const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const results = [];
const test = (name, fn) => { try { fn(); results.push({name, pass: true}); } catch (e) { results.push({name, pass: false, error: e.message}); } };
const a = app.indexOf('  // ---- weather admin console (pure) ----'), b = app.indexOf('  // ---- end weather admin console (pure) ----');
const esc = app.match(/  function escapeHtml\(value\) \{[^\n]*\n/)[0];
const ctx = {Date, Number, String, Map, Array, JSON, Object, Math};
vm.createContext(ctx);
vm.runInContext(`${esc}${app.slice(a, b)}\nthis.m = {weatherAdminItemState, weatherAdminModel, weatherAdminHtml};`, ctx);
const {weatherAdminItemState: itemState, weatherAdminModel: model, weatherAdminHtml: render} = ctx.m;
const H = 3600e3, NOW = Date.now(), ago = h => new Date(NOW - h * H).toISOString();

// 15 regions × (JP: 3 models / KR: 2 models + Best Match) × 3 points = 162 items
const JP = ['asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro', 'dontan', 'region_tsbh66ti', 'region_q49t34uk'];
const KR = ['abcdef', 'yongpyong', 'phoenix', 'region_cdqt3r41', 'region_huyvh4ar', 'region_wxkfnu11'];
const items = [];
for (const r of [...JP, ...KR]) for (const m of [...(JP.includes(r) ? ['jma_msm'] : []), 'ecmwf_ifs025', 'gfs_seamless', 'best_match']) for (const p of ['summit', 'mid', 'base'])
  items.push({region_id: r, model: m, point: p, status: 'ok', last_success_at: ago(1), run_available_at: m === 'best_match' ? null : ago(2), attempts: 0});
const full = {generated_at: new Date(NOW).toISOString(), items, publish: [...JP, ...KR].map(r => ({region_id: r, published_at: ago(0.5)})), alerts: [], unacknowledged: 0, open_incident: null};

test('item state: ok / delayed (model 2×interval+1 h, Best Match 5 h) / failed / unconfirmed', () => {
  const t = (o) => itemState({status: 'ok', model: 'jma_msm', last_success_at: ago(1), run_available_at: ago(2), ...o}, NOW);
  assert.equal(t({}), 'ok');
  assert.equal(t({run_available_at: ago(8)}), 'delayed', 'JMA > 7 h');
  assert.equal(t({model: 'ecmwf_ifs025', run_available_at: ago(8)}), 'ok', 'ECMWF 8 h < 13 h');
  assert.equal(t({model: 'gfs_seamless', run_available_at: ago(14)}), 'delayed');
  assert.equal(t({model: 'best_match', run_available_at: null, last_success_at: ago(6)}), 'delayed', 'Best Match > 5 h');
  assert.equal(t({model: 'best_match', run_available_at: null, last_success_at: ago(3)}), 'ok');
  assert.equal(t({status: 'failed'}), 'failed');
  assert.equal(t({status: 'unconfirmed'}), 'delayed');
  assert.equal(t({last_success_at: null, run_available_at: null}), 'failed', 'never succeeded');
});
test('162 items / 15 regions: counts, per-region rows, publication times', () => {
  const m = model(full, id => id, NOW);
  assert.equal(m.total, 162);
  assert.deepEqual({...m.counts}, {ok: 162, delayed: 0, failed: 0});
  assert.equal(m.regions.length, 15);
  assert.equal(m.unpublished, 0);
  assert(m.regions.every(r => r.published_at && r.bm && r.model));
  assert.equal(m.regions.find(r => r.region_id === 'kiroro').items.length, 12);
  assert.equal(m.regions.find(r => r.region_id === 'yongpyong').items.length, 9);
});
test('problem filter lists only delayed / failed items with region, model, point and error', () => {
  const o = structuredClone(full);
  Object.assign(o.items.find(i => i.region_id === 'kiroro' && i.model === 'ecmwf_ifs025' && i.point === 'base'), {status: 'failed', attempts: 4, last_error: 'HTTP 503: <down>'});
  Object.assign(o.items.find(i => i.region_id === 'niseko' && i.model === 'best_match' && i.point === 'mid'), {last_success_at: ago(30)});
  const m = model(o, id => ({kiroro: '키로로', niseko: '니세코'}[id] || id), NOW);
  assert.deepEqual({...m.counts}, {ok: 160, delayed: 1, failed: 1});
  const h = render(m, 'problem');
  assert.equal((h.items.match(/admin-weather-item/g) || []).length, 2);
  assert.match(h.items, /키로로 · ECMWF · 하단 · 실패/);
  assert.match(h.items, /니세코 · Best Match · 중간 · 지연/);
  assert.match(h.items, /HTTP 503: &lt;down&gt;/, 'error text escaped');
  assert.match(h.items, /실패 4회/);
  assert.equal((render(m, 'all').items.match(/admin-weather-item/g) || []).length, 162);
});
test('alert history: kind labels, send status, unresolved items, ack button vs acknowledged', () => {
  const o = {...full, unacknowledged: 2, open_incident: {incident_key: 'k', opened_at: ago(26), stale_items: 1}, alerts: [
    {alert_key: 'k:stale_48h', kind: 'stale_48h', title: '날씨 데이터 48시간 미갱신 1건', body: 'kiroro·ECMWF·하단(48h)', items: [{region: 'kiroro', model: 'ecmwf_ifs025', point: 'base'}], status: 'sent', created_at: ago(1), acknowledged_at: null},
    {alert_key: 'k:stale_24h', kind: 'stale_24h', title: '날씨 데이터 24시간 미갱신 1건', body: 'x', items: [], status: 'failed', created_at: ago(25), acknowledged_at: null},
    {alert_key: 'old:recovered', kind: 'recovered', title: '날씨 데이터 갱신 정상화', body: '모두 복구', items: [], status: 'sent', created_at: ago(80), acknowledged_at: ago(70), acknowledged_by: '관리자'}]};
  const m = model(o, id => id, NOW), h = render(m, 'problem');
  assert.match(h.summary, /미확인 알림 2건/);
  assert.match(h.summary, /진행 중인 장애 1건/);
  assert.match(h.alerts, /48시간 재경고 · 날씨 데이터 48시간 미갱신 1건/);
  assert.match(h.alerts, /24시간 장애/);
  assert.match(h.alerts, /정상 복구/);
  assert.match(h.alerts, /발송 실패/);
  assert.match(h.alerts, /미복구 항목: kiroro·ECMWF·하단/);
  assert.equal((h.alerts.match(/data-weather-ack="/g) || []).length, 2, 'only unacknowledged alerts get a button');
  assert.match(h.alerts, /data-weather-ack="k:stale_48h"/);
  assert.match(h.alerts, /확인 완료 · 관리자/);
});
test('no data: clean empty screen (no errors, explicit messages)', () => {
  for (const o of [null, {}, {items: [], publish: [], alerts: [], unacknowledged: 0}]) {
    const m = model(o, id => id, NOW), h = render(m, 'problem');
    assert.equal(m.total, 0);
    assert.match(h.summary, /감시 데이터가 아직 없습니다/);
    assert.match(h.alerts, /알림 이력이 없습니다/);
    assert.match(h.regions, /지역 데이터가 없습니다/);
    assert.match(h.items, /지연·실패 항목이 없습니다/);
    assert.match(render(m, 'all').items, /감시 항목이 없습니다/);
  }
});
test('html: 4th admin card reuses the region card markup; view, back button, PC tab present', () => {
  const card3 = html.match(/<button id="stitchOpenAdminRegionsBtn" class="([^"]+)"/)[1];
  const card4 = html.match(/<button id="stitchOpenAdminWeatherBtn" class="([^"]+)"/)[1];
  assert.equal(card4, card3, 'same card classes');
  assert(html.indexOf('stitchOpenAdminRegionsBtn') < html.indexOf('stitchOpenAdminWeatherBtn'), 'after the 3rd card');
  assert.match(html, /<span[^>]*>시스템 관리<\/span>/, 'menu name: 시스템 관리');
  assert(!html.includes('날씨 시스템 관리') && !app.includes('날씨 시스템 관리'), 'old name gone');
  assert.match(html, /<h1>시스템 관리<\/h1>/);
  assert.match(html, /data-tab="weather">시스템 관리/);
  assert.match(html, /id="stitchAdminWeatherHideSelectedBtn"[^>]*disabled/);
  assert.match(html, /id="stitchAdminWeatherHideAllBtn"/);
  assert.match(html, /id="stitchAdminWeatherUnackBadge"[^>]*hidden/);
  assert.match(html, /<div id="mobileAdminWeatherView" class="stitch-subview" hidden>/);
  assert.match(html, /id="stitchAdminWeatherBackBtn"/);
  assert.match(html, /id="pcAdminTabWeather"[^>]*data-tab="weather"/);
  assert.match(html, /id="pcAdminWeatherSlot"/);
  for (const id of ['stitchOpenAdminUsersBtn', 'stitchOpenAdminCoursesBtn', 'stitchOpenAdminRegionsBtn', 'mobileAdminRegionsView', 'mobileAdminCoursesView', 'pcAdminTabRegions']) assert(html.includes(`id="${id}"`), `${id} kept`);
});
test('app.js wiring: admin-only view, guard, back gesture, PC tab, RPCs only (no table reads)', () => {
  assert.match(app, /subview === 'adminRegions' \|\| subview === 'adminWeather'\)\) \? 'main'/, 'non-admin redirected to main');
  assert.match(app, /adminWeatherMenu\.hidden = !isAdmin/);
  assert.match(app, /\['#mobileAdminWeatherView', '#stitchAdminWeatherBackBtn'\]/);
  assert.match(app, /\['weather', '#pcAdminTabWeather', '#pcAdminPanelWeather'\]/);
  assert.match(app, /rpc\('weather_admin_overview'\)/);
  assert.match(app, /rpc\('weather_admin_alert_ack', \{ p_alert_key: key \}\)/);
  assert(!/from\('weather_/.test(app), 'no direct weather_* table access from the app');
  assert.match(app, /loadAdminWeather\(\{ badgeOnly: true \}\)/, 'badge refreshed when the admin menu opens');
  // existing admin flows untouched
  for (const s of ["setStitchAccountSubView('adminRegions')", "setStitchAccountSubView('adminCourses')", 'loadAdminRegions();', "switchPcAdminTab('regions')"]) assert(app.includes(s), s);
});

test('delete UI: every alert has a checkbox and a delete button; selection kept across renders', () => {
  const o = {...full, alerts: [
    {alert_key: 'a1', kind: 'stale_24h', title: 't1', body: '', items: [], status: 'sent', created_at: ago(2), acknowledged_at: null},
    {alert_key: 'a2', kind: 'recovered', title: 't2', body: '', items: [], status: 'sent', created_at: ago(1), acknowledged_at: ago(0.5), acknowledged_by: '관리자'}]};
  const h = render(model(o, id => id, NOW), 'problem', new Set(['a2']));
  assert.equal((h.alerts.match(/data-weather-hide="/g) || []).length, 2);
  assert.equal((h.alerts.match(/data-weather-select="/g) || []).length, 2);
  assert.match(h.alerts, /data-weather-select="a2" checked/);
  assert.doesNotMatch(h.alerts, /data-weather-select="a1" checked/);
  assert.equal((h.alerts.match(/data-weather-ack="/g) || []).length, 1, 'ack button only for the unacknowledged alert');
});
test('delete wiring: confirm first, admin-only RPC, single / selection / all, reload after delete', () => {
  const i = app.indexOf('async function hideAdminWeatherAlerts'), fn = app.slice(i, i + 1200);
  assert(fn.indexOf('window.confirm(message)') > -1 && fn.indexOf('window.confirm(message)') < fn.indexOf("rpc('weather_admin_alert_hide'"), 'confirm before the RPC');
  assert.match(fn, /if \(!hasAdminWeatherAccess\(\)/);
  assert.match(fn, /all \? \{ p_all: true \} : \{ p_alert_keys: keys \}/);
  assert.match(fn, /await loadAdminWeather\(\)/);
  assert.match(app, /hideAdminWeatherAlerts\(\{ keys: \[hide\.dataset\.weatherHide\] \}\)/, 'single');
  assert.match(app, /hideAdminWeatherAlerts\(\{ keys: \[\.\.\.adminWeatherSelected\] \}\)/, 'selection');
  assert.match(app, /hideAdminWeatherAlerts\(\{ all: true \}\)/, 'all');
  assert(!/from\('weather_admin_alert_hides'\)/.test(app), 'no direct table access');
});

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` -> ${r.error}` : ''}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
