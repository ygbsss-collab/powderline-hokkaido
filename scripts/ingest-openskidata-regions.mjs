// OpenSkiData batch ingestion for database-registered regions.
//
// Local test (no network, no Supabase access):
//   node scripts/ingest-openskidata-regions.mjs --region my_area --bbox 140.6,42.8,140.8,42.9 --no-download
//
// Queue run (reads pending/failed regions, uploads to Storage, updates the DB):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ingest-openskidata-regions.mjs --upload [--region id] [--no-download]
//
// Scheduled run (GitHub Actions, see .github/workflows/openskidata-ingest.yml):
//   --check-queue   prints how many regions are waiting (no download, no scan, no writes) and sets the
//                   `pending` / `regions` outputs for the workflow.
//
// Safety rules:
//  - Remote writes only happen with --upload.
//  - Source files are downloaded at most once per 24h (work/.openskidata-cache.json); otherwise the cache is reused.
//  - Storage/DB are only touched after a successful extraction. Failures mark the region 'failed' with an error
//    message but never delete or overwrite an existing Storage file. An empty result is not uploaded.
import {appendFileSync, createReadStream, createWriteStream} from 'node:fs';
import {mkdir, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {createGunzip, createGzip} from 'node:zlib';
import {Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import http from 'node:http';
import https from 'node:https';
import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {builtinRegions, defaultInputs, extractRegions, sourceUrls, validateBbox} from './extract-openskidata.mjs';

const BUCKET = 'ski-data';
const MAX_GEOJSON_BYTES = 6 * 1024 * 1024;
const DOWNLOAD_INTERVAL_MS = 24 * 60 * 60 * 1000;
// A batch run is capped at 90 minutes by the workflow, so a region still 'processing' after 2h belongs to a dead run.
const STALE_PROCESSING_MS = 2 * 60 * 60 * 1000;
// Failed regions are retried automatically, but not on every hourly run.
const FAILED_RETRY_MS = 6 * 60 * 60 * 1000;
const CACHE_META = 'work/.openskidata-cache.json';
const REGION_ID = /^[a-z][a-z0-9_]{0,49}$/;
const USER_AGENT = 'Powderline-Hokkaido/1.0 (openskidata-batch; once per day)';

// ---------- download cache ----------

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function readMeta() {
  try { return JSON.parse(await readFile(CACHE_META, 'utf8')); } catch { return {files: {}}; }
}

function sourceUrl(key) {
  const base = process.env.OPENSKIDATA_BASE_URL; // test hook: serve files from a local server
  return base ? `${base.replace(/\/$/, '')}/${sourceUrls[key].split('/').pop()}` : sourceUrls[key];
}

// Downloads url into destination as gzip. Resolves {status: 'downloaded'|'not-modified', etag, lastModified}.
function download(url, destination, previous, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const headers = {'user-agent': USER_AGENT, 'accept-encoding': 'gzip'};
    if (previous?.etag) headers['if-none-match'] = previous.etag;
    else if (previous?.lastModified) headers['if-modified-since'] = previous.lastModified;
    const request = client.get(url, {headers}, response => {
      const {statusCode} = response;
      if (statusCode === 304) { response.resume(); return resolve({status: 'not-modified', ...previous}); }
      if ([301, 302, 307, 308].includes(statusCode) && response.headers.location && redirects < 3) {
        response.resume();
        return resolve(download(new URL(response.headers.location, url).href, destination, previous, redirects + 1));
      }
      if (statusCode !== 200) { response.resume(); return reject(new Error(`HTTP ${statusCode} for ${url}`)); }
      const temporary = `${destination}.download`;
      const alreadyGzip = String(response.headers['content-encoding'] || '').includes('gzip');
      const streams = alreadyGzip ? [response, createWriteStream(temporary)] : [response, createGzip(), createWriteStream(temporary)];
      pipeline(...streams)
        .then(async () => {
          const head = Buffer.alloc(2);
          const handle = await open(temporary, 'r');
          try { await handle.read(head, 0, 2, 0); } finally { await handle.close(); }
          if (head[0] !== 0x1f || head[1] !== 0x8b) throw new Error(`Downloaded file is not gzip: ${url}`);
          await rename(temporary, destination); // atomic swap: old cache survives any failure above
          resolve({status: 'downloaded', etag: response.headers.etag, lastModified: response.headers['last-modified']});
        })
        .catch(async error => { await rm(temporary, {force: true}); reject(error); });
    });
    request.setTimeout(10 * 60 * 1000, () => request.destroy(new Error(`Timeout downloading ${url}`)));
    request.on('error', reject);
  });
}

