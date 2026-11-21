// Weather detail UI checks without a browser: runs the real dist/weather.js in a sandbox with a small fake DOM + fake
// history (state stack, back() -> popstate), opens the detail page for kiroro and inspects markup + navigation.
// Pixel layout (heights, scrolling feel) still needs a real browser / device. Writes work/weather/weather-detail-ui-tests.json.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const js = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
const css = readFileSync(path.join(ROOT, 'dist/weather.css'), 'utf8');
const files = {
  './data/livecams.json': JSON.parse(readFileSync(path.join(ROOT, 'dist/data/livecams.json'), 'utf8')),
  './data/weather-source.json': JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather-source.json'), 'utf8')),
  './data/weather/kiroro.json': JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather/kiroro.json'), 'utf8')),
  './data/weather-multimodel/kiroro.json': JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather-multimodel/kiroro.json'), 'utf8'))
};

// ---- fake DOM: only elements that exist in markup (or were appended) can be found ----
const fetched = [];
const els = new Map();
function make(id) {
  const e = {id, hidden: id === 'weatherDetailPage', style: {}, dataset: {}, attrs: {}, _html: '', scrollTop: 0, scrollLeft: 0, textContent: '', className: '',
    classList: {set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(t, f) { (this.on ||= {})[t] = f; },
    focus() { focused = this.id; }, insertAdjacentElement() {}, appendChild(child) { if (child.id) els.set(child.id, child); registerIds(child._html); },
    querySelector(sel) { if (sel === '.weather-detail-inner') return make('__inner'); if (sel.startsWith('#')) return els.get(sel.slice(1)) || null; return null; },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      if (id === 'wxPointSections' && this._html) { const b = els.get('weatherDetailBody'); b._html = b._html.replace(this._html, v); }
      this._html = v; registerIds(v);
      if (id === 'weatherDetailBody') {
        const m = /<div id="wxPointSections" class="wx-stack">([\s\S]*)<\/div>\s*<div class="wx-px wx-cam-entry-wrap">/.exec(v);
        if (m) els.get('wxPointSections')._html = m[1];
      }
    },
    set outerHTML(v) { for (const host of els.values()) if (host._html.includes(`id="${id}"`)) host._html = host._html.replace(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`), v); registerIds(v); }};
  return e;
}
function registerIds(html) { for (const m of String(html).matchAll(/id="([^"]+)"/g)) if (!els.has(m[1])) els.set(m[1], make(m[1])); }
let focused = null;
['homeWeatherCard', 'homeWeatherSummitTemp', 'homeWeatherWind', 'homeWeatherValidTime', 'homeWeatherIcon', 'homeWeatherState', 'weatherDetailPage', 'weatherDetailBody', 'weatherDetailTitle', 'weatherDetailBackBtn', 'mobileHomeScreen']
  .forEach(id => els.set(id, make(id)));
// ---- fake history: state stack; back() fires popstate asynchronously like a browser ----
const winListeners = {};
const stack = [{state: null, url: '/'}];
let pos = 0;
const history = {
  get state() { return stack[pos].state; },
  pushState(state, _t, url) { stack.splice(pos + 1); stack.push({state, url}); pos++; },
  replaceState(state, _t, url) { stack[pos] = {state, url}; },
  back() { if (pos > 0) { pos--; const ev = {state: stack[pos].state}; setTimeout(() => (winListeners.popstate || []).forEach(f => f(ev)), 0); } }
};
const tick = () => new Promise(r => setTimeout(r, 5));
const ctx = {
  console: {debug() {}, log() {}}, URL, Promise, JSON, Object, Map, Set, Math, Number, String, Array, Date, setTimeout, clearTimeout, structuredClone,
  location: {hash: '', pathname: '/', search: ''}, history, CSS: {escape: s => s}, requestAnimationFrame: f => f(),
  document: {baseURI: 'https://x/app/', getElementById: id => els.get(id) || null, createElement: () => make(''), querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, readyState: 'complete', body: {dataset: {}}},
  fetch: async url => { const k = String(url).replace('https://x/app/', './'); fetched.push(String(url)); return files[k] ? {ok: true, json: async () => structuredClone(files[k])} : {ok: false}; }
};
ctx.window = ctx; ctx.window.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); }; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(js, ctx);
// document.createElement returns an element whose id is assigned afterwards: re-key it on append
const origMake = ctx.document.createElement;
ctx.document.createElement = () => { const e = origMake(); return new Proxy(e, {set(t, k, v) { t[k] = v; return true; }}); };
const W = ctx.PowderlineWeather;
const body = () => els.get('weatherDetailBody').innerHTML;
const page = els.get('weatherDetailPage');
const click = sel => page.on.click({target: {closest: s => (s === sel ? (sel === '[data-wx-date]' ? {dataset: {wxDate: click.date}} : {}) : null)}});
const rows = () => (body().match(/class="wx-hour[ "]/g) || []).length;
const hourTimes = () => [...body().matchAll(/<span class="wx-hour-time">(\d\d):00<\/span>/g)].map(m => m[1]).join(',');

await W.setRegion('kiroro', '키로로');
els.get('homeWeatherCard').on.click();
check('detail_open', !page.hidden && history.state?.plWeather === true);
check('daily_18_cards_one_selected', (body().match(/class="wx-day[ "]/g) || []).length === 18 && (body().match(/aria-pressed="true"/g) || []).length === 1);
check('collapsed_7_rows_08_to_20_every_2h', rows() === 7 && hourTimes() === '08,10,12,14,16,18,20' && !els.get('weatherDetailBody').classList.contains('wx-hours-expanded'), {times: hourTimes()});
check('daily_subtitle_removed', !body().includes('과거 2일') && !body().includes('16일간 전망') && body().includes('일별 예보'));
check('condition_title_removed_labels_updated', !body().includes('wx-cond-head') && !body().includes('>WEATHER<') && body().includes('PAST 24H') && body().includes('NEXT 24H'));
// order: summary -> daily -> hourly -> LIVE CAM entry -> footer
const iCond = body().indexOf('wx-cond-card'), iDaily = body().indexOf('class="wx-days"'), iHour = body().indexOf('id="wxHourlySection"'), iCam = body().indexOf('id="wxLiveCam"'), iFoot = body().indexOf('wx-footer');
check('order_weather_daily_hourly_cam_footer', iCond > 0 && iCond < iDaily && iDaily < iHour && iHour < iCam && iCam < iFoot);
const camCard = body().slice(body().indexOf('<button type="button" class="wx-card wx-cam-entry"'), body().indexOf('</button>', iCam));
check('cam_entry_card_centered_no_name', /videocam/.test(camCard) && /LIVE CAM/.test(camCard) && /chevron_right/.test(camCard) && /wx-cam-entry-center/.test(camCard) && !/키로로/.test(camCard) && !/wx-cam-region/.test(camCard));
check('cam_big_placeholder_removed', !/wx-cam-preview|웹캠 준비 중/.test(body()) && !/wx-cam-preview \{/.test(css));
// expand: 24 rows rendered, list scrolls inside, body marked, footer hidden by CSS
click('#wxHourlyToggle');
check('expanded_24_rows', rows() === 24 && /<span class="wx-hour-time">00:00<\/span>[\s\S]*<span class="wx-hour-time">23:00<\/span>/.test(body()));
check('expanded_mode_marked', els.get('weatherDetailBody').classList.contains('wx-hours-expanded') && />접기<\/button>/.test(body()));
check('expanded_cam_still_after_list', body().indexOf('id="wxLiveCam"') > body().indexOf('id="wxHoursList"'));
// date change: list re-rendered, scroll reset, mode kept
els.get('wxHoursList').scrollTop = 500;
click.date = [...body().matchAll(/data-wx-date="([^"]+)" aria-pressed="false"/g)][4]?.[1];
click('[data-wx-date]');
check('date_change_resets_scroll_keeps_mode', body().includes(`data-wx-date="${click.date}" aria-pressed="true"`) && els.get('wxHoursList').scrollTop === 0 && rows() === 24);
// collapse
click('#wxHourlyToggle');
check('collapse_back_to_7', rows() === 7 && hourTimes() === '08,10,12,14,16,18,20' && !els.get('weatherDetailBody').classList.contains('wx-hours-expanded') && />24시간 보기<\/button>/.test(body()));
click('#wxHourlyToggle'); // expanded again before visiting the camera view
// LIVE CAM view
click('#wxLiveCam');
await tick();
const cam = els.get('wxCamView');
const camBody = () => els.get('wxCamViewBody')?.innerHTML || '';
check('cam_view_opens_in_app', cam && cam.hidden === false && history.state?.plWeatherCam === true && stack[pos].url === '#weather-cam');
check('cam_view_contents', cam && /arrow_back_ios_new/.test(cam._html) && els.get('wxCamViewTitle')?.textContent === '키로로 리조트' && els.get('wxCamViewRegion')?.textContent === 'LIVE CAM' && /베이스 에어리어/.test(camBody()));
check('cam_view_verified_media_no_autoplay', /<iframe/.test(camBody()) && /q96NwhD6Lrw/.test(camBody()) && /autoplay=0/.test(camBody()) && /원본 웹캠 열기/.test(camBody()));
check('cam_view_four_separate_cameras', (camBody().match(/data-camera-id=/g) || []).length === 4 && (camBody().match(/aria-pressed="true"/g) || []).length === 1);
cam.on.click({target: {closest: selector => selector === '[data-camera-id]' ? {dataset: {cameraId: 'kiroro-nagamine2'}} : null}});
check('cam_camera_switch', /RVblxnP4Ry8/.test(camBody()) && /나가미네 제2 에어리어/.test(camBody()) && /data-camera-id="kiroro-nagamine2" aria-pressed="true"/.test(camBody()));
// back button of the camera view -> Weather page, state kept
els.get('wxCamBackBtn').on.click(); await tick();
check('cam_back_returns_to_weather', cam.hidden === true && !page.hidden && history.state?.plWeather === true && !history.state?.plWeatherCam);
check('weather_state_kept_after_cam', body().includes(`data-wx-date="${click.date}" aria-pressed="true"`) && rows() === 24);
// Android back (app.js clicks #weatherDetailBackBtn while the page is visible): closes the camera view first
click('#wxLiveCam');
await tick();
els.get('weatherDetailBackBtn').on.click(); await tick();
check('android_back_closes_cam_first', cam.hidden === true && !page.hidden && history.state?.plWeather === true);
// browser back gesture from the camera view
click('#wxLiveCam');
await tick();
history.back(); await tick();
check('browser_back_from_cam', cam.hidden === true && !page.hidden);
// browser back from the Weather page closes it; history did not grow
history.back(); await tick();
check('browser_back_closes_weather', page.hidden === true && cam.hidden === true && pos === 0, {pos});
// region change updates the entry card name
els.get('homeWeatherCard').on.click();
await W.setRegion('niseko', '니세코');
check('region_change_rerenders_cam_entry', /id="wxLiveCam" data-region="niseko"/.test(body()) || /데이터가 없습니다/.test(body()));
// Only the app's own data and (switch {"supabase": true}) the public Supabase weather bucket may be requested.
const allowed = u => u.startsWith('https://x/app/data/') || u.startsWith('https://lxfsvhwibiaspnaduhri.supabase.co/storage/v1/object/public/weather-public/');
check('no_external_requests', fetched.every(allowed), {fetched: fetched.filter(u => !allowed(u))});

// ---- CSS: fixed layout rules ----
check('css_point_sections_contents', /#wxPointSections \{ display: contents; \}/.test(css));
check('css_hourly_takes_remaining_same_in_both_modes', /#wxPointSections > #wxHourlySection \{ flex: 1 1 0; min-height: \d+px;/.test(css) && /#wxHourlySection > \.wx-hours \{\s*flex: 1 1 0;/.test(css));
check('css_footer_not_toggled_by_mode', !/wx-hours-expanded[^{]*\{[^}]*display: none/.test(css));
check('css_cam_entry_grid_center', /\.wx-cam-entry \{\s*display: grid; grid-template-columns: 1fr auto 1fr;/.test(css) && /\.wx-cam-entry-chevron \{ justify-self: end;/.test(css));
check('css_list_inner_scroll', /#wxHourlySection > \.wx-hours \{[^}]*min-height: 0; overflow-y: auto; overscroll-behavior: contain;[^}]*touch-action: pan-y;/.test(css));
check('css_fixed_children_dont_shrink', /\.weather-detail-body > \* \{ flex: 0 0 auto; \}/.test(css) && /#wxPointSections > \* \{ flex: 0 0 auto; \}/.test(css));
check('css_body_column_viewport', /\.weather-detail-body \{\s*flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto;/.test(css) && /height: 100dvh/.test(css));
check('css_4_daily_cards_kept', css.includes('.wx-day { flex: 0 0 calc((100% - 12px) / 4)'));
check('css_cam_view_over_page', /\.wx-cam-view \{ position: absolute; inset: 0;/.test(css) && /env\(safe-area-inset-bottom/.test(css));
check('no_condition_or_surface_ui', !/wx-pill|ratingPill|class="wx-surface|\.wx-surface[a-z-]* \{|data\/snow-surface/.test(js + css));

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-detail-ui-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 300));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
