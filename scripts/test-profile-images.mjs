// Basic checks of the profile image feature (no server, no browser): avatar files, references, the profile module of
// dist/app.js run in a vm with stubs (pre-migration fallback, member merge, image sources, marker zoom bands), and
// the deferred SQL migration's objects. UI / server behaviour is reviewed by the user.
import assert from 'node:assert/strict';
import {readFileSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(ROOT, 'dist/app.js'), 'utf8');
const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const css = readFileSync(path.join(ROOT, 'dist/styles.css'), 'utf8');
const sql = readFileSync(path.join(ROOT, 'supabase/migrations/20261121000000_add_profile_images.sql'), 'utf8'); // applied 2026-11-20
const results = [];
const test = async (name, fn) => { try { await fn(); results.push({name, pass: true}); } catch (e) { results.push({name, pass: false, error: e.message}); } };

await test('8 avatars: dist/assets/avatars/avatar-01..08.webp, 256x256 WebP with alpha, small; originals kept, no PNG copies', () => {
  for (let i = 1; i <= 8; i++) {
    const f = path.join(ROOT, `dist/assets/avatars/avatar-0${i}.webp`), o = path.join(ROOT, `사진/아바타${i}.png`);
    assert(existsSync(f), f);
    assert(existsSync(o), `original ${o} kept`);
    const b = readFileSync(f);
    assert(b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP', `avatar-0${i} is WebP`);
    assert.equal(b.toString('ascii', 12, 16), 'VP8X', 'extended WebP (alpha)');
    const w = 1 + b.readUIntLE(24, 3), h = 1 + b.readUIntLE(27, 3);
    assert.deepEqual([w, h], [256, 256], `avatar-0${i} ${w}x${h}`);
    assert(statSync(f).size < 64 * 1024, `avatar-0${i} ${statSync(f).size} bytes`);
    assert.equal(readFileSync(o).readUInt32BE(16), 1254, 'original untouched (1254 px)');
    assert(!existsSync(path.join(ROOT, `dist/assets/avatars/avatar-0${i}.png`)), 'no large PNG copy left');
  }
});

// ---- profile module in a vm ----
const top = app.slice(app.indexOf('  // Profile image / party marker state'), app.indexOf('let partyMarkerZoomBound = false;') + 'let partyMarkerZoomBound = false;'.length);
const body = app.slice(app.indexOf('// ==== Profile image: own photo'), app.indexOf('// ---- Party map markers: size by zoom'));
const markerFns = app.slice(app.indexOf('function partyMarkerZoomBand'), app.indexOf('function updatePartyMarkerZoomBand'));
const esc = app.match(/  function escapeHtml\(value\) \{[^\n]*\n/)[0];
const store = new Map();
const opened = [];
const ctx = {
  console, Map, Set, Array, Object, JSON, Math, Number, String, Date, Promise, URL, setTimeout, clearTimeout, requestAnimationFrame: f => f(),
  location: {search: ''}, navigator: {onLine: true}, offlineAccessActive: false,
  localStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)},
  document: {addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], body: {classList: {add() {}, remove() {}}}},
  state: {session: {user: {id: 'u1'}}, profile: {status: 'approved', nickname: '라이더'}, currentParty: null},
  supabaseClient: null, toast() {}, renderPartyMain() {}
};
vm.createContext(ctx);
vm.runInContext(`${esc}${top}\n${body}\n${markerFns}\nopenProfileImageEditor = o => opened.push(o);
showProfileGate = k => gates.push(k);
hideProfileGate = () => gates.push('hide');
showProfileEditorError = m => errors.push(m);
isProfileSetupBlocking = () => false;
closeProfileImageEditor = () => {};\nthis.api = {profileInitial, partyMarkerColor, profileImageSrc, profileImageHtml, attachPartyMemberProfiles, refreshMyProfileImage, partyMarkerZoomBand, profileImageState, enforceOfflineProfileSetupGate, isProfileSetupPending, profileGateDecision};`, Object.assign(ctx, {opened, gates: [], errors: []}));
const api = ctx.api;
const rpcClient = handlers => ({
  rpc: async (fn, args) => (handlers[fn] ? handlers[fn](args) : {data: null, error: {code: 'PGRST202', message: 'not found'}}),
  storage: {from: () => ({createSignedUrls: async paths => ({data: paths.map(p => ({path: p, signedUrl: `https://signed/${p}`})), error: null})})}
});

