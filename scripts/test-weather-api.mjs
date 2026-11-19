// Open-Meteo forecast API smoke test for Kiroro. Run: node scripts/test-weather-api.mjs
// Docs: https://open-meteo.com/en/docs, /en/docs/ecmwf-api, /en/docs/gfs-api, /en/docs/jma-api
const latitude = 43.08;
const longitude = 140.99;
const forecastDays = 16;
// Same coordinate at three hypothetical elevations; these are not surveyed Kiroro lift locations.
const elevations = [600, 900, 1200];
const variables = ['temperature_2m', 'rain', 'snowfall', 'wind_speed_10m'];
const models = [
  { name: 'Best Match', endpoint: 'forecast', id: 'best_match' },
  { name: 'ECMWF IFS', endpoint: 'ecmwf', id: 'ecmwf_ifs' },
  { name: 'NOAA GFS', endpoint: 'gfs', id: 'gfs_seamless' },
  { name: 'JMA MSM', endpoint: 'jma', id: 'jma_msm' },
  { name: 'JMA GSM', endpoint: 'jma', id: 'jma_gsm' },
];

function requestUrl(model, hourly, days, elevation) {
  const url = new URL(`https://api.open-meteo.com/v1/${model.endpoint}`);
  url.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    hourly: hourly.join(','), models: model.id,
    timezone: 'Asia/Tokyo', wind_speed_unit: 'ms',
    forecast_days: String(days), elevation: String(elevation),
  }).toString();
  return url;
}

async function request(model, hourly, days, elevation) {
  const response = await fetch(requestUrl(model, hourly, days, elevation), { signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

function summarize(model, elevation, result, days, excluded, initial) {
  const hourly = result.body?.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const dates = new Set(times.map(time => String(time).slice(0, 10)));
  const usableTimes = new Set();
  const values = Object.fromEntries(variables.map(variable => {
    const series = hourly[variable];
    const validIndices = Array.isArray(series)
      ? series.flatMap((value, index) => Number.isFinite(value) ? [index] : []) : [];
    for (const index of validIndices) if (times[index]) usableTimes.add(times[index]);
    return [variable, {
      valid: validIndices.length,
      missing: Math.max(0, times.length - validIndices.length),
      present: Array.isArray(series),
      firstValid: times[validIndices[0]] || null,
      lastValid: times[validIndices.at(-1)] || null,
    }];
  }));
  const usableDates = new Set([...usableTimes].map(time => time.slice(0, 10)));
  const sortedUsableTimes = [...usableTimes].sort();
  return {
    model: model.name, modelId: model.id, endpoint: `/v1/${model.endpoint}`,
    elevation, http16: initial.status, http: result.status,
    requestedDays: forecastDays, responseDays: days,
    start: times[0]?.slice(0, 10) || null,
    end: times.at(-1)?.slice(0, 10) || null,
    timelineDays: dates.size, hours: times.length,
    usableStart: sortedUsableTimes[0] || null,
    usableEnd: sortedUsableTimes.at(-1) || null,
    usableDays: usableDates.size,
    usableHours: sortedUsableTimes.length,
    missingHours: Math.max(0, times.length - sortedUsableTimes.length),
    timezone: result.body?.timezone || null,
    windUnit: result.body?.hourly_units?.wind_speed_10m || null,
    excluded, values,
    ...(!initial.ok ? { initialError: String(initial.body?.reason || 'HTTP error').slice(0, 180) } : {}),
    ...(!result.ok ? { error: String(result.body?.reason || 'HTTP error').slice(0, 180) } : {}),
  };
}

async function testModel(model, elevation) {
  try {
    const initial = await request(model, variables, forecastDays, elevation);
    let result = initial;
    let days = forecastDays;
    let excluded = [];
    // The JMA endpoint documents a maximum of 11 days. Always record the 16-day HTTP result first.
    if (!result.ok && result.status === 400 && model.endpoint === 'jma') {
      days = 11;
      result = await request(model, variables, days, elevation);
    }
    if (!result.ok && result.status === 400) {
      // If a model rejects a variable, probe it alone and retry with only accepted variables.
      const probes = await Promise.all(variables.map(variable => request(model, [variable], days, elevation)));
      excluded = variables.filter((_, index) => !probes[index].ok);
      const accepted = variables.filter((_, index) => probes[index].ok);
      if (accepted.length && excluded.length) result = await request(model, accepted, days, elevation);
    }
    return { summary: summarize(model, elevation, result, days, excluded, initial), body: result.ok ? result.body : null };
  } catch (error) {
    return { summary: { model: model.name, modelId: model.id, elevation,
      http16: null, http: null, error: String(error?.message || error).slice(0, 180) }, body: null };
  }
}

function compareElevations(lower, higher) {
  if (!lower.body?.hourly || !higher.body?.hourly) return [];
  const low = lower.body.hourly, high = higher.body.hourly;
  const highTimeIndex = new Map((high.time || []).map((time, index) => [time, index]));
  return variables.flatMap(variable => {
    let changedHours = 0, maxAbsDifference = 0, example = null;
    for (let i = 0; i < (low.time || []).length; i++) {
      const j = highTimeIndex.get(low.time[i]);
      const a = low[variable]?.[i], b = high[variable]?.[j];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const difference = b - a;
      if (Math.abs(difference) <= 1e-9) continue;
      changedHours++;
      if (Math.abs(difference) > maxAbsDifference) {
        maxAbsDifference = Math.abs(difference);
        example = { time: low.time[i], from: a, to: b, difference: Number(difference.toFixed(4)) };
      }
    }
    return changedHours ? [{ variable, changedHours, maxAbsDifference: Number(maxAbsDifference.toFixed(4)), example }] : [];
  });
}

console.log(`Kiroro elevation correction test: same coordinate ${latitude}, ${longitude} | Asia/Tokyo | wind m/s | forecast_days=${forecastDays}`);
let failed = false;
for (const model of models) {
  const results = await Promise.all(elevations.map(elevation => testModel(model, elevation)));
  for (const result of results) {
    console.log(JSON.stringify(result.summary));
    if (result.summary.http !== 200) failed = true;
  }
  for (const [from, to] of [[0, 1], [1, 2], [0, 2]]) {
    console.log(JSON.stringify({ model: model.name, elevationComparison: `${elevations[from]}->${elevations[to]}`,
      changed: compareElevations(results[from], results[to]) }));
  }
}
if (failed) process.exitCode = 1;