async function gzipIsValid(path) {
  try {
    await pipeline(createReadStream(path), createGunzip(), new Writable({write(chunk, encoding, done) { done(); }}));
    return true;
  } catch { return false; }
}

export async function ensureSources({allowDownload}) {
  const keys = Object.keys(defaultInputs);
  const present = await Promise.all(keys.map(key => exists(defaultInputs[key])));
  const meta = await readMeta();
  meta.files ||= {};

  // Integrity check: a truncated/corrupt cache would otherwise survive forever (a 304 keeps the bad file).
  for (const [index, key] of keys.entries()) {
    if (!present[index] || await gzipIsValid(defaultInputs[key])) continue;
    if (!allowDownload) throw new Error(`OpenSkiData cache file ${key} is corrupt and --no-download was given.`);
    console.warn(`${key}: cache file is corrupt and will be re-downloaded (subject to the daily limit).`);
    await rm(defaultInputs[key], {force: true});
    delete meta.files[key];
    present[index] = false;
  }
  const allPresent = present.every(Boolean);
  const lastAttempt = Date.parse(meta.lastAttemptAt || '') || 0;
  const recent = Date.now() - lastAttempt < DOWNLOAD_INTERVAL_MS;

  if (allPresent && (!allowDownload || recent)) {
    console.log(`Using cached OpenSkiData files${recent ? ' (downloaded within 24h)' : ''}.`);
    return;
  }
  if (!allowDownload) throw new Error('OpenSkiData cache is incomplete and --no-download was given.');
  if (recent) throw new Error(`OpenSkiData cache is incomplete but a download was already attempted at ${meta.lastAttemptAt}; retry after 24h.`);

  await mkdir('work', {recursive: true});
  meta.lastAttemptAt = new Date().toISOString(); // recorded first so failures also count toward the daily limit
  await writeFile(CACHE_META, `${JSON.stringify(meta, null, 2)}\n`);
  try {
    for (const [index, key] of keys.entries()) {
      const result = await download(sourceUrl(key), defaultInputs[key], present[index] ? meta.files[key] : undefined);
      console.log(`${key}: ${result.status}`);
      meta.files[key] = {etag: result.etag, lastModified: result.lastModified};
      await writeFile(CACHE_META, `${JSON.stringify(meta, null, 2)}\n`);
    }
    meta.downloadedAt = new Date().toISOString();
    await writeFile(CACHE_META, `${JSON.stringify(meta, null, 2)}\n`);
  } catch (error) {
    if (!allPresent) throw error;
    // A complete (older) cache exists: keep using it instead of failing the batch.
    console.warn(`OpenSkiData refresh failed (${error.message}); continuing with the existing cache.`);
  }
}

// ---------- credentials ----------
// The service key is read from SUPABASE_SERVICE_ROLE_KEY, or from a per-user file outside the repository
// (~/.powderline/supabase-service-key, created with `--save-key`). It is never printed or logged.

const KEY_FILE = process.env.POWDERLINE_KEY_FILE || join(homedir(), '.powderline', 'supabase-service-key');
const MIN_KEY_LENGTH = 20; // anything shorter is a broken paste (e.g. a single character)

function keyProblem(key) {
  if (!key) return 'empty';
  if (key.length < MIN_KEY_LENGTH) return `too short (${key.length} characters)`;
  if (!/^[!-~]+$/.test(key)) return 'contains whitespace or non-ASCII characters';
  if (/^['"]|['"]$/.test(key)) return 'wrapped in quotes';
  if (key.startsWith('sb_publishable_')) return 'is a publishable key (cannot write)';
  return null;
}

async function loadCredentials() {
  let url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!url) {
    // Fall back to the linked project (supabase/.temp/project-ref) so only the key has to be configured.
    try { url = `https://${(await readFile('supabase/.temp/project-ref', 'utf8')).trim()}.supabase.co`; } catch { /* url stays empty */ }
  }
  const notes = [];
  let key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  let source = 'environment variable';
  const envProblem = keyProblem(key);
  if (envProblem) {
    if (key) notes.push(`SUPABASE_SERVICE_ROLE_KEY ignored: ${envProblem}`);
    try { key = (await readFile(KEY_FILE, 'utf8')).trim(); source = `key file ${KEY_FILE}`; } catch { key = ''; source = 'none'; }
  }
  return {url, key, source, notes, problem: keyProblem(key)};
}

// Hidden prompt (raw mode; handles pasted text arriving in one chunk). Non-TTY stdin is read as a whole.
function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      const chunks = [];
      input.on('data', chunk => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim())).on('error', reject);
      return;
    }
    process.stdout.write(prompt);
    let value = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const finish = (error) => {
      input.setRawMode(false); input.pause(); input.removeListener('data', onData); process.stdout.write('\n');
      error ? reject(error) : resolve(value.trim());
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('Cancelled.')); // Ctrl+C
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    input.on('data', onData);
  });
}