await test('initials: first character of the nickname (Korean, emoji-safe, upper case), "?" when empty', () => {
  assert.equal(api.profileInitial('라이더'), '라');
  assert.equal(api.profileInitial(' yuna'), 'Y');
  assert.equal(api.profileInitial('😀abc'), '😀');
  assert.equal(api.profileInitial(''), '?');
});
await test('image source: avatar -> static file, no image -> initial only, unknown avatar id ignored', () => {
  assert.equal(api.profileImageSrc({avatar_id: 3}), './assets/avatars/avatar-03.webp');
  assert.equal(api.profileImageSrc({avatar_id: 9}), '');
  assert.equal(api.profileImageSrc(null), '');
  const h = api.profileImageHtml({}, '<b>', 'x');
  assert.match(h, /pl-avatar-initial">&lt;</, 'initial escaped');
  assert.doesNotMatch(h, /<img/);
  assert.match(api.profileImageHtml({avatar_id: 1}, 'a', 'x'), /src="\.\/assets\/avatars\/avatar-01\.webp"/);
  assert(!/avatar-\$\{[^}]*\}\.png|avatars\/avatar-0\d\.png/.test(app), 'no reference to the old PNG avatars');
});
await test('member colours: stable per user, from the 8-colour palette', () => {
  assert.equal(api.partyMarkerColor('abc'), api.partyMarkerColor('abc'));
  assert.match(api.partyMarkerColor('abc'), /^#[0-9a-f]{6}$/);
});
await test('zoom bands: < 12 far (24px), 12-14.5 mid (31.2px), >= 14.5 near (38.4px)', () => {
  assert.deepEqual([10.5, 11.99, 12, 14.49, 14.5, 17].map(api.partyMarkerZoomBand), ['far', 'far', 'mid', 'mid', 'near', 'near']);
  assert.match(css, /data-party-zoom="far"\] \.party-gps-marker \{ --pgm-size: 24px; \}/);
  assert.match(css, /\.party-gps-marker \{ --pgm-size: 31\.2px;/);
  assert.match(css, /data-party-zoom="near"\] \.party-gps-marker \{ --pgm-size: 38\.4px; \}/);
  assert.match(css, /font: 700 12px\/14\.4px Inter/, 'nickname is 20% larger');
  assert.match(app, /Math\.abs\(q\.x - p\.x\) < 77 && Math\.abs\(q\.y - p\.y\) < 36/, 'declutter spacing follows the larger marker');
  assert.match(css, /data-party-zoom="far"\] \.party-gps-marker:not\(\.selected\) \.pgm-name/, 'far: names hidden');
  assert.match(css, /\.party-gps-marker\.offline \{ filter: grayscale\(1\); \}/, 'offline greyscale by CSS');
});
await test('server NOT migrated: no setup sheet, rows unchanged, saving disabled later (supported=false)', async () => {
  ctx.supabaseClient = rpcClient({});
  await api.refreshMyProfileImage();
  assert.equal(api.profileImageState.supported, false);
  assert.equal(ctx.opened.length, 0, 'nobody is forced before the migration');
  const rows = [{party_id: 'p', user_id: 'a', nickname: 'A'}];
  assert.deepEqual(await api.attachPartyMemberProfiles(ctx.supabaseClient, rows), rows);
});
await test('new member (server flag): setup sheet opens; existing member / completed: not forced', async () => {
  api.profileImageState.supported = null;
  ctx.supabaseClient = rpcClient({get_my_profile_image: () => ({data: {setup_required: true, setup_completed_at: null, avatar_id: null, photo_path: null, photo_version: 0}, error: null})});
  await api.refreshMyProfileImage();
  assert.deepEqual(ctx.opened.map(o => o.mode), ['setup']);
  ctx.opened.length = 0;
  for (const mine of [{setup_required: false, setup_completed_at: null}, {setup_required: true, setup_completed_at: '2026-11-21T00:00:00Z', avatar_id: 2}]) {
    store.delete('powderline.profileImage.v1.u1'); // each scenario starts without a previously confirmed state
    api.profileImageState.mine = null;
    ctx.supabaseClient = rpcClient({get_my_profile_image: () => ({data: mine, error: null})});
    await api.refreshMyProfileImage();
  }
  assert.equal(ctx.opened.length, 0);
  assert.equal(JSON.parse(store.get('powderline.profileImage.v1.u1')).avatar_id, 2, 'own state cached for offline display');
});
// --- server-confirmed state gate (replaces the earlier offline / server-unreachable tests) ---
const KEY = uid => `powderline.profileImage.v1.${uid}`;
const confirmedOf = (uid, v) => JSON.stringify({uid, checked_at: '2026-11-21T00:00:00Z', source: 'server', ...v});
const reset = () => { ctx.opened.length = 0; ctx.gates.length = 0; ctx.errors.length = 0; api.profileImageState.mine = null; api.profileImageState.supported = null; store.delete(KEY('u1')); };
const withServer = (rpcResult) => { ctx.supabaseClient = rpcClient({get_my_profile_image: () => rpcResult}); ctx.offlineAccessActive = false; };
const last = arr => arr[arr.length - 1];
await test('never confirmed + server OK: "checking" gate, then existing member enters / new member gets setup / completed enters', async () => {
  for (const [server, expectSetup] of [[{setup_required: false, setup_completed_at: null}, false], [{setup_required: true, setup_completed_at: null}, true],
    [{setup_required: true, setup_completed_at: '2026-11-21T01:00:00Z', avatar_id: 4}, false]]) {
    reset();
    withServer({data: server, error: null});
    await api.refreshMyProfileImage();
    assert.equal(ctx.gates[0], 'checking', 'nothing assumed before the server answers');
    assert.equal(ctx.opened.some(o => o.mode === 'setup'), expectSetup, JSON.stringify(server));
    if (!expectSetup) assert.equal(last(ctx.gates), 'hide', 'enters immediately');
    const saved = JSON.parse(store.get(KEY('u1')));
    assert.equal(saved.uid, 'u1');
    assert(saved.checked_at, 'confirmed state kept for this user');
  }
});
await test('never confirmed + server error: held at the error gate (retry), NOT treated as existing or new', async () => {
  for (const err of [{code: 'NETWORK', message: 'Failed to fetch'}, {code: '500', message: 'server error'}]) {
    reset();
    withServer({data: null, error: err});
    await api.refreshMyProfileImage();
    assert.deepEqual(ctx.gates, ['checking', 'error']);
    assert.equal(ctx.opened.length, 0, 'no setup sheet: registration is not assumed');
    assert(!store.has(KEY('u1')), 'nothing cached from a failed check');
  }
});
await test('confirmed before + server error: existing member enters; new member not completed -> setup with server-error wording', async () => {
  reset();
  store.set(KEY('u1'), confirmedOf('u1', {setup_required: false, setup_completed_at: null}));
  withServer({data: null, error: {code: 'NETWORK'}});
  await api.refreshMyProfileImage();
  assert.equal(ctx.gates.includes('error'), false);
  assert.equal(ctx.opened.length, 0);
  reset();
  store.set(KEY('u1'), confirmedOf('u1', {setup_required: true, setup_completed_at: null}));
  withServer({data: null, error: {code: 'NETWORK'}});
  await api.refreshMyProfileImage();
  assert.equal(last(ctx.opened).mode, 'setup');
  assert.match(last(ctx.errors), /서버에 연결하지 못해/, 'server error wording, distinct from the plain registration notice');
});
await test('migration not applied (PGRST202): server confirms nobody has a duty -> enters, cached as exempt for this user', async () => {
  reset();
  withServer({data: null, error: {code: 'PGRST202'}});
  await api.refreshMyProfileImage();
  assert.equal(last(ctx.gates), 'hide');
  assert.equal(ctx.opened.length, 0);
  const saved = JSON.parse(store.get(KEY('u1')));
  assert.deepEqual([saved.uid, saved.setup_required, saved.source], ['u1', false, 'not_migrated']);
});
await test('another account\'s local state is never reused (key AND stored uid must match)', async () => {
  reset();
  store.set(KEY('u1'), confirmedOf('u2', {setup_required: false, setup_completed_at: null})); // wrong uid inside
  withServer({data: null, error: {code: 'NETWORK'}});
  await api.refreshMyProfileImage();
  assert.deepEqual(ctx.gates, ['checking', 'error'], 'foreign / legacy entry ignored -> unknown');
  reset();
  store.set(KEY('u1'), JSON.stringify({setup_required: false})); // legacy entry without uid / checked_at
  withServer({data: null, error: {code: 'NETWORK'}});
  await api.refreshMyProfileImage();
  assert.equal(last(ctx.gates), 'error');
});
await test('offline start: confirmed existing / completed keep offline use; pending -> setup (offline wording); never confirmed -> gate', () => {
  const run = v => { reset(); if (v) store.set(KEY('u1'), v); ctx.offlineAccessActive = true; ctx.supabaseClient = null; api.enforceOfflineProfileSetupGate(); };
  run(confirmedOf('u1', {setup_required: false, setup_completed_at: null}));
  assert.deepEqual([ctx.opened.length, ctx.gates.includes('error')], [0, false], 'existing member: offline use kept');
  run(confirmedOf('u1', {setup_required: true, setup_completed_at: '2026-11-21T01:00:00Z'}));
  assert.deepEqual([ctx.opened.length, ctx.gates.includes('error')], [0, false], 'completed: offline use kept');
  run(confirmedOf('u1', {setup_required: true, setup_completed_at: null}));
  assert.equal(last(ctx.opened).mode, 'setup');
  assert.match(last(ctx.errors), /오프라인 상태입니다\. 프로필 등록이 완료되지 않아/);
  run(null);
  assert.equal(last(ctx.gates), 'error', 'never confirmed on this device -> temporarily blocked');
  assert.equal(ctx.opened.length, 0);
  ctx.offlineAccessActive = false;
});
await test('wiring: gate blocks Android back, both sign-out buttons use the safe sign-out, request time limit', () => {
  assert(app.includes('if (isProfileGateOpen()) return true;'));
  assert(app.includes("$id('pimLogoutBtn').addEventListener('click', () => void signOutFromProfileGate());"));
  assert(app.includes("getElementById('profileGateLogoutBtn').addEventListener('click', () => void signOutFromProfileGate());"));
  assert(/clearOfflineAccessGrant\(state\.session\?\.user\?\.id\);[\s\S]{0,40}location\.reload\(\);/.test(app));
  assert(app.includes("reject(new Error('Profile state check timed out')), 15000"));
  assert(app.includes('if (offlineAccessActive) enforceOfflineProfileSetupGate();'));
});
await test('party members: image fields merged by user_id, photos get signed URLs, cached per member set', async () => {
  let calls = 0;
  ctx.supabaseClient = rpcClient({list_my_party_member_profiles: () => { calls++; return {data: [
    {party_id: 'p', user_id: 'a', avatar_id: 5, photo_path: null, photo_version: 1},
    {party_id: 'p', user_id: 'b', avatar_id: null, photo_path: 'b/x1.webp', photo_version: 3}], error: null}; }});
  api.profileImageState.supported = true;
  api.profileImageState.membersAt = 0;
  const rows = [{party_id: 'p', user_id: 'a', nickname: 'A', lat: 1}, {party_id: 'p', user_id: 'b', nickname: 'B'}, {party_id: 'p', user_id: 'c', nickname: 'C'}];
  const out = await api.attachPartyMemberProfiles(ctx.supabaseClient, rows);
  assert.equal(out[0].avatar_id, 5);
  assert.equal(out[0].lat, 1, 'existing fields kept');
  assert.equal(out[1].photo_path, 'b/x1.webp');
  assert.equal(out[2].avatar_id, undefined, 'no image -> initial');
  assert.equal(api.profileImageSrc(out[1], 'b'), 'https://signed/b/x1.webp');
  await api.attachPartyMemberProfiles(ctx.supabaseClient, rows);
  assert.equal(calls, 1, 'second poll uses the cache');
  await api.attachPartyMemberProfiles(ctx.supabaseClient, [...rows, {party_id: 'p', user_id: 'd'}]);
  assert.equal(calls, 2, 'member set changed -> reloaded');
});
await test('wiring: existing RPCs untouched, hooks present, nickname / password code not modified', () => {
  assert.match(app, /client\.rpc\('list_my_party_member_locations', \{ p_party_id: partyId \}\)/);
  assert.match(app, /rows: await attachPartyMemberProfiles\(client, data \|\| \[\]\)/);
  assert.match(app, /void refreshMyProfileImage\(\);/);
  assert.match(app, /resetProfileImageState\(\);/);
  assert.match(app, /new mapboxgl\.Marker\(\{ element: el, anchor: 'center' \}\)/);
  assert.match(app, /entry\.el\.classList\.toggle\('offline', isStale\)/);
  assert.match(app, /computePartyMemberGpsStatus\(member, intervalSec\)/, 'status rule reused unchanged');
  assert.match(app, /if \(isProfileSetupBlocking\(\)\) showProfileEditorError/, 'Android back cannot leave the setup');
  assert.match(html, /id="stitchBtnChangeProfileImage"/);
  assert.match(html, /id="stitchAccountAvatarBtn"/);
  assert.match(html, /id="pcAccountAvatarBtn"/);
  assert.match(html, /id="stitchBtnEditNickname"/, 'nickname edit kept');
  assert.match(html, /id="stitchBtnChangePassword"/, 'password change kept');
  // the profile verification query used for sign-in is unchanged (new columns would break sign-in before migration)
  assert.match(app, /client\.from\('profiles'\)\.select\('id,email,nickname,status,role'\)\.eq\('id', session\.user\.id\)\.single\(\)/);
});
await test('SQL (deferred, not applied): minimal columns, own-folder storage policies, new RPCs only', () => {
  for (const c of ['avatar_id smallint', 'photo_path text', 'photo_version integer', 'profile_setup_required boolean not null default false', 'profile_setup_completed_at timestamptz']) assert(sql.includes(c), c);
  assert.match(sql, /before insert on public\.profiles/, 'only rows created after the migration become new members');
  assert(!/update\s+public\.profiles\s+set\s+profile_setup_required/i.test(sql) && !/status\s*=\s*'pending'/i.test(sql),
    'existing accounts (approved or pending) are not changed: all existing members');
  assert.match(sql, /'profile-photos', 'profile-photos', false/, 'private bucket');
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(sql, /create or replace function public\.set_my_profile_image/);
  assert(!/list_my_party_member_locations|list_my_party_members\(\)/.test(sql.replace(/--.*$/gm, '')), 'existing party RPCs not redefined');
  assert(!/grant update/i.test(sql), 'no new direct column write grants');
  assert(existsSync(path.join(ROOT, 'supabase/migrations/20261121000000_add_profile_images.sql')) && !existsSync(path.join(ROOT, 'supabase/deferred/20261121000000_add_profile_images.sql')), 'applied migration lives in migrations/ only');
});

