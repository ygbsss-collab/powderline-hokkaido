// Tests for the CI pieces of weather-update.yml (offline):
//   - weather-ci-stage.mjs decide(): only data validated in this run is staged; failures keep the last committed file
//   - weather-ci-push.mjs pushData(): no-change -> no commit; rejected push -> rebase + retry; conflict -> abort, no force
//   - workflow files: schedule, concurrency, permissions, deploy of the pushed sha
// Git tests use throw-away repositories in the OS temp directory. Writes work/weather/weather-ci-tests.json.
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decide, SOURCE_REL} from './weather-ci-stage.mjs';
import {pushData} from './weather-ci-push.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const sha = b => createHash('sha256').update(b).digest('hex');

// ---- decide() with the real kiroro files and synthetic pipeline summaries ----
{
  const bmBuf = readFileSync(path.join(ROOT, 'dist/data/weather/kiroro.json'));
  const mmBuf = readFileSync(path.join(ROOT, 'dist/data/weather-multimodel/kiroro.json'));
  const srcBuf = readFileSync(path.join(ROOT, SOURCE_REL));
  const bm = JSON.parse(bmBuf);
  const files = {'dist/data/weather/kiroro.json': bmBuf, 'dist/data/weather-multimodel/kiroro.json': mmBuf, [SOURCE_REL]: srcBuf};
  const read = f => files[f] ?? null;
  const started = new Date(Date.parse(bm.fetched_at) - 60e3).toISOString();
  const rec = (o = {}) => ({region: 'kiroro', started_at_utc: started, steps: {validate_weather: {ok: true, sha256: sha(bmBuf)}, multimodel_service: {ok: true}}, ...o});
  const sum = regs => ({started_at_utc: started, run_at_utc: bm.fetched_at, regions: regs});
  const nb = Date.parse(started) - 60e3;
  let p = decide(sum([rec()]), {regions: ['kiroro'], notBeforeMs: nb, read});
  check('stage.all_valid_staged', p.stage.includes('dist/data/weather/kiroro.json') && p.stage.includes('dist/data/weather-multimodel/kiroro.json') && p.stage.includes(SOURCE_REL) && !p.errors.length, p);
  p = decide(sum([rec({steps: {validate_weather: {ok: false}}, failed_step: 'collect'})]), {regions: ['kiroro'], notBeforeMs: nb, read});
  check('stage.failed_region_restored', p.restore.includes('dist/data/weather/kiroro.json') && p.restore.includes('dist/data/weather-multimodel/kiroro.json') && !p.stage.some(f => f.includes('kiroro')));
  p = decide(sum([rec({steps: {validate_weather: {ok: true, sha256: sha(bmBuf)}, multimodel_service: {ok: false, issues: ['x']}}})]), {regions: ['kiroro'], notBeforeMs: nb, read});
  check('stage.multimodel_failed_only_bm_staged', p.stage.includes('dist/data/weather/kiroro.json') && p.restore.includes('dist/data/weather-multimodel/kiroro.json'));
  p = decide(sum([rec({steps: {validate_weather: {ok: true, sha256: 'other'}, multimodel_service: {ok: true}}})]), {regions: ['kiroro'], notBeforeMs: nb, read});
  check('stage.bm_changed_after_validation_rejected', p.restore.includes('dist/data/weather/kiroro.json'));
  const mmOther = JSON.parse(mmBuf); mmOther.multimodel.best_match_source.sha256 = 'x';
  p = decide(sum([rec()]), {regions: ['kiroro'], notBeforeMs: nb, read: f => (f.includes('multimodel') ? Buffer.from(JSON.stringify(mmOther)) : read(f))});
  check('stage.multimodel_from_other_bm_rejected', p.restore.includes('dist/data/weather-multimodel/kiroro.json') && p.stage.includes('dist/data/weather/kiroro.json'));
  p = decide(sum([rec()]), {regions: ['kiroro'], notBeforeMs: Date.parse(started) + 3600e3, read});
  check('stage.stale_summary_nothing_staged', p.errors.length > 0 && p.stage.every(f => f === SOURCE_REL));
  p = decide(null, {regions: ['kiroro'], notBeforeMs: 0, read});
  check('stage.no_summary_error', p.errors.includes('pipeline summary missing'));
  p = decide(sum([rec()]), {regions: ['kiroro'], notBeforeMs: nb, read: f => (f === SOURCE_REL ? Buffer.from('{"primary":"x"}') : read(f))});
  check('stage.invalid_switch_error', p.errors.some(e => e.includes('weather-source')));
  p = decide(sum([rec()]), {regions: ['kiroro', 'niseko'], notBeforeMs: nb, read});
  check('stage.region_missing_from_run_restored', p.restore.includes('dist/data/weather/niseko.json') && p.stage.includes('dist/data/weather/kiroro.json'));
  check('stage.never_snow_surface_or_work', !JSON.stringify(decide(sum([rec()]), {regions: ['kiroro'], notBeforeMs: nb, read}).stage).match(/snow-surface|work\//));
}

// ---- pushData() against real temporary git repositories ----
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pl-weather-ci-'));
try {
  const g = (cwd, ...a) => execFileSync('git', a, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const origin = path.join(tmp, 'origin.git');
  g(tmp, 'init', '--bare', '-b', 'main', origin);
  const clone = name => { const d = path.join(tmp, name); g(tmp, 'clone', origin, d); g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@example.invalid'); g(d, 'config', 'commit.gpgsign', 'false'); return d; };
  const A = clone('a');
  writeFileSync(path.join(A, 'data.json'), '{"v":0}\n'); writeFileSync(path.join(A, 'code.js'), '1\n');
  g(A, 'add', '.'); g(A, 'commit', '-m', 'init'); g(A, 'push', 'origin', 'HEAD:main');
  const B = clone('b');
  let r = pushData({cwd: A});
  check('push.no_changes_no_commit', r.committed === false && r.reason === 'no_changes' && g(A, 'rev-list', '--count', 'HEAD') === '1');
  writeFileSync(path.join(A, 'data.json'), '{"v":1}\n'); g(A, 'add', 'data.json');
  r = pushData({cwd: A, message: 'data 1'});
  check('push.simple_push', r.pushed && r.sha === g(A, 'rev-parse', 'HEAD') && g(origin, 'rev-parse', 'main') === r.sha);
  // Someone pushes code meanwhile -> rejected -> rebase -> push; their commit is preserved.
  g(B, 'pull', 'origin', 'main'); writeFileSync(path.join(B, 'code.js'), '2\n'); g(B, 'commit', '-am', 'code change'); g(B, 'push', 'origin', 'HEAD:main');
  const bHead = g(B, 'rev-parse', 'HEAD');
  writeFileSync(path.join(A, 'data.json'), '{"v":2}\n'); g(A, 'add', 'data.json');
  r = pushData({cwd: A, message: 'data 2'});
  const log = g(origin, 'log', '--format=%s', 'main');
  check('push.rejected_then_rebased', r.pushed && r.attempts === 2 && log.split('\n')[0] === 'data 2' && log.includes('code change'), {log});
  check('push.remote_commit_preserved', g(origin, 'merge-base', '--is-ancestor', bHead, 'main') === '' );
  // Conflicting data change on main -> rebase conflict -> aborted, origin untouched, nothing forced.
  g(B, 'pull', 'origin', 'main'); writeFileSync(path.join(B, 'data.json'), '{"v":"manual"}\n'); g(B, 'commit', '-am', 'manual data'); g(B, 'push', 'origin', 'HEAD:main');
  const before = g(origin, 'rev-parse', 'main');
  writeFileSync(path.join(A, 'data.json'), '{"v":3}\n'); g(A, 'add', 'data.json');
  r = pushData({cwd: A, message: 'data 3'});
  check('push.conflict_aborts_without_force', !r.pushed && r.reason === 'rebase_conflict' && g(origin, 'rev-parse', 'main') === before && !g(A, 'status').includes('rebase in progress'));
} finally { rmSync(tmp, {recursive: true, force: true}); }

// ---- workflow files ----
{
  const w = readFileSync(path.join(ROOT, '.github/workflows/weather-update.yml'), 'utf8');
  const pages = readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  const ingest = readFileSync(path.join(ROOT, '.github/workflows/openskidata-ingest.yml'), 'utf8');
  check('wf.schedule_2hour', w.includes("cron: '0 */2 * * *'") && w.includes('workflow_dispatch:') && !w.includes('18,0,6,12'));
  check('wf.concurrency_no_cancel', /group: weather-update\s+cancel-in-progress: false/.test(w));
  check('wf.deploy_shares_pages_group', /group: pages\s+cancel-in-progress: false/.test(w) && /group: pages\s+cancel-in-progress: false/.test(pages));
  check('wf.pages_push_trigger_kept', /push:\s+branches: \[main\]/.test(pages) && pages.includes('path: ./dist'));
  check('wf.ingest_unchanged_group', ingest.includes('group: openskidata-ingest'));
  check('wf.pipeline_no_snow_surface', w.includes('weather-pipeline.mjs all --no-snow-surface'));
  check('wf.deploys_pushed_sha_only', w.includes('ref: ${{ needs.update.outputs.sha }}') && w.includes("needs.update.outputs.pushed == 'true'") && w.includes('git rev-parse HEAD'));
  check('wf.permissions', /contents: write/.test(w) && /pages: write/.test(w) && /id-token: write/.test(w));
  // A one-line `run:` whose text contains ": " is parsed by YAML as a nested mapping (GitHub rejects the file).
  check('wf.yaml_no_plain_run_with_colon_space', [w, pages].every(t => !/^\s*run: [^|>\n].*: /m.test(t)));
  check('wf.no_force_push', !/--force|-f\b.*push|push.*-f\b/.test(w) && !/--force/.test(readFileSync(path.join(ROOT, 'scripts/weather-ci-push.mjs'), 'utf8')));
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-ci-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 400));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