async function runSaveKey() {
  const key = await readSecret('Paste the Supabase secret key (input is hidden), then press Enter: ');
  const problem = keyProblem(key);
  if (problem) throw new Error(`Key rejected: ${problem}. Nothing was saved.`);
  await mkdir(dirname(KEY_FILE), {recursive: true});
  await writeFile(KEY_FILE, `${key}
`, {mode: 0o600});
  if (process.platform === 'win32') { // restrict the file to the current user
    await new Promise(resolve => execFile('icacls', [KEY_FILE, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W)`], () => resolve()));
  }
  const format = key.startsWith('sb_secret_') ? 'sb_secret_' : /^eyJ/.test(key) ? 'JWT' : 'other';
  console.log(`Saved ${key.length}-character ${format} key to ${KEY_FILE}`);
}

// ---------- Supabase REST (service role) ----------

// undici reports every transport failure as "TypeError: fetch failed"; the real reason is in error.cause.
// Only the method, URL path (no query/headers) and error codes are reported, never credentials.
function describeNetworkError(error, method, path) {
  const causes = [];
  for (let cause = error?.cause, depth = 0; cause && depth < 4; cause = cause.cause, depth += 1) {
    const parts = [cause.code || cause.name, cause.message].filter(Boolean);
    if (Array.isArray(cause.errors)) parts.push(`[${cause.errors.map(item => item.code || item.message).join(', ')}]`);
    causes.push(parts.join(': '));
  }
  const text = `${error?.message || ''} ${causes.join(' ')}`;
  const kind = /ENOTFOUND|EAI_AGAIN/.test(text) ? 'DNS lookup failed'
    : /ECONNREFUSED|ECONNRESET|ETIMEDOUT|CONNECT_TIMEOUT|EHOSTUNREACH|ENETUNREACH|ENETDOWN/.test(text) ? 'connection failed (network/firewall/proxy)'
    : /CERT|SSL|TLS|self.signed|unable to verify/i.test(text) ? 'TLS/certificate error'
    : /header|ByteString|Invalid character|invalid.*value/i.test(text) ? 'invalid request header (check key/URL for stray characters)'
    : /Invalid URL|Failed to parse URL/i.test(text) ? 'invalid SUPABASE_URL'
    : 'unclassified network error';
  const result = new Error(`${method} ${path.split('?')[0]} -> NETWORK ERROR (${kind}); cause: ${causes.join(' <- ') || error?.message || 'unknown'}`);
  result.cause = error;
  return result;
}

// Read-only connectivity/auth check: `--diagnose`. Never claims, uploads or updates anything.
async function runDiagnose() {
  const credentials = await loadCredentials();
  const rawUrl = credentials.url;
  const rawKey = credentials.key;
  for (const note of credentials.notes) console.log(`NOTE: ${note}`);
  const keyFormat = rawKey.startsWith('sb_secret_') ? 'sb_secret_ (new secret key, not a JWT)'
    : /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(rawKey) ? 'JWT (legacy service_role)'
    : rawKey.startsWith('sb_publishable_') ? 'sb_publishable_ (WRONG: publishable key cannot write)'
    : rawKey ? 'unrecognized format' : 'missing';
  let parsed = null;
  try { parsed = new URL(rawUrl); } catch { /* reported below */ }
  console.log(JSON.stringify({
    urlParsed: Boolean(parsed), protocol: parsed?.protocol, host: parsed?.host, urlHasPathOrQuery: parsed ? parsed.pathname !== '/' || Boolean(parsed.search) : undefined,
    keySource: credentials.source, keyProblem: credentials.problem, keyFormat, keyLength: rawKey.length,
    keyHasWhitespaceOrControl: /\s|[\u0000-\u001f\u007f]/.test(rawKey), keyIsAscii: /^[\x21-\x7e]*$/.test(rawKey),
    keyHasQuotes: /^['"]|['"]$/.test(rawKey)
  }, null, 2));
  if (credentials.problem) { console.log('Stopping: no usable key. Run: node scripts/ingest-openskidata-regions.mjs --save-key'); return; }
  for (const mode of ['both', 'apikey']) {
    const api = await supabase(mode);
    console.log(`--- headers: ${mode === 'both' ? 'apikey + Authorization: Bearer (supabase-js style, used by the batch)' : 'apikey only'}`);
    const steps = [
      ['REST    GET powderline_regions', () => api.call('/rest/v1/powderline_regions?select=id&id=eq.dontan&limit=1')],
      ['Storage GET bucket ski-data', () => api.call(`/storage/v1/bucket/${BUCKET}`)]
    ];
    for (const [label, run] of steps) {
      try { const response = await run(); console.log(`${label}: OK (HTTP ${response.status})`); }
      catch (error) { console.log(`${label}: FAIL - ${error.message}`); }
    }
  }
}

async function supabase(authMode = 'both') {
  const {url, key, problem, notes} = await loadCredentials();
  notes.forEach(note => console.warn(`NOTE: ${note}`));
  if (!url) throw new Error('SUPABASE_URL is not set and supabase/.temp/project-ref was not found.');
  if (problem) throw new Error(`No usable service key (${problem}). Run: node scripts/ingest-openskidata-regions.mjs --save-key`);
  // 'both' (default) mirrors supabase-js: apikey + Authorization. 'apikey' sends the apikey header only (diagnose comparison).
  const headers = authMode === 'apikey' ? {apikey: key} : {apikey: key, authorization: `Bearer ${key}`};
  const call = async (path, options = {}) => {
    const method = options.method || 'GET';
    let response;
    try {
      response = await fetch(`${url}${path}`, {...options, headers: {...headers, ...options.headers}});
    } catch (error) {
      throw describeNetworkError(error, method, path); // network-level failure: no HTTP response was received
    }
    if (!response.ok) throw new Error(`${method} ${path.split('?')[0]} -> HTTP ${response.status} (${[401, 403].includes(response.status) ? 'auth/permission error' : 'server responded'}): ${(await response.text()).slice(0, 300)}`);
    return response;
  };
  return {
    call,
    async queue(regionId) {
      const filter = regionId ? `&id=eq.${encodeURIComponent(regionId)}` : '&ski_data_status=in.(pending,failed,processing)';
      return (await call(`/rest/v1/powderline_regions?select=id,ski_data_status,ski_data_started_at,ski_data_completed_at&bbox=not.is.null${filter}`)).json();
    },
    async claim(id) {
      const response = await call('/rest/v1/rpc/claim_powderline_region_ski_data', {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({p_region_id: id, p_stale_before: new Date(Date.now() - STALE_PROCESSING_MS).toISOString()})
      });
      return (await response.json())[0] || null;
    },
    async upload(id, bytes) {
      await call(`/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}.geojson`, {
        method: 'POST', headers: {'content-type': 'application/geo+json', 'x-upsert': 'true'}, body: bytes
      });
    },
    // Guarded by request id + status so a stale batch can never overwrite a newer request.
    async update(id, requestId, fields) {
      const response = await call(
        `/rest/v1/powderline_regions?id=eq.${encodeURIComponent(id)}&ski_data_request_id=eq.${requestId}&ski_data_status=eq.processing&select=id`,
        {method: 'PATCH', headers: {'content-type': 'application/json', prefer: 'return=representation'}, body: JSON.stringify(fields)}
      );
      return (await response.json()).length === 1;
    }
  };
}

// ---------- queue ----------

// Which rows the scheduled run should pick up. The claim RPC re-checks status/staleness server side.
function isEligible(row, now = Date.now()) {
  if (builtinRegions[row.id]) return false; // built-in regions keep their bundled GeoJSON
  const age = value => (value ? now - Date.parse(value) : Infinity);
  if (row.ski_data_status === 'pending') return true;
  if (row.ski_data_status === 'failed') return age(row.ski_data_completed_at) >= FAILED_RETRY_MS;
  if (row.ski_data_status === 'processing') return age(row.ski_data_started_at) >= STALE_PROCESSING_MS;
  return false;
}

function setOutputs(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  const text = lines.join(String.fromCharCode(10));
  console.log(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${text}${String.fromCharCode(10)}`);
}

// Cheap pre-check for CI: only a REST read; never downloads or scans OpenSkiData.
async function runCheckQueue(args) {
  const api = await supabase();
  const explicit = option(args, '--region');
  const rows = (await api.queue(explicit)).filter(row => explicit ? !builtinRegions[row.id] : isEligible(row));
  setOutputs({pending: rows.length, regions: rows.map(row => row.id).join(',')});
}

// ---------- main ----------

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function runLocal(args) {
  const id = option(args, '--region');
  const bbox = validateBbox((option(args, '--bbox') || '').split(','));
  if (!REGION_ID.test(id || '') || !bbox) throw new Error('Local mode needs --region <id> --bbox <west,south,east,north>.');
  if (builtinRegions[id]) throw new Error(`${id} is a built-in region.`);
  await ensureSources({allowDownload: !args.includes('--no-download')});
  const collections = await extractRegions({[id]: {bbox}});
  const outDir = option(args, '--out') || 'work/region-output';
  await mkdir(outDir, {recursive: true});
  const bytes = Buffer.from(`${JSON.stringify(collections[id])}\n`);
  await writeFile(`${outDir}/${id}.geojson`, bytes);
  console.log(JSON.stringify({region: id, counts: collections[id].metadata.counts, bytes: bytes.length, file: `${outDir}/${id}.geojson`, note: 'local only; nothing uploaded'}, null, 2));
}

async function runUpload(args) {
  const api = await supabase();
  const explicit = option(args, '--region');
  if (explicit && (!REGION_ID.test(explicit) || builtinRegions[explicit])) throw new Error('Invalid or built-in --region.');

  const claims = [];
  for (const row of await api.queue(explicit)) {
    if (explicit ? builtinRegions[row.id] : !isEligible(row)) continue;
    const claim = await api.claim(row.id);
    if (claim) claims.push(claim);
    else console.log(`${row.id}: not claimable (status ${row.ski_data_status}), skipped`);
  }
  if (!claims.length) return console.log('No regions to process.');

  const fail = async (claim, message) => {
    await api.update(claim.region_id, claim.request_id, {
      ski_data_status: 'failed', ski_data_completed_at: new Date().toISOString(), ski_data_error: String(message).slice(0, 1000)
    }).catch(error => console.error(`${claim.region_id}: could not record failure: ${error.message}`));
    console.error(`${claim.region_id}: failed - ${message}`);
  };

  const defs = {};
  const runnable = [];
  for (const claim of claims) {
    let rawBbox = claim.bbox;
    if (typeof rawBbox === 'string') { try { rawBbox = JSON.parse(rawBbox); } catch { rawBbox = null; } }
    const bbox = validateBbox(rawBbox);
    if (!bbox) { await fail(claim, 'Invalid BBox'); continue; }
    defs[claim.region_id] = {bbox};
    runnable.push(claim);
  }
  if (!runnable.length) return;

  let collections;
  try {
    await ensureSources({allowDownload: !args.includes('--no-download')});
    collections = await extractRegions(defs);
  } catch (error) {
    for (const claim of runnable) await fail(claim, `OpenSkiData extraction failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  for (const claim of runnable) {
    const id = claim.region_id;
    const collection = collections[id];
    const count = collection.features.length;
    try {
      const completedAt = new Date().toISOString();
      if (!count) {
        // Nothing to publish: keep any existing Storage file untouched.
        const ok = await api.update(id, claim.request_id, {ski_data_status: 'empty', ski_data_completed_at: completedAt, ski_data_error: null, ski_data_feature_count: 0, ski_data_file_size: 0});
        console.log(`${id}: empty${ok ? '' : ' (stale request, DB not updated)'}`);
        continue;
      }
      const bytes = Buffer.from(`${JSON.stringify(collection)}\n`);
      if (bytes.length > MAX_GEOJSON_BYTES) throw new Error('Generated GeoJSON exceeds the 6 MiB storage limit');
      await api.upload(id, bytes);
      const ok = await api.update(id, claim.request_id, {
        ski_data_status: 'ready', ski_data_completed_at: completedAt, ski_data_error: null,
        ski_data_feature_count: count, ski_data_file_size: bytes.length, offline_data_version: completedAt
      });
      console.log(`${id}: ready (${count} features, ${bytes.length} bytes)${ok ? '' : ' - stale request, DB not updated'}`);
    } catch (error) {
      await fail(claim, error.message);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  try {
    await (args.includes('--check-queue') ? runCheckQueue(args) : args.includes('--save-key') ? runSaveKey() : args.includes('--diagnose') ? runDiagnose() : args.includes('--upload') ? runUpload(args) : runLocal(args));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