await test('setup sheet layout: title -> 닉네임 등록 -> 프로필 사진 등록 (사진 업로드 | 아바타 설정, folded) -> 지도 표시 미리보기 -> 프로필 저장', () => {
  const b = app.slice(app.indexOf('function buildProfileImageEditor() {'), app.indexOf('function isProfileImageEditorOpen()'));
  const order = ['id="pimTitle">프로필 설정', '>닉네임 등록<', '>프로필 사진 등록<', 'data-pim-panel="photo"', 'data-pim-panel="avatar"', '>지도 표시 미리보기<', 'id="pimSaveBtn"'].map(k => b.indexOf(k));
  assert(order.every(i => i > 0) && order.every((v, k) => k === 0 || v > order[k - 1]), JSON.stringify(order));
  assert(!/data-pim-tab|pimPreviewBig|pimCancelBtn|pim-preview-terrain/.test(app), 'old tabs / big marker card / bottom cancel removed');
  assert(/<div id="pimAvatarPane" class="pim-panel" hidden>/.test(b) && /<div id="pimPhotoPane" class="pim-panel" hidden>/.test(b), 'avatar list and photo editor folded by default');
  assert.equal((b.match(/>선택 저장</g) || []).length, 2, 'one 선택 저장 per panel');
  assert(b.indexOf('id="pimLogoutBtn"') < b.indexOf('닉네임 등록'), 'sign-out reachable in the header, not at the bottom');
  assert(b.includes("$id('pimLogoutBtn').addEventListener('click', () => void signOutFromProfileGate());"));
});
await test('saving: 선택 저장 is local; only 프로필 저장 calls the server; nickname via the existing form logic', () => {
  const save = app.slice(app.indexOf('async function saveProfileImage() {'), app.indexOf('function resetProfileImageState()'));
  assert(save.includes("if (!profileEditor.choice) { showProfileEditorError("), 'final save needs a confirmed image');
  assert(save.indexOf('saveProfileEditorNickname()') < save.indexOf("rpc('set_my_profile_image'"), 'nickname (required) before the completing image save');
  const confirm = app.slice(app.indexOf('async function confirmProfileEditorPhoto()'), app.indexOf('async function saveProfileEditorNickname()'));
  assert(!['rpc(', 'storage.from', 'upload('].some(k => confirm.includes(k)), '선택 저장 does not touch the server');
  const nick = app.slice(app.indexOf('async function saveProfileEditorNickname()'), app.indexOf('async function saveProfileEditorNickname()') + 2500);
  assert(nick.includes("document.getElementById('stitchNicknameForm')") && nick.includes('form.requestSubmit()'), 'reuses the existing nickname form submit');
  assert(!["from('profiles')", 'auth.updateUser'].some(k => nick.includes(k)), 'no new nickname implementation');
  assert(app.includes("document.getElementById('pimSaveBtn').disabled = profileEditor.saving || !profileEditor.choice || !nickOk;"));
});

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` -> ${r.error}` : ''}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
