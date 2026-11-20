// Date / hour boundary tests of the weather detail page (fixed 08-20 / 00-23 rows; past dimmed, current highlighted): real dist/weather.js in a vm with a fake clock, fake timers
// and the small fake DOM of test-weather-detail-ui.mjs. Stored repo data only (no network). The whole file runs a
// second time in a child process with another device time zone (TZ=America/Los_Angeles): the region's own
// utc_offset_seconds must decide 오늘 / 내일 and the first hourly row, never the device zone.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const js = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
const load = rel => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function harness(region) {
  const files = {'./data/livecams.json': load('dist/data/livecams.json'), './data/weather-source.json': {primary: 'multimodel'},
    [`./data/weather/${region}.json`]: load(`dist/data/weather/${region}.json`), [`./data/weather-multimodel/${region}.json`]: load(`dist/data/weather-multimodel/${region}.json`)};
  const mm = files[`./data/weather-multimodel/${region}.json`];
  const off = mm.utc_offset_seconds * 1000;
  let NOW = 0;
  const fetched = [];
  const timers = [];
  const docListeners = {};
  const els = new Map();
  const make = id => {
    const e = {id, hidden: id === 'weatherDetailPage', style: {}, dataset: {}, attrs: {}, _html: '', scrollTop: 0, scrollLeft: 0, textContent: '', title: '', className: '',
      classList: {set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }},
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(t, f) { (this.on ||= {})[t] = f; },
      focus() {}, insertAdjacentElement(_p, child) { if (child?.id) els.set(child.id, child); }, appendChild(child) { if (child.id) els.set(child.id, child); reg(child._html); },
      querySelector(sel) { return sel.startsWith('#') ? els.get(sel.slice(1)) || null : null; },
      get innerHTML() { return this._html; },
      set innerHTML(v) {
        if (id === 'wxPointSections' && this._html) { const b = els.get('weatherDetailBody'); b._html = b._html.replace(this._html, v); }
        this._html = v; reg(v);
        if (id === 'weatherDetailBody') { const m = /<div id="wxPointSections" class="wx-stack">([\s\S]*)<\/div>\s*<div class="wx-px wx-cam-entry-wrap">/.exec(v); if (m) els.get('wxPointSections')._html = m[1]; }
      },
      set outerHTML(v) { for (const host of els.values()) if (host._html.includes(`id="${id}"`)) host._html = host._html.replace(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`), v); reg(v); }};
    return e;
  };
  const reg = html => { for (const m of String(html).matchAll(/id="([^"]+)"/g)) if (!els.has(m[1])) els.set(m[1], make(m[1])); };
  ['homeWeatherCard', 'homeWeatherSummitTemp', 'homeWeatherWind', 'homeWeatherValidTime', 'homeWeatherIcon', 'homeWeatherState', 'weatherDetailPage', 'weatherDetailBody', 'weatherDetailTitle', 'weatherDetailBackBtn', 'mobileHomeScreen']
    .forEach(id => els.set(id, make(id)));
  class FakeDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const doc = {baseURI: 'https://x/app/', visibilityState: 'visible', getElementById: id => els.get(id) || null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(t, f) { (docListeners[t] ||= []).push(f); }, readyState: 'complete', body: {dataset: {}}};
  doc.createElement = () => new Proxy(make(''), {set(t, k, v) { t[k] = v; return true; }});
  const ctx = {console: {debug() {}, log() {}}, URL, Promise, JSON, Object, Map, Set, Math, Number, String, Array, Date: FakeDate, structuredClone,
    setTimeout: (fn, ms) => { if (ms < 1000) return setTimeout(fn, ms); const t = {fn, ms, id: timers.length + 1}; timers.push(t); return t.id; },
    clearTimeout: id => { const t = timers.find(x => x.id === id); if (t) t.cleared = true; else clearTimeout(id); },
    location: {hash: '', pathname: '/', search: ''}, history: {state: null, pushState() {}, replaceState() {}, back() {}}, CSS: {escape: s => s}, requestAnimationFrame: f => f(),
    document: doc, fetch: async url => { const k = String(url).replace('https://x/app/', './'); fetched.push(k); return files[k] ? {ok: true, json: async () => structuredClone(files[k])} : {ok: false}; }};
  ctx.window = ctx; ctx.window.addEventListener = () => {}; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const body = () => els.get('weatherDetailBody').innerHTML;
  const page = els.get('weatherDetailPage');
  const local = iso => Date.parse(iso) - off; // region wall time "YYYY-MM-DDTHH:MM" -> epoch
  return {
    mm, files, fetched, els, body,
    setNow: wall => { NOW = local(`${wall}:00Z`); },
    open: async () => { await ctx.PowderlineWeather.setRegion(region, region); els.get('homeWeatherCard').on.click(); await new Promise(r => setTimeout(r, 10)); },
    click: (sel, date) => page.on.click({target: {closest: s => (s === sel ? (sel === '[data-wx-date]' ? {dataset: {wxDate: date}} : {}) : null)}}),
    clockTimer: () => [...timers].reverse().find(t => !t.cleared && t.fn.name === 'onClockTick'),
    fireClock() { const t = this.clockTimer(); if (!t) return false; t.cleared = true; t.fn(); return true; },
    visibility: async state => { doc.visibilityState = state; for (const f of docListeners.visibilitychange || []) f(); await new Promise(r => setTimeout(r, 10)); },
    hours: () => [...body().matchAll(/<span class="wx-hour-time">(\d\d):00<\/span>/g)].map(m => m[1]).join(','),
    // "08p,10p,12p,14f": p = past (dimmed), c = current hour (highlighted), f = future (normal colours)
    states: () => [...body().matchAll(/<div class="wx-hour( past| current)?" data-hour="(\d\d)"/g)].map(m => `${m[2]}${m[1] ? m[1].trim()[0] : 'f'}`).join(','),
    hourDate: () => /<div class="wx-hour-tools"><span>([^<]+)<\/span>/.exec(body())?.[1],
    dayLabel: date => new RegExp(`data-wx-date="${date}"[^>]*><div class="wx-day-head"><span>([^<]+)</span>`).exec(body())?.[1],
    selected: () => /class="wx-day[^"]*" data-wx-date="([^"]+)" aria-pressed="true"/.exec(body())?.[1],
    header: () => els.get('wxHeaderTime')?.textContent
  };
}
const md = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const span = (from, to, st) => Array.from({length: to - from + 1}, (_, k) => `${String(from + k).padStart(2, '0')}${st}`);
const wd = d => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

for (const region of ['kiroro', 'yongpyong']) {
  const H = harness(region);
  // a local day well inside the data: the day of the file's own "current" time (JP / KR local wall time)
  const day = H.mm.current.summit.forecast_time.slice(0, 10);
  H.setNow(`${day}T13:47`);
  await H.open();
  const n0 = H.fetched.length;
  check(`${region}.today_tomorrow_weekday_labels`, H.dayLabel(day) === `오늘 (${md(day)})` && H.dayLabel(addDays(day, 1)) === `내일 (${md(addDays(day, 1))})`
    && H.dayLabel(addDays(day, 2)) === `${md(addDays(day, 2))} (${wd(addDays(day, 2))})` && H.dayLabel(addDays(day, -1)) === `어제 (${md(addDays(day, -1))})` && H.selected() === day,
    {today: H.dayLabel(day), d2: H.dayLabel(addDays(day, 2))});
  check(`${region}.13_47_collapsed_fixed_08_20_past_dimmed`, H.states() === '08p,10p,12p,14f,16f,18f,20f', {states: H.states()});
  H.click('#wxHourlyToggle');
  check(`${region}.13_47_expanded_all_24_13_current`, H.states() === [...span(0, 12, 'p'), '13c', ...span(14, 23, 'f')].join(','), {states: H.states()});
  H.click('#wxHourlyToggle');
  check(`${region}.header_only_HHmm_기준_from_published_at`, /^\d\d:\d\d 기준$/.test(H.header() || '') &&
    H.header() === `${new Date(Date.parse(H.mm.published_at || H.mm.fetched_at) + H.mm.utc_offset_seconds * 1000).toISOString().slice(11, 16)} 기준`, {header: H.header()});
  const homeTime = H.els.get('homeWeatherValidTime');
  check(`${region}.home_banner_no_time`, homeTime.hidden === true && homeTime.textContent === '' && !/게시|기준|\d\d:\d\d/.test(H.els.get('homeWeatherCard').attrs['aria-label'] || ''), {aria: H.els.get('homeWeatherCard').attrs['aria-label']});
  // 14:00 boundary while open: the clock timer re-renders from memory
  H.setNow(`${day}T14:00`);
  check(`${region}.clock_timer_armed`, Boolean(H.clockTimer()) && H.clockTimer().ms <= 13 * 60e3 + 2000 && H.clockTimer().ms >= 12 * 60e3);
  H.fireClock();
  check(`${region}.14_00_marks_move_rows_kept`, H.states() === '08p,10p,12p,14c,16f,18f,20f', {states: H.states()});
  // user picks today explicitly, then midnight passes with the page open
  H.click('[data-wx-date]', day);
  H.setNow(`${addDays(day, 1)}T00:00`);
  H.fireClock();
  const d1 = addDays(day, 1);
  check(`${region}.midnight_new_today`, H.dayLabel(d1) === `오늘 (${md(d1)})` && H.dayLabel(day) === `어제 (${md(day)})` && H.dayLabel(addDays(day, 2)) === `내일 (${md(addDays(day, 2))})`,
    {today: H.dayLabel(d1), yesterday: H.dayLabel(day)});
  check(`${region}.midnight_selected_today_moves_to_new_day`, H.selected() === d1 && H.hourDate() === `${md(d1)} (${wd(d1)})`, {selected: H.selected(), hourDate: H.hourDate()});
  check(`${region}.midnight_new_day_rows_all_future`, H.states() === '08f,10f,12f,14f,16f,18f,20f', {states: H.states()});
  H.click('[data-wx-date]', day);
  check(`${region}.yesterday_rows_kept_all_dimmed`, H.hours() === '08,10,12,14,16,18,20' && H.states() === '08p,10p,12p,14p,16p,18p,20p', {states: H.states()});
  // another date stays a full day (unchanged behaviour)
  H.click('[data-wx-date]', addDays(day, 3));
  check(`${region}.future_day_08_20_normal_colours`, H.states() === '08f,10f,12f,14f,16f,18f,20f', {states: H.states()});
  H.click('[data-wx-date]', d1);
  check(`${region}.no_fetch_for_hour_and_midnight_redraws`, H.fetched.length === n0, {fetched: H.fetched.slice(n0)});
  // background -> foreground across an hour redraws at once (the existing 30 min refresh may re-read the files once)
  H.setNow(`${d1}T00:20`);
  await H.visibility('hidden');
  check(`${region}.hidden_clears_clock_timer`, !H.clockTimer());
  H.setNow(`${d1}T01:05`);
  await H.visibility('visible');
  H.click('#wxHourlyToggle');
  check(`${region}.foreground_after_hour_redraws`, H.states().startsWith('00p,01c,02f'), {states: H.states().slice(0, 30)});
  H.click('#wxHourlyToggle');
  // 23:30: no hour left today -> explicit message, nothing from today shown
  H.setNow(`${d1}T23:30`);
  H.fireClock();
  H.click('#wxHourlyToggle');
  check(`${region}.late_evening_all_rows_kept`, H.hours().split(',').length === 24 && H.states() === [...span(0, 22, 'p'), '23c'].join(',') && !/남은 시간대/.test(H.body()), {states: H.states().slice(-24)});
  H.click('#wxHourlyToggle');
  const fgFetches = H.fetched.slice(n0).filter(f => f.includes(`/${region}.json`)).length;
  check(`${region}.foreground_only_existing_30min_refresh`, fgFetches <= 2, {fetched: H.fetched.slice(n0)}); // one bm + one mm read at most
}

if (!process.env.PL_TZ_CHILD) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {env: {...process.env, TZ: 'America/Los_Angeles', PL_TZ_CHILD: '1'}, encoding: 'utf8'});
  const last = (child.stdout || '').trim().split('\n').pop();
  check('device_time_zone_independent (TZ=America/Los_Angeles)', child.status === 0 && /^(\d+)\/\1 passed$/.test(last), {child: last, err: (child.stderr || '').slice(0, 300)});
}
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` ${JSON.stringify(r)}`}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
