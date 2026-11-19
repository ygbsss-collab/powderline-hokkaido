// Powderline Weather Condition: home card + detail page (Stitch design "기상 현황").
// Data: ./data/weather/<region>.json, written by `node scripts/weather-collect.mjs all --publish`
// (Open-Meteo Best Match, summit / mid / base points). Only received API values are shown; anything missing is
// shown as "--" / "데이터 없음". No score is computed here (Powder / Slope Score: not implemented yet).
// app.js calls window.PowderlineWeather.setRegion(regionId, label) whenever the home region changes.
(() => {
  const POINTS = [['summit', '정상'], ['mid', '중간'], ['base', '하단']];
  const STALE_MS = 6 * 3600 * 1000;
  const cache = new Map(); // regionId -> Promise<data | null>
  // Forecast files are refreshed every 6 h by CI: re-read a region (and the source switch) after 30 min so an app that
  // stays open does not keep an old forecast. fetch() already uses cache: 'no-cache' (revalidates with the server).
  const RELOAD_MS = 30 * 60 * 1000;
  const cacheAt = new Map(); // regionId -> ms of the request
  let sourceConfigAt = 0;
  let livecamConfig = null;
  let livecamConfigRequest = null;
  const selectedCameraByRegion = new Map();
  let camRenderToken = 0;
  let regionId = '';
  let regionLabel = '';
  let data = null;
  let loadToken = 0;
  let detailPoint = 'summit';
  let selectedDate = null; // daily card picked in the detail page (null = today)
  let hourlyExpanded = false; // 시간대별 기상: false = 09/12/15/18, true = 00:00-23:00

  const $ = id => document.getElementById(id);
  const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const fmt = (value, digits) => {
    if (num(value) == null) return '--';
    const text = value.toFixed(digits);
    return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text; // no "-0" after rounding
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

  // Forecast source switch: ./data/weather-source.json {"primary": "multimodel" | "best_match"}.
  // multimodel -> ./data/weather-multimodel/<id>.json first; Best Match (./data/weather/<id>.json) whenever the
  // multi-model file is missing, fails its own validation, has another shape, or is older than the Best Match file
  // by more than 1 h. Missing / unreadable switch file -> Best Match (safe default).
  const getJson = url => fetch(new URL(url, document.baseURI), {cache: 'no-cache'})
    .then(response => (response.ok ? response.json() : null)).catch(() => null);
  let sourceConfig = null;
  const loadSourceConfig = () => { if (Date.now() - sourceConfigAt > RELOAD_MS) { sourceConfig = null; sourceConfigAt = Date.now(); } return (sourceConfig ||= getJson('./data/weather-source.json')
    .then(cfg => (cfg?.primary === 'multimodel' ? 'multimodel' : 'best_match'))); };
  const usable = (json, id) => Boolean(json && json.region_id === id && json.hourly && json.current);
  function load(id) {
    if (cache.has(id) && Date.now() - (cacheAt.get(id) || 0) > RELOAD_MS) cache.delete(id);
    if (!cache.has(id)) {
      cacheAt.set(id, Date.now());
      const key = encodeURIComponent(id);
      cache.set(id, loadSourceConfig().then(async primary => {
        const [bm, mm] = await Promise.all([getJson(`./data/weather/${key}.json`),
          primary === 'multimodel' ? getJson(`./data/weather-multimodel/${key}.json`) : null]);
        const bmOk = usable(bm, id);
        const mmOk = usable(mm, id) && mm.data_kind === 'powderline_multimodel_service' && mm.multimodel?.validation?.ok === true
          && JSON.stringify(Object.keys(mm.hourly.summit || {})) === JSON.stringify(Object.keys((bmOk ? bm : mm).hourly.summit || {}))
          && (!bmOk || Date.parse(mm.fetched_at) >= Date.parse(bm.fetched_at) - 3600e3);
        if (mmOk) return Object.assign(mm, {forecastSource: 'multimodel'});
        if (bmOk) return Object.assign(bm, {forecastSource: 'best_match', forecastFallback: primary === 'multimodel' ? (mm ? 'multimodel_rejected' : 'multimodel_unavailable') : null});
        return null;
      }).then(result => { if (!result) cache.delete(id); return result; })); // retry on the next selection
    }
    return cache.get(id);
  }

  // "2026-11-18T16:45:00+09:00" -> "11/18 16:45" (wall time of the data's own timezone, no conversion)
  const wallTime = iso => (typeof iso === 'string' && iso.length >= 16 ? `${iso.slice(5, 7)}/${iso.slice(8, 10)} ${iso.slice(11, 16)}` : '--');
  const currentOf = point => data?.current?.[point] || null;
  const series = (block, point, name) => data?.[block]?.[point]?.[name] || [];


  // ---- Shared weather classification (home card, daily cards, hourly rows use the SAME function) ----
  // WMO code -> base kind + Korean label. Kinds: clear | partly | cloudy | fog | rain | snow | thunder | missing.
  function wmoInfo(code) {
    const c = num(code);
    if (c == null) return {kind: 'missing', label: '--'};
    if (c === 0) return {kind: 'clear', label: '맑음'};
    if (c === 1) return {kind: 'partly', label: '대체로 맑음'};
    if (c === 2) return {kind: 'partly', label: '구름 조금'};
    if (c === 3) return {kind: 'cloudy', label: '흐림'};
    if (c === 45) return {kind: 'fog', label: '안개'};
    if (c === 48) return {kind: 'fog', label: '착빙성 안개'};
    if (c >= 51 && c <= 55) return {kind: 'rain', label: '이슬비'};
    if (c === 56 || c === 57) return {kind: 'rain', label: '어는 이슬비'};
    if (c === 61) return {kind: 'rain', label: '약한 비'};
    if (c === 63) return {kind: 'rain', label: '비'};
    if (c === 65) return {kind: 'rain', label: '강한 비'};
    if (c === 66 || c === 67) return {kind: 'rain', label: '어는 비'};
    if (c === 71) return {kind: 'snow', label: '약한 눈'};
    if (c === 73) return {kind: 'snow', label: '눈'};
    if (c === 75) return {kind: 'snow', label: '강한 눈'};
    if (c === 77) return {kind: 'snow', label: '싸락눈'};
    if (c >= 80 && c <= 82) return {kind: 'rain', label: '소나기'};
    if (c === 85 || c === 86) return {kind: 'snow', label: '눈'};
    if (c === 95) return {kind: 'thunder', label: '뇌우'};
    if (c === 96 || c === 99) return {kind: 'thunder', label: '우박 뇌우'};
    return {kind: 'cloudy', label: `코드 ${c}`}; // undocumented code: shown as-is, cloudy icon
  }
  const ICON_DAY = {clear: 'sunny', partly: 'partly_cloudy_day', cloudy: 'cloud', fog: 'foggy', rain: 'rainy', snow: 'weather_snowy', mixed: 'weather_mix', thunder: 'thunderstorm', missing: 'remove'};
  const ICON_NIGHT = {...ICON_DAY, clear: 'clear_night', partly: 'partly_cloudy_night'};
  const KIND_LABEL = {rain: '비', snow: '눈', mixed: '눈·비'};
  // Diagnostics: weather_code vs. precipitation components disagreements (model values are never changed).
  const diagnostics = new Map();
  function diag(key, entry) {
    if (diagnostics.has(key)) return;
    diagnostics.set(key, entry);
    console.debug('[PowderlineWeather] diagnostic', entry);
  }
  // Amounts below these (shown as 0.0) are traces: they never decide the phase on their own. Display only.
  const TRACE = {snow: 0.1, rain: 0.1};
  // Phase from amounts: snow >= 0.1 cm and/or rain >= 0.1 mm -> snow | rain | mixed; only traces -> 'trace';
  // both exactly 0 -> 'none'; a component missing -> null (cannot decide).
  function amountPhase(s, r) {
    if (s == null || r == null) return s >= TRACE.snow ? 'snow' : r >= TRACE.rain ? 'rain' : null;
    const sn = s >= TRACE.snow, rn = r >= TRACE.rain;
    return sn && rn ? 'mixed' : sn ? 'snow' : rn ? 'rain' : s > 0 || r > 0 ? 'trace' : 'none';
  }
  // One hour (or one day of totals): code + snowfall cm + rain mm from the SAME time and altitude.
  // Real amounts (>= trace) decide the phase, also against a dry code (the multi-model amounts and the code of the
  // top-weight model can disagree); every disagreement is logged. Traces / zero / missing amounts -> the code's kind.
  // Model values are never changed. isDay: null = unknown.
  function classifyWeather({code, snow, rain, isDay = null}, ctx = '') {
    const base = wmoInfo(code);
    const s = num(snow), r = num(rain);
    let kind = base.kind, label = base.label;
    // Internal only: 'mixed_amounts' = both snow and rain really fell; 'code_amount_phase' = weather_code and amounts disagree.
    let precipBasis = null;
    if (base.kind !== 'missing') {
      const phase = amountPhase(s, r);
      const precipCode = ['rain', 'snow', 'thunder'].includes(base.kind);
      const log = issue => diag(`${ctx}|${code}|${phase}`, {ctx, weather_code: code, snowfall_cm: s, rain_mm: r, issue});
      if (['snow', 'rain', 'mixed'].includes(phase)) {
        if (precipCode && base.kind !== 'thunder' && phase === 'mixed') {
          kind = 'mixed'; label = KIND_LABEL.mixed; precipBasis = 'mixed_amounts';
        } else if (precipCode && base.kind !== 'thunder' && phase !== base.kind) {
          // Code says snow but only rain is real (or the reverse): contradictory -> not decided either way.
          log(`code says ${base.kind}, amounts say ${phase} (shown as uncertain)`);
          kind = 'mixed'; label = '눈·비 혼합 가능'; precipBasis = 'code_amount_phase';
        } else if (!precipCode) {
          log(`non-precipitation code with ${phase} amounts (shown as ${phase})`);
          kind = phase; label = KIND_LABEL[phase];
        }
      } else if (precipCode && phase === 'none') log('precipitation code with 0 snowfall and 0 rain');
    }
    const icon = (isDay === false ? ICON_NIGHT : ICON_DAY)[kind];
    if (!precipBasis && kind === 'mixed') precipBasis = 'mixed_amounts';
    return {kind, label, icon, snow: s, rain: r, code: num(code), precipBasis};
  }
  // Home card background (4 groups, unchanged look): from the classified kind; mixed keeps its code group.
  function bgGroup(w) {
    if (w.kind === 'clear' || w.kind === 'partly') return w.code === 2 ? 'cloudy' : 'clear';
    if (w.kind === 'snow') return 'snow';
    if (w.kind === 'rain' || w.kind === 'thunder') return 'rain';
    if (w.kind === 'mixed') return wmoInfo(w.code).kind === 'snow' ? 'snow' : 'rain';
    return 'cloudy';
  }
  // Day/night from the hour's real shortwave radiation (W/m², mean of the preceding hour): > 0 day, 0 night, missing unknown.
  const isDayFrom = sw => (num(sw) == null ? null : sw > 0);

  // Home card uses ONE hourly forecast slot for every value: the hour in progress at the summit's current time
  // (valid time V; snowfall/rain = 1 h amounts for (V-1h, V]; code/temperature/wind = values at V).
  function homeSlot(point) {
    const now = Date.parse(currentOf(point)?.forecast_time || '');
    const times = data?.hourly?.time || [];
    if (!Number.isFinite(now) || !times.length) return null;
    const valid = Math.ceil(now / 3600e3) * 3600e3;
    const i = times.findIndex(t => Date.parse(t) === valid);
    if (i < 0) return null;
    const get = name => num(series('hourly', point, name)[i]);
    return {time: times[i], code: get('weather_code'), temp: get('temperature_2m'), wind: get('wind_speed_10m'), snow: get('snowfall'), rain: get('rain'), sw: get('shortwave_radiation')};
  }

  function renderCard() {
    const card = $('homeWeatherCard');
    if (!card) return;
    const s = data ? homeSlot('summit') : null;
    $('homeWeatherSummitTemp').textContent = `${fmt(s?.temp, 1)}°C`;
    $('homeWeatherWind').textContent = `${fmt(s?.wind, 1)}m/s`;
    const timeEl = $('homeWeatherValidTime');
    if (timeEl) timeEl.textContent = s ? wallTime(s.time) : '--';
    const stale = data && Date.now() - Date.parse(data.fetched_at) > STALE_MS;
    card.setAttribute('aria-label', `날씨 상세 보기 · ${!regionId ? '지역을 선택하세요'
      : data ? `${s ? wallTime(s.time) : '--'} 예보${stale ? ' · 이전 데이터' : ''}` : '이 지역의 날씨 데이터가 없습니다'}`);
    card.classList.toggle('empty', !data);
    // Shared classification of the same hourly slot (code + snowfall + rain + day/night). Missing -> cloudy bg + "--".
    const w = s ? classifyWeather({code: s.code, snow: s.snow, rain: s.rain, isDay: isDayFrom(s.sw)}, `home|summit|${s.time}`)
      : {kind: 'missing', icon: 'remove', label: '--', code: null};
    card.dataset.wxGroup = bgGroup(w);
    const text = w.kind === 'missing' ? '--'
      : w.kind === 'mixed' ? `눈 ${fmt(w.snow, 1)}cm · 비 ${fmt(w.rain, 1)}mm`
      : w.kind === 'snow' ? `눈 ${fmt(w.snow, 1)}cm`
      : w.kind === 'rain' ? `비 ${fmt(w.rain, 1)}mm`
      : w.label;
    const iconEl = $('homeWeatherIcon');
    if (iconEl) iconEl.textContent = w.icon;
    const stateEl = $('homeWeatherState');
    if (stateEl) stateEl.textContent = text;
  }

  async function setRegion(id, label) {
    // Same region already shown and recently loaded: keep it (re-read after RELOAD_MS).
    if ((id || '') === regionId && data && Date.now() - (cacheAt.get(regionId) || 0) <= RELOAD_MS) { regionLabel = label || regionId; return; }
    regionId = id || '';
    regionLabel = label || regionId;
    const token = ++loadToken;
    data = null;
    renderCard();
    if (isOpen()) renderHeader();
    if (!regionId) return;
    const result = await load(regionId);
    if (token !== loadToken) return; // a newer selection won
    data = result;
    selectedDate = null;
    hourlyExpanded = false;
    renderCard();
    if (isOpen()) renderDetail();
  }

  // ---- Detail page (Stitch design "기상 현황") ----
  // Only received values are shown. Missing -> "--" (never 0); a real 0 stays "0". No rating / score / snow-surface
  // judgement is shown on this page (removed). The altitude slider moves only
  // between the real data points (base / mid / summit); no value is interpolated between them.
  const HOUR_MS = 3600 * 1000;
  const HOURS_SUMMARY = [8, 10, 12, 14, 16, 18, 20]; // collapsed 시간대별 기상 (2 h steps); expanded = 0 … 23
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const DIR8_KO = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  // Hourly snow label by that hour's snowfall (cm): >0..<1 약한 눈, 1..<3 눈, >=3 강한 눈. Rain/mixed/thunder codes and
  // missing or 0 snowfall keep the plain WMO text. The icon and raw weather_code are untouched.
  function snowLabel(code, snowCm, text) {
    const s = num(snowCm);
    if (s == null || s <= 0) return text;
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return text;
    return s < 1 ? '약한 눈' : s < 3 ? '눈' : '강한 눈';
  }
  const dir8Ko = deg => (num(deg) == null ? '--' : DIR8_KO[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
  const meters = v => (num(v) == null ? '--' : `${Math.round(v).toLocaleString('en-US')}m`);
  // Snow amount in cm: missing "--", exactly 0 "0cm", otherwise "+x.xcm" ("+12cm" from 10 cm; "<0.1cm" for traces).
  function snowText(v) {
    if (num(v) == null) return '--';
    if (v === 0) return '0cm';
    if (v < 0.05) return '<0.1cm';
    const text = v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
    return `+${text}cm`;
  }
  const pointName = id => POINTS.find(([key]) => key === id)?.[1] || id;
  const pointInfo = id => data?.points?.find(item => item.point_type === id) || null;
  // Data points that have an elevation and current data, low -> high (the slider stops).
  const sliderPoints = () => ['base', 'mid', 'summit']
    .map(id => ({id, elevation: num(pointInfo(id)?.elevation)}))
    .filter(p => p.elevation != null && currentOf(p.id));

  // Sum of hourly values in (from, to] for one point; null unless every hour in the window has a value.
  function windowSum(point, name, fromMs, toMs) {
    const times = data?.hourly?.time || [];
    const values = series('hourly', point, name);
    let sum = 0, hours = 0;
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(times[i]);
      if (!(t > fromMs && t <= toMs)) continue;
      if (num(values[i]) == null) return null;
      sum += values[i];
      hours++;
    }
    return hours === Math.round((toMs - fromMs) / HOUR_MS) ? sum : null;
  }
  const nowOf = point => Date.parse(currentOf(point)?.forecast_time || '');
  // Past 24 h ends at the last full hour <= the current time; next 24 h starts there (no overlap, no gap).
  function snowPrevNext(point) {
    const now = nowOf(point);
    if (!Number.isFinite(now)) return [null, null];
    const anchor = Math.floor(now / HOUR_MS) * HOUR_MS;
    return [windowSum(point, 'snowfall', anchor - 24 * HOUR_MS, anchor), windowSum(point, 'snowfall', anchor, anchor + 24 * HOUR_MS)];
  }
  // Tooltip follows the thumb but stays inside the card at both ends.
  const tipLeft = pct => `clamp(36px, ${pct}%, calc(100% - 36px))`;
  // Fill width = selected part; background-size keeps the gradient relative to the full track, so the colour
  // at the thumb reflects the altitude (base sky blue -> summit deep blue).
  const fillStyle = pct => `width:${pct}%;background-size:${pct > 0 ? 10000 / pct : 100}% 100%`;

  // Header bar: selected region name (instead of "기상 현황") + data time at the right. The elevation is shown
  // only in the altitude card. The time is the forecast valid time of the data; collection time is in the tooltip.
  function renderHeader() {
    const title = $('weatherDetailTitle');
    if (!title) return;
    title.textContent = regionLabel || '--';
    let time = $('wxHeaderTime');
    if (!time) {
      time = document.createElement('span');
      time.id = 'wxHeaderTime';
      time.className = 'wx-header-time';
      title.insertAdjacentElement('afterend', time);
    }
    const cur = currentOf('summit') || currentOf(detailPoint);
    const stale = Boolean(data) && Date.now() - Date.parse(data.fetched_at) > STALE_MS;
    const fetched = data ? new Date(data.fetched_at) : null;
    time.textContent = cur?.forecast_time ? `${cur.forecast_time.slice(11, 16)} 기준${stale ? ' · 이전' : ''}` : '';
    const srcLabel = data?.forecastSource === 'multimodel' ? 'POWDERLINE 다중 모델 예보' : data ? `Best Match 예보${data.forecastFallback ? ' (다중 모델 대체)' : ''}` : '';
    time.title = fetched && !Number.isNaN(fetched.getTime()) ? `${srcLabel} · 수집 ${fetched.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
    time.classList.toggle('stale', stale);
  }

  function sliderHtml() {
    const pts = sliderPoints();
    if (!pts.length) {
      return `<section class="wx-px"><div class="wx-card wx-alt-card"><div class="wx-alt-head"><span class="wx-alt-title">고도 설정</span></div>
        <p class="wx-empty">고도 데이터 없음</p></div></section>`;
    }
    const min = pts[0].elevation, max = pts[pts.length - 1].elevation;
    const selected = pts.find(p => p.id === detailPoint) || pts[pts.length - 1];
    detailPoint = selected.id;
    const ticks = [];
    for (let m = Math.ceil(min / 100) * 100; m <= max; m += 100) ticks.push(m);
    const pos = v => (max > min ? ((v - min) / (max - min)) * 100 : 0);
    const lowName = pointName(pts[0].id) === '하단' ? '베이스' : pointName(pts[0].id);
    return `<section class="wx-px"><div class="wx-card wx-alt-card">
      <div class="wx-alt-head"><span class="wx-alt-title">고도 설정</span>
        <div class="wx-alt-selected"><span class="wx-alt-label">선택 고도</span><div class="wx-alt-value"><span class="wx-live-dot wx-dot-accent"></span><span id="wxAltHeaderVal">${meters(selected.elevation)}</span></div></div></div>
      <div class="wx-slider"><div class="wx-slider-row">
        <div class="wx-slider-tip" id="wxSliderTip" style="left:${tipLeft(pos(selected.elevation))}"><div class="wx-slider-tip-pill"><span class="material-symbols-outlined" aria-hidden="true">navigation</span><span id="wxSliderTipText">${meters(selected.elevation)}</span></div><div class="wx-slider-tip-arrow"></div></div>
        <div class="wx-slider-track"><div class="wx-slider-fill" id="wxSliderFill" style="${fillStyle(pos(selected.elevation))}"></div></div>
        <div class="wx-slider-ticks">${ticks.map(m => `<span style="left:${pos(m)}%"></span>`).join('')}${pts.map(p => `<span class="major" style="left:${pos(p.elevation)}%"></span>`).join('')}</div>
        <input class="altitude-range-slider" id="wxAltRange" type="range" aria-label="고도 조절 드래그 바" min="${Math.round(min)}" max="${Math.round(max)}" step="1" value="${Math.round(selected.elevation)}"${pts.length < 2 ? ' disabled' : ''}>
      </div>
      <div class="wx-slider-ends"><span><span class="wx-end-dot"></span><span>${meters(min)} (${lowName})</span></span>
        <span><span>${meters(max)} (${pointName(pts[pts.length - 1].id)})</span><span class="wx-end-dot"></span></span></div></div>
    </div></section>`;
  }

  function conditionHtml() {
    const c = currentOf(detailPoint);
    const [prev, next] = snowPrevNext(detailPoint);
    return `<section class="wx-px"><div class="wx-card wx-cond-card">
      <div class="wx-cond-head"><div class="wx-cond-title"><span class="material-symbols-outlined" aria-hidden="true">ac_unit</span><span>WEATHER</span></div></div>
      <div class="wx-cond-grid">
        <div><span class="wx-cell-label">${pointName(detailPoint)} 기온</span><div class="wx-cell-value">${fmt(c?.temperature_2m, 1)}°C</div></div>
        <div><span class="wx-cell-label">풍속 (풍향)</span><div class="wx-cell-value wx-wind">${fmt(c?.wind_speed_10m, 1)}m/s <small class="wx-wind-dir">${dir8Ko(c?.wind_direction_10m)}</small></div></div>
        <div><span class="wx-cell-label">이전 24H</span><div class="wx-cell-value wx-snow">${snowText(prev)}</div></div>
        <div><span class="wx-cell-label wx-next">향후 24H</span><div class="wx-cell-value wx-snow">${snowText(next)}</div></div>
      </div></div></section>`;
  }


  const PAST_DAYS_SHOWN = 2;
  const FORECAST_DAYS_SHOWN = 16; // today … +15 (unchanged)
  const localToday = () => (currentOf(detailPoint)?.forecast_time || '').slice(0, 10); // region local date
  // Calendar arithmetic on the region-local date string (no device time zone involved).
  const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 24 * HOUR_MS).toISOString().slice(0, 10);
  const pastDates = today => (today ? Array.from({length: PAST_DAYS_SHOWN}, (_, k) => addDays(today, k - PAST_DAYS_SHOWN)) : []);
  const forecastDates = today => (data?.daily?.time || []).filter(d => d >= today).slice(0, FORECAST_DAYS_SHOWN);

  // The 24 hourly slots of a local date (00:00 … 23:00) at the selected altitude. Sums / extremes are null unless all
  // 24 hours have a value (a partial day is never shown as a full day).
  function dayHours(date) {
    const times = data?.hourly?.time || [];
    const index = new Map(times.map((t, i) => [t.slice(0, 16), i]));
    const get = name => series('hourly', detailPoint, name);
    const [snow, rain, temp, code] = ['snowfall', 'rain', 'temperature_2m', 'weather_code'].map(get);
    const idx = Array.from({length: 24}, (_, h) => index.get(`${date}T${String(h).padStart(2, '0')}:00`));
    const values = arr => (idx.every(i => i != null && num(arr[i]) != null) ? idx.map(i => arr[i]) : null);
    const s = values(snow), r = values(rain), t = values(temp);
    const sum = a => (a ? Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100 : null);
    return {snow: sum(s), rain: sum(r), tmax: t ? Math.max(...t) : null, tmin: t ? Math.min(...t) : null,
      codes: idx.map(i => (i == null ? null : num(code[i])))};
  }

  // Representative weather of a whole day: phase from the day's snowfall / rain totals (not one hour's icon);
  // without precipitation, the most frequent non-precipitation kind of its 24 hourly codes (tie -> cloudy).
  function classifyDay(date, amounts, hours) {
    const {snow, rain} = amounts;
    if (num(snow) == null && num(rain) == null) return {kind: 'missing', icon: 'remove', label: '--', snow: null, rain: null};
    const phase = amountPhase(num(snow), num(rain)); // same trace rule as the hourly rows
    if (['snow', 'rain', 'mixed'].includes(phase)) {
      return {kind: phase, icon: ICON_DAY[phase], label: KIND_LABEL[phase], snow: num(snow), rain: num(rain)};
    }
    const counts = {};
    for (const c of hours.codes) { const k = wmoInfo(c).kind; if (['clear', 'partly', 'cloudy', 'fog'].includes(k)) counts[k] = (counts[k] || 0) + 1; }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const kind = !top.length || (top[1] && top[1][1] === top[0][1]) ? 'cloudy' : top[0][0];
    if (hours.codes.some(c => ['rain', 'snow', 'thunder'].includes(wmoInfo(c).kind))) diag(`day|${detailPoint}|${date}|trace`, {ctx: `day|${detailPoint}|${date}`, issue: 'precipitation codes in a day with 0 snowfall and 0 rain'});
    return {kind, icon: ICON_DAY[kind], label: wmoInfo(kind === 'clear' ? 0 : kind === 'partly' ? 2 : kind === 'fog' ? 45 : 3).label, snow: num(snow), rain: num(rain)};
  }

  function dailyHtml() {
    const today = localToday();
    const get = name => series('daily', detailPoint, name);
    const [tmax, tmin, snowSum, rainSum] = ['temperature_2m_max', 'temperature_2m_min', 'snowfall_sum', 'rain_sum'].map(get);
    const dailyIndex = new Map((data?.daily?.time || []).map((d, i) => [d, i]));
    const sel = activeDate();
    const card = (date, v, past) => {
      const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
      const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * HOUR_MS));
      const label = offset === 0 ? `오늘 (${md})` : offset === 1 ? `내일 (${md})` : offset === -1 ? `어제 (${md})` : offset === -2 ? `2일 전 (${md})`
        : `${md} (${WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]})`;
      const w = v.weather;
      // Snow in cm, rain in mm, both when mixed; a dry day keeps the snow line ("0cm"); missing -> "--".
      const amount = w.kind === 'rain' ? `${fmt(w.rain, 1)}mm`
        : w.kind === 'mixed' ? `${snowText(w.snow)}<small class="wx-day-rain">${fmt(w.rain, 1)}mm</small>`
        : snowText(w.snow);
      const zero = w.kind !== 'rain' && w.kind !== 'mixed' && w.snow === 0;
      return `<button type="button" class="wx-day${date === sel ? ' today' : ''}${past ? ' past' : ''}" data-wx-date="${date}" aria-pressed="${date === sel}"${past ? ' title="과거 모델 추정값 (시간별 데이터 합산)"' : ''}><div class="wx-day-head"><span>${label}</span></div>
          <span class="material-symbols-outlined wx-day-icon" aria-hidden="true">${w.icon}</span>
          <span class="wx-day-snow${zero ? ' zero' : ''}">${amount}</span>
          <span class="wx-day-temp">${fmt(v.tmax, 0)}° / ${fmt(v.tmin, 0)}°</span>${past ? '<span class="wx-day-est">과거 모델 추정</span>' : ''}</button>`;
    };
    const dayValue = (date, past) => {
      const h = dayHours(date);
      if (past) return {weather: classifyDay(date, h, h), tmax: h.tmax, tmin: h.tmin};
      const i = dailyIndex.get(date);
      // Forecast days show the original daily totals; the hourly sums are only a cross-check (never overwrite).
      const amounts = {snow: num(snowSum[i]) ?? h.snow, rain: num(rainSum[i]) ?? h.rain};
      for (const [name, d, hs] of [['snowfall', snowSum[i], h.snow], ['rain', rainSum[i], h.rain]]) {
        if (num(d) != null && hs != null && Math.abs(d - hs) > 0.05) diag(`daysum|${detailPoint}|${date}|${name}`, {ctx: `day|${detailPoint}|${date}`, issue: `daily ${name}_sum ${d} != hourly sum ${hs}`});
      }
      return {weather: classifyDay(date, amounts, h), tmax: tmax[i], tmin: tmin[i]};
    };
    const cards = today ? [
      ...pastDates(today).map(date => card(date, dayValue(date, true), true)),
      ...forecastDates(today).map(date => card(date, dayValue(date, false), false))
    ] : [];
    return `<section class="wx-section"><div class="wx-section-head wx-px"><div><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span><span>일별 예보</span></div></div>
      ${cards.length ? `<div class="wx-days">${cards.join('')}</div>` : '<p class="wx-empty wx-px">데이터 없음</p>'}</section>`;
  }

  // Selected daily date if it is one of the shown days (2 past days, today … +15), else today.
  function activeDate() {
    const today = localToday();
    const dates = [...pastDates(today), ...forecastDates(today)];
    return selectedDate && dates.includes(selectedDate) ? selectedDate : today;
  }

  // One row per wanted hour of the selected date, looked up by its timestamp (no duplicates; a missing hour -> "--").
  // Each Open-Meteo hourly value covers the preceding hour (snowfall at 09:00 = 08:00-09:00).
  function hourlyHtml() {
    const date = activeDate();
    const times = data?.hourly?.time || [];
    const index = new Map(times.map((t, i) => [t.slice(0, 16), i]));
    const now = nowOf(detailPoint);
    const get = name => series('hourly', detailPoint, name);
    const [temp, snow, rain, wind, dir, code, sw] = ['temperature_2m', 'snowfall', 'rain', 'wind_speed_10m', 'wind_direction_10m', 'weather_code', 'shortwave_radiation'].map(get);
    const hours = hourlyExpanded ? Array.from({length: 24}, (_, h) => h) : HOURS_SUMMARY;
    const rows = date ? hours.map(h => {
      const hh = String(h).padStart(2, '0');
      const i = index.get(`${date}T${hh}:00`);
      const has = i != null;
      // Same shared classification as the home card and daily cards; icon and text come from one result.
      const w = has ? classifyWeather({code: code[i], snow: snow[i], rain: rain[i], isDay: isDayFrom(sw[i])}, `hour|${detailPoint}|${times[i]}`)
        : {kind: 'missing', icon: 'remove', label: '--', snow: null, rain: null, code: null};
      const icon = w.icon;
      const text = w.kind === 'snow' ? snowLabel(w.code, w.snow, w.label) : w.label;
      // Snow cm, rain mm, both when mixed; a real 0 shows no amount, a missing amount "(--)".
      const amt = (v, unit) => (v == null ? '--' : unit === 'cm' ? snowText(v) : `${fmt(v, 1)}mm`);
      const amount = !has || w.kind === 'missing' ? ''
        : w.kind === 'mixed' ? ` (${amt(w.snow, 'cm')} · ${amt(w.rain, 'mm')})`
        : w.kind === 'snow' ? (w.snow == null ? ' (--)' : w.snow > 0 ? ` (${amt(w.snow, 'cm')})` : '')
        : w.kind === 'rain' || w.kind === 'thunder' ? (w.rain == null ? ' (--)' : w.rain > 0 ? ` (${amt(w.rain, 'mm')})` : '')
        : '';
      const past = has && Number.isFinite(now) && Date.parse(times[i]) <= now; // model estimate, not a forecast
      return `<div class="wx-hour${past ? ' past' : ''}"${past ? ' title="지난 시각 (모델 추정값)"' : ''}><div class="wx-hour-left"><span class="wx-hour-time">${hh}:00</span>
        <div class="wx-hour-cond"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span>${text}${amount}</span></div></div>
        <div class="wx-hour-right"><span class="wx-hour-temp">${has ? fmt(temp[i], 0) : '--'}°C</span><span class="wx-hour-wind">${has ? dir8Ko(dir[i]) : '--'} ${has ? fmt(wind[i], 0) : '--'}m/s</span></div></div>`;
    }) : [];
    const md = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} (${WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]})` : '--';
    return `<section class="wx-section wx-px" id="wxHourlySection"><div class="wx-section-head"><div><span class="material-symbols-outlined wx-icon-accent" aria-hidden="true">schedule</span><span>시간대별 기상</span></div>
      <div class="wx-hour-tools"><span>${md}</span><button type="button" class="wx-more-btn" id="wxHourlyToggle" aria-expanded="${hourlyExpanded}">${hourlyExpanded ? '접기' : '상세보기'}</button></div></div>
      ${rows.length ? `<div class="wx-hours${hourlyExpanded ? ' wx-hours-scroll' : ''}" id="wxHoursList"${hourlyExpanded ? ' tabindex="0" aria-label="시간대별 기상 24시간 목록"' : ''}>${rows.join('')}</div>` : '<p class="wx-empty">데이터 없음</p>'}</section>`;
  }

  // Fixed viewport layout (CSS): the page body is a flex column of the viewport height; the hourly section takes the
  // remaining height and only its list scrolls (24 h mode). The body class only marks the mode for CSS.
  function markHourlyMode() {
    $('weatherDetailBody')?.classList.toggle('wx-hours-expanded', hourlyExpanded);
  }

  // LIVE CAM entry card (opens the in-app camera screen).
  // Icon + title centred; the chevron stays at the right edge (grid: spacer | centre | chevron).
  function liveCamHtml() {
    return `<div class="wx-px wx-cam-entry-wrap"><button type="button" class="wx-card wx-cam-entry" id="wxLiveCam" data-region="${escapeHtml(regionId)}" aria-label="LIVE CAM 열기">
      <span class="wx-cam-entry-spacer" aria-hidden="true"></span>
      <span class="wx-cam-entry-center"><span class="material-symbols-outlined wx-cam-entry-icon" aria-hidden="true">videocam</span><span class="wx-cam-entry-title">LIVE CAM</span></span>
      <span class="material-symbols-outlined wx-cam-entry-chevron" aria-hidden="true">chevron_right</span>
    </button></div>`;
  }

  // ---- LIVE CAM screen: an in-app view over the Weather page (one extra history entry {plWeather, plWeatherCam}) ----
  // The Weather page stays mounted underneath, so date / altitude / 상세보기 state are kept when coming back.
  const CAM_STATE = {plWeather: true, plWeatherCam: true};
  const camView = () => $('wxCamView');
  const isCamOpen = () => Boolean(camView() && !camView().hidden);
  const safeHttpsUrl = value => {
    try {
      const url = new URL(String(value || ''), document.baseURI);
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };
  async function loadLivecamConfig() {
    if (livecamConfig) return livecamConfig;
    livecamConfigRequest ||= getJson('./data/livecams.json');
    const cfg = await livecamConfigRequest;
    livecamConfigRequest = null;
    if (cfg?.schemaVersion === 1 && cfg.regions && typeof cfg.regions === 'object') livecamConfig = cfg;
    return livecamConfig;
  }
  const livecamLoadingHtml = () => `<div class="wx-cam-loading" role="status"><span class="material-symbols-outlined" aria-hidden="true">videocam</span><strong>라이브캠 불러오는 중</strong></div>`;
  // ---- HLS (Korean resorts): hls.js where MSE exists, native HLS otherwise (iOS). One stream at a time. ----
  const HLS_SCRIPT = './vendor/hls.light.min.js'; // hls.js 1.5.20 light (Apache-2.0), loaded only when a HLS camera opens
  const HLS_FIRST_FRAME_MS = 20000;
  let hlsLibRequest = null;
  let camPlayer = null; // {video, hls, camera, timer, autoRetried}
  const hlsUrl = value => {
    try {
      const url = new URL(String(value || ''));
      return /^https?:$/.test(url.protocol) && /\.m3u8$/i.test(url.pathname) ? url.href : '';
    } catch { return ''; }
  };
  // An http:// stream on an https:// page (GitHub Pages, Capacitor androidScheme https) is mixed content and is blocked
  // by the WebView/browser. This is not worked around: the camera shows a notice and the official page link instead.
  const mixedContentBlocked = camera => location.protocol === 'https:' && new URL(camera.embedUrl).protocol === 'http:';
  function enabledCameras(entry) {
    return Array.isArray(entry?.cameras) ? entry.cameras.filter(camera => camera?.enabled === true
      && (camera.type === 'hls' ? hlsUrl(camera.embedUrl)
        : ['youtube', 'iframe', 'image'].includes(camera.type) && safeHttpsUrl(camera.embedUrl))) : [];
  }
  function loadHlsLib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    hlsLibRequest ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HLS_SCRIPT;
      script.async = true;
      script.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js missing')));
      script.onerror = () => { hlsLibRequest = null; script.remove(); reject(new Error('hls.js load failed')); };
      document.head.appendChild(script);
    });
    return hlsLibRequest;
  }
  // Stops the previous stream completely (network + decoder) before another camera / screen takes over.
  function destroyCamPlayer() {
    const p = camPlayer;
    camPlayer = null;
    if (!p) return;
    clearTimeout(p.timer);
    try { p.hls?.destroy(); } catch { /* already gone */ }
    try { p.video.pause(); p.video.removeAttribute('src'); p.video.load(); } catch { /* detached */ }
  }
  // state: loading | playing | paused (autoplay blocked -> play button) | error
  function setCamState(state, title, text, canRetry = true) {
    const loading = $('wxCamLoading'), play = $('wxCamPlay'), error = $('wxCamMediaError');
    if (loading) loading.hidden = state !== 'loading';
    if (play) play.hidden = state !== 'paused';
    if (!error) return;
    error.hidden = state !== 'error';
    if (state !== 'error') return;
    $('wxCamErrorTitle').textContent = title || '영상을 재생할 수 없습니다.';
    $('wxCamErrorText').textContent = text || '카메라가 오프라인이거나 일시 중단되었을 수 있습니다. 원본 페이지에서 확인해 주세요.';
    const retry = $('wxCamRetry');
    if (retry) retry.hidden = !canRetry;
  }
  function tryPlay(p) {
    if (camPlayer !== p) return;
    p.video.muted = true; // muted autoplay is the only kind browsers allow without a tap
    const result = p.video.play();
    result?.catch?.(error => {
      if (camPlayer !== p || error?.name !== 'NotAllowedError') return; // other rejections: the hls/timeout path reports them
      clearTimeout(p.timer); // autoplay blocked: waiting for the user, not for the network
      setCamState('paused');
    });
  }
  async function startHls(camera, autoRetried = false) {
    const video = $('wxCamVideo');
    if (!video) return;
    destroyCamPlayer();
    if (mixedContentBlocked(camera)) {
      setCamState('error', '앱 내 재생이 차단된 카메라입니다.', '제공처가 HTTP(비보안) 스트림만 제공하여 HTTPS 화면에서는 보안 정책상 재생할 수 없습니다. 원본 페이지에서 확인해 주세요.', false);
      return;
    }
    const p = camPlayer = {video, hls: null, camera, timer: 0, autoRetried};
    const token = camRenderToken;
    setCamState('loading');
    const fail = text => {
      if (camPlayer !== p) return;
      destroyCamPlayer();
      if (!p.autoRetried && !text) { setTimeout(() => { if (!camPlayer && token === camRenderToken && $('wxCamVideo') === video) startHls(camera, true); }, 2000); setCamState('loading'); return; }
      setCamState('error', null, text);
    };
    p.timer = setTimeout(() => fail(), HLS_FIRST_FRAME_MS);
    video.onplaying = () => { if (camPlayer === p) { clearTimeout(p.timer); setCamState('playing'); } };
    let Hls = null;
    try { Hls = await loadHlsLib(); } catch { /* fall back to native HLS below */ }
    if (camPlayer !== p || token !== camRenderToken) return;
    if (Hls?.isSupported?.()) {
      const hls = p.hls = new Hls({enableWorker: true, lowLatencyMode: false, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3});
      hls.on(Hls.Events.ERROR, (_event, info) => {
        if (!info?.fatal || camPlayer !== p) return;
        if (info.type === Hls.ErrorTypes.MEDIA_ERROR && !p.mediaRecovered) { p.mediaRecovered = true; hls.recoverMediaError(); return; }
        fail();
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlay(p));
      hls.loadSource(camera.embedUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.onerror = () => fail();
      video.src = camera.embedUrl;
      tryPlay(p);
    } else fail('이 브라우저는 HLS 영상 재생을 지원하지 않습니다. 원본 페이지에서 확인해 주세요.');
  }
  function hlsPlayerHtml(camera) {
    return `<video id="wxCamVideo" playsinline muted controls preload="none" aria-label="${escapeHtml(camera.name)} 라이브캠"></video>
      <div class="wx-cam-loading wx-cam-overlay" id="wxCamLoading" role="status"><span class="material-symbols-outlined" aria-hidden="true">videocam</span><strong>영상 연결 중</strong></div>
      <button type="button" class="wx-cam-play" id="wxCamPlay" hidden aria-label="재생"><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span></button>`;
  }
  function livecamMediaHtml(camera) {
    if (camera?.type === 'hls') return hlsPlayerHtml(camera);
    const embedUrl = safeHttpsUrl(camera?.embedUrl);
    if (!embedUrl) return '';
    if (camera.type === 'image') {
      const imageUrl = new URL(embedUrl);
      imageUrl.searchParams.set('powderline_view', String(Date.now()));
      return `<img src="${escapeHtml(imageUrl.href)}" alt="${escapeHtml(camera.name)} 라이브캠" referrerpolicy="no-referrer-when-downgrade">`;
    }
    const allow = camera.type === 'youtube' ? 'encrypted-media; picture-in-picture; fullscreen' : 'fullscreen';
    return `<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(camera.name)} 라이브캠" loading="eager" allow="${allow}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  function renderLivecamEntry(entry) {
    const body = $('wxCamViewBody');
    if (!body) return;
    destroyCamPlayer(); // camera switch: the previous stream ends before the new markup goes in
    const cameras = enabledCameras(entry);
    const externalUrl = entry?.external?.enabled === true ? safeHttpsUrl(entry.external.url) : '';
    let selectedId = selectedCameraByRegion.get(regionId);
    let selected = cameras.find(camera => camera.cameraId === selectedId) || cameras[0] || null;
    if (selected) {
      selectedId = selected.cameraId;
      selectedCameraByRegion.set(regionId, selectedId);
    }
    const openLink = externalUrl ? `<a class="wx-cam-open" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>원본 웹캠 열기</a>` : '';
    const selector = cameras.length > 1 ? `<div class="wx-cam-list" role="list" aria-label="카메라 선택">${cameras.map(camera => `<button type="button" role="listitem" class="wx-cam-choice${camera.cameraId === selectedId ? ' is-active' : ''}" data-camera-id="${escapeHtml(camera.cameraId)}" aria-pressed="${camera.cameraId === selectedId}">${escapeHtml(camera.name)}</button>`).join('')}</div>` : '';
    if (!selected) {
      body.innerHTML = `<div class="wx-cam-content wx-cam-empty"><div class="wx-cam-message"><span class="material-symbols-outlined" aria-hidden="true">videocam_off</span><strong>등록된 라이브캠이 없습니다.</strong><span>제공처의 내부 재생 허용을 확인하지 못한 경우 원본 페이지만 연결합니다.</span></div>${openLink}</div>`;
      return;
    }
    if (selected.type === 'hls') {
      const sourceUrl = safeHttpsUrl(selected.url) || externalUrl;
      const sourceLink = sourceUrl ? `<a class="wx-cam-open" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>원본 웹캠 열기</a>` : '';
      body.innerHTML = `<div class="wx-cam-content"><div class="wx-cam-player" id="wxCamPlayer">${hlsPlayerHtml(selected)}<div class="wx-cam-media-error" id="wxCamMediaError" hidden><span class="material-symbols-outlined" aria-hidden="true">error</span><strong id="wxCamErrorTitle">영상을 재생할 수 없습니다.</strong><span class="wx-cam-error-text" id="wxCamErrorText"></span><button type="button" class="wx-cam-retry" id="wxCamRetry"><span class="material-symbols-outlined" aria-hidden="true">refresh</span>다시 시도</button></div></div><h2 class="wx-cam-name">${escapeHtml(selected.name)}</h2><p class="wx-cam-help">음소거 상태로 재생합니다. 재생되지 않으면 재생 버튼이나 원본 페이지를 이용해 주세요.</p>${sourceLink}${selector}</div>`;
      $('wxCamPlay')?.addEventListener('click', () => {
        const p = camPlayer;
        if (!p) return;
        setCamState('loading');
        p.video.play()?.catch?.(() => { if (camPlayer === p) setCamState('error'); });
      });
      $('wxCamRetry')?.addEventListener('click', () => startHls(selected, true));
      startHls(selected);
      return;
    }
    body.innerHTML = `<div class="wx-cam-content"><div class="wx-cam-player" id="wxCamPlayer">${livecamMediaHtml(selected)}<div class="wx-cam-media-error" id="wxCamMediaError" hidden><span class="material-symbols-outlined" aria-hidden="true">error</span><strong>영상을 재생할 수 없습니다.</strong><span>원본 웹캠 페이지에서 확인해 주세요.</span></div></div><h2 class="wx-cam-name">${escapeHtml(selected.name)}</h2><p class="wx-cam-help">자동 재생은 사용하지 않습니다. 재생되지 않으면 원본 페이지를 이용해 주세요.</p>${openLink}${selector}</div>`;
    const media = body.querySelector?.('.wx-cam-player > iframe, .wx-cam-player > img');
    media?.addEventListener('error', () => {
      media.hidden = true;
      const error = $('wxCamMediaError');
      if (error) error.hidden = false;
    });
  }
  function renderLivecamUnavailable() {
    const body = $('wxCamViewBody');
    if (body) body.innerHTML = `<div class="wx-cam-content wx-cam-empty"><div class="wx-cam-message"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span><strong>라이브캠 정보를 불러오지 못했습니다.</strong><span>잠시 후 다시 시도해 주세요.</span></div></div>`;
  }
  function ensureCamView() {
    if (camView()) return camView();
    const v = document.createElement('div');
    v.id = 'wxCamView';
    v.className = 'wx-cam-view';
    v.hidden = true;
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-labelledby', 'wxCamViewTitle');
    v.innerHTML = `<header class="weather-detail-header"><div class="weather-detail-bar">
        <button id="wxCamBackBtn" class="weather-detail-back" type="button" aria-label="뒤로가기"><span class="material-symbols-outlined" aria-hidden="true">arrow_back_ios_new</span></button>
        <h1 id="wxCamViewTitle"></h1><span class="wx-cam-view-region" id="wxCamViewRegion">LIVE CAM</span></div></header>
      <div class="wx-cam-view-body" id="wxCamViewBody">${livecamLoadingHtml()}</div>`;
    page()?.querySelector('.weather-detail-inner')?.appendChild(v);
    v.querySelector('#wxCamBackBtn').addEventListener('click', closeCam);
    v.addEventListener('click', event => {
      const button = event.target.closest?.('[data-camera-id]');
      if (!button || !isCamOpen()) return;
      selectedCameraByRegion.set(regionId, button.dataset.cameraId);
      const entry = livecamConfig?.regions?.[regionId];
      if (entry?.regionId === regionId) renderLivecamEntry(entry);
    });
    return v;
  }
  async function showCam() {
    const v = ensureCamView();
    if (!v.hidden) return;
    const token = ++camRenderToken;
    $('wxCamViewTitle').textContent = regionLabel || '스키장';
    $('wxCamViewRegion').textContent = 'LIVE CAM';
    $('wxCamViewBody').innerHTML = livecamLoadingHtml();
    page()?.classList.add('wx-cam-active'); // hides the altitude bar (its slider/tip stack above this view)
    v.hidden = false;
    $('wxCamBackBtn')?.focus({preventScroll: true});
    const cfg = await loadLivecamConfig();
    if (token !== camRenderToken || !isCamOpen()) return;
    const entry = cfg?.regions?.[regionId];
    if (entry?.regionId === regionId) {
      $('wxCamViewTitle').textContent = entry.resortName || regionLabel || '스키장';
      renderLivecamEntry(entry);
    } else if (cfg) renderLivecamEntry(null); // future region with no mapping: never borrow another resort's camera
    else renderLivecamUnavailable();
  }
  function hideCam() {
    const v = camView();
    if (!v || v.hidden) return;
    camRenderToken++;
    destroyCamPlayer();
    const body = $('wxCamViewBody');
    if (body) body.innerHTML = '';
    v.hidden = true;
    page()?.classList.remove('wx-cam-active'); // altitude bar back on the Weather page
    $('wxLiveCam')?.focus({preventScroll: true});
  }
  function openCam() {
    if (!isOpen() || isCamOpen() || pendingPops > 0) return;
    try { history.pushState(CAM_STATE, '', '#weather-cam'); } catch { /* no history: the view still works */ }
    showCam();
  }
  function closeCam() {
    if (!isCamOpen()) return;
    hideCam();
    if (history.state?.plWeatherCam) {
      pendingPops++;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => { pendingPops = 0; }, 1500);
      try { history.back(); } catch { pendingPops = 0; }
    }
  }

  // Sections that depend on the selected altitude point (re-rendered while dragging; the slider itself is kept).
  const pointSectionsHtml = () => `${conditionHtml()}${dailyHtml()}${hourlyHtml()}`;

  function renderDetail() {
    const body = $('weatherDetailBody');
    if (!body) return;
    renderHeader();
    if (!data) {
      body.innerHTML = `<p class="wx-empty wx-px">${regionId ? '이 지역의 날씨 데이터가 없습니다.' : '지역을 선택하세요.'}</p>
        <footer class="wx-footer">POWDERLINE&nbsp; | YK LAB - GYOHYEOK YUN</footer>`;
      return;
    }
    body.innerHTML = `${sliderHtml()}<div id="wxPointSections" class="wx-stack">${pointSectionsHtml()}</div>
      ${liveCamHtml()}
      <footer class="wx-footer">POWDERLINE&nbsp; | YK LAB - GYOHYEOK YUN</footer>`;
    scrollDaysToSelected();
    markHourlyMode();
  }

  // Past cards come first: open the carousel with the selected (default today) card at its left edge.
  function scrollDaysToSelected() {
    const strip = document.querySelector('#weatherDetailBody .wx-days');
    const selected = strip?.querySelector('.wx-day[aria-pressed="true"]');
    if (strip && selected) strip.scrollLeft = Math.max(0, selected.offsetLeft - strip.offsetLeft - 16);
  }
  // Re-render the point-dependent sections and keep the carousel where it was. The hourly list is new markup, so it
  // starts at its top (00:00 in 24 h mode) after a date or altitude change.
  function rerenderPointSections() {
    const strip = document.querySelector('#weatherDetailBody .wx-days');
    const scroll = strip ? strip.scrollLeft : 0;
    $('wxPointSections').innerHTML = pointSectionsHtml();
    const next = document.querySelector('#weatherDetailBody .wx-days');
    if (next) next.scrollLeft = scroll;
    const list = $('wxHoursList');
    if (list) list.scrollTop = 0;
    markHourlyMode();
  }

  // Slider: snaps to the nearest real data point; updates the readout and the point-dependent sections.
  function onAltitudeInput(input) {
    const pts = sliderPoints();
    if (!pts.length) return;
    const value = Number(input.value);
    const nearest = pts.reduce((a, b) => (Math.abs(b.elevation - value) < Math.abs(a.elevation - value) ? b : a));
    input.value = String(Math.round(nearest.elevation));
    const min = pts[0].elevation, max = pts[pts.length - 1].elevation;
    const pct = max > min ? ((nearest.elevation - min) / (max - min)) * 100 : 0;
    $('wxAltHeaderVal').textContent = meters(nearest.elevation);
    $('wxSliderTipText').textContent = meters(nearest.elevation);
    $('wxSliderTip').style.left = tipLeft(pct);
    $('wxSliderFill').style.cssText = fillStyle(pct);
    if (nearest.id === detailPoint) return;
    detailPoint = nearest.id; // selected date and hourly state stay; values switch to this altitude
    rerenderPointSections();
  }

  // ---- Detail page + history ----
  // The page owns exactly one history entry ({plWeather}, URL #weather) while it is open:
  //   open  -> pushState        (browser back / back gesture / Android back all end up as one pop of that entry)
  //   close -> hide, then history.back() (only if our entry is on top); the resulting popstate is swallowed
  // popstate is handled here first (this script loads before app.js); app.js's back guard skips events flagged
  // `plWeatherHandled`, so the guard entry is not re-pushed and the history does not grow per open/close.
  let pendingPops = 0; // history.back() calls issued by closeDetail() whose popstate has not arrived yet
  let pendingTimer = null;
  const HIST_STATE = {plWeather: true};
  const page = () => $('weatherDetailPage');
  const isOpen = () => Boolean(page() && !page().hidden);

  function showPage() {
    const el = page();
    if (!el || !el.hidden) return;
    renderDetail(); // from the in-memory data: no fetch
    el.hidden = false;
    scrollDaysToSelected(); // needs layout: only possible once the page is visible
    markHourlyMode();
    const home = $('mobileHomeScreen');
    if (home) home.inert = true; // home stays mounted (region / course / scroll kept) but is not reachable behind the page
    $('weatherDetailBody').scrollTop = 0;
    $('weatherDetailBackBtn')?.focus({preventScroll: true});
  }
  function hidePage() {
    const el = page();
    if (!el || el.hidden) return;
    if (camView()) {
      camRenderToken++;
      destroyCamPlayer();
      camView().hidden = true; // the camera view never outlives the Weather page
      const body = $('wxCamViewBody');
      if (body) body.innerHTML = ''; // stop iframe / image work while Weather is closed
    }
    el.hidden = true;
    el.classList.remove('wx-cam-active');
    const home = $('mobileHomeScreen');
    if (home) home.inert = false;
    $('homeWeatherCard')?.focus({preventScroll: true});
  }
  function openDetail() {
    if (isOpen() || pendingPops > 0) return;
    try { history.pushState(HIST_STATE, '', '#weather'); } catch { /* no history: the page still works */ }
    showPage();
  }
  // The Weather back button (and Android back, which clicks it) closes the camera view first, then the page.
  function closeDetail() {
    if (isCamOpen()) { closeCam(); return; }
    if (!isOpen()) return;
    hidePage();
    if (history.state?.plWeather) {
      pendingPops++;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => { pendingPops = 0; }, 1500); // safety: a lost popstate never blocks re-opening
      try { history.back(); } catch { pendingPops = 0; }
    }
  }
  window.addEventListener('popstate', event => {
    if (pendingPops > 0) { // our own history.back() from closeDetail()
      pendingPops--;
      event.plWeatherHandled = true;
      return;
    }
    if (isCamOpen() && !event.state?.plWeatherCam && event.state?.plWeather) { // back from the camera view
      hideCam();
      event.plWeatherHandled = true;
      return;
    }
    if (isOpen() && !event.state?.plWeather) { // browser / gesture back while the page is open
      hidePage();
      event.plWeatherHandled = true;
    } else if (!isOpen() && event.state?.plWeather) { // browser forward onto our entry
      showPage();
      if (event.state?.plWeatherCam) showCam();
      event.plWeatherHandled = true;
    } else if (isOpen() && !isCamOpen() && event.state?.plWeatherCam) { // forward onto the camera entry
      showCam();
      event.plWeatherHandled = true;
    }
  });
  // Reload / direct URL with #weather: land on the home (state is not kept across a reload), never on an empty page.
  if (location.hash === '#weather' || location.hash === '#weather-cam') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch { }
  }

  function init() {
    const card = $('homeWeatherCard');
    const el = page();
    if (!card || !el) return;
    card.addEventListener('click', openDetail);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(); }
    });
    $('weatherDetailBackBtn')?.addEventListener('click', closeDetail);
    el.addEventListener('input', event => {
      if (event.target.id === 'wxAltRange') onAltitudeInput(event.target);
    });
    el.addEventListener('click', event => {
      const day = event.target.closest('[data-wx-date]');
      if (day) {
        if (day.dataset.wxDate === activeDate()) return;
        selectedDate = day.dataset.wxDate;
        // Expanded / collapsed state stays; the hourly list starts again at its top for the new date.
        rerenderPointSections(); // keep the carousel where the user tapped
        return;
      }
      if (event.target.closest('#wxHourlyToggle')) {
        hourlyExpanded = !hourlyExpanded;
        const section = $('wxHourlySection');
        if (section) section.outerHTML = hourlyHtml();
        markHourlyMode();
        $('wxHourlyToggle')?.focus({preventScroll: true});
        return;
      }
      if (event.target.closest('#wxLiveCam')) openCam();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); }); // closes the camera view first
    renderCard();
  }

  window.PowderlineWeather = {setRegion, close: closeDetail, isOpen, diagnostics: () => [...diagnostics.values()]};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
