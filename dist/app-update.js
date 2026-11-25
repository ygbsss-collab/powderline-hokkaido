/* POWDERLINE version display + Android APK update check. Independent of login / auth.
 *
 * Android app (Capacitor):
 *  - Installed versionCode / versionName come from @capacitor/app App.getInfo() (build / version).
 *  - Latest release info: app-version.json on GitHub Pages (absolute URL: the APK bundles its own copy of dist/).
 *  - Checked on every app start, and on return from background when the last check is >= 6 h old.
 *  - Newer versionCode -> update modal ("지금 업데이트" opens the latest GitHub Release APK in the browser | "나중에").
 *    Held back while Ride On, party ride or GPS recording is active (window.PowderlineActivity from app.js).
 *  - Offline / any failure: nothing happens, the installed app keeps running.
 * Browser / PWA: only the version row; "업데이트 확인" uses the existing Service Worker update flow
 *  (registration.update() -> the confirm prompt in index.html). Nothing here touches the APK path. */
(function () {
  'use strict';
  var VERSION_URL = 'https://ygbsss-collab.github.io/powderline-hokkaido/app-version.json';
  var RELEASE_PREFIX = 'https://github.com/ygbsss-collab/powderline-hokkaido/releases/';
  var RESUME_INTERVAL_MS = 6 * 3600e3;
  var FETCH_TIMEOUT_MS = 8000;
  var BUSY_RETRY_MS = 30000;
  var LAST_CHECK_KEY = 'powderline.appUpdate.lastCheckAt';

  var cap = window.Capacitor, platform = cap && cap.getPlatform ? cap.getPlatform() : '';
  var isAndroidApp = !!(cap && platform === 'android' && (!cap.isNativePlatform || cap.isNativePlatform()));
  var appPlugin = isAndroidApp ? (cap.Plugins && cap.Plugins.App) : null;

  var installed = null;      // {code, name} of the running APK
  var pending = null;        // newer release waiting to be shown
  var checking = null;       // in-flight check promise
  var retryTimer = null;
  var statusEl = null, versionEl = null, modal = null;

  function store(key, value) { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; } return null; }
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }
  function busy() { try { return !!(window.PowderlineActivity && window.PowderlineActivity.busy()); } catch (e) { return false; } }
  // Not over the intro / account check screen.
  function introDone() { return document.body.dataset.mobileAuth !== 'checking'; }

  function getInstalled() {
    if (installed) return Promise.resolve(installed);
    if (!appPlugin || !appPlugin.getInfo) return Promise.reject(new Error('App plugin unavailable'));
    return Promise.resolve(appPlugin.getInfo()).then(function (info) {
      var code = parseInt(info && info.build, 10);
      if (!Number.isFinite(code) || code < 1) throw new Error('versionCode unavailable');
      installed = {code: code, name: String((info && info.version) || '')};
      if (versionEl) versionEl.textContent = 'Android 앱 v' + installed.name + ' (' + installed.code + ')';
      return installed;
    });
  }

  // Latest release from app-version.json. Only a GitHub Release URL of this repository is ever opened.
  function fetchLatest() {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : null;
    return fetch(VERSION_URL + '?t=' + Date.now(), {cache: 'no-store', signal: ctrl ? ctrl.signal : undefined})
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        var a = json && json.android;
        var code = a && Number(a.versionCode);
        if (!Number.isInteger(code) || code < 1) throw new Error('invalid versionCode');
        if (typeof a.apkUrl !== 'string' || a.apkUrl.indexOf(RELEASE_PREFIX) !== 0) throw new Error('invalid apkUrl');
        return {code: code, name: String(a.versionName || ''), url: a.apkUrl,
          notes: Array.isArray(a.releaseNotes) ? a.releaseNotes.map(String).slice(0, 6) : []};
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // -> 'update' | 'latest' | 'offline' | 'error'
  function check(manual) {
    if (!isAndroidApp) return Promise.resolve('error');
    if (checking) return checking;
    if (navigator.onLine === false) return Promise.resolve('offline');
    checking = getInstalled().then(function (cur) {
      return fetchLatest().then(function (latest) {
        store(LAST_CHECK_KEY, String(Date.now()));
        if (latest.code > cur.code) { pending = latest; showWhenAllowed(manual); return 'update'; }
        pending = null;
        return 'latest';
      });
    }).catch(function (e) {
      console.warn('[app-update] check failed:', e && e.message ? e.message : e);
      return navigator.onLine === false ? 'offline' : 'error';
    }).finally(function () { checking = null; });
    return checking;
  }

  function showWhenAllowed(force) {
    clearTimeout(retryTimer);
    if (!pending) return;
    if (force || (!busy() && introDone())) { openModal(pending); return; }
    retryTimer = setTimeout(function () { showWhenAllowed(false); }, BUSY_RETRY_MS);
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'appUpdateModal';
    modal.className = 'pwa-install-modal app-update-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="appUpdateTitle">' +
        '<header class="pwa-install-head"><span class="material-symbols-outlined" aria-hidden="true">system_update</span>' +
          '<h2 id="appUpdateTitle">새 버전이 있습니다</h2></header>' +
        '<p id="appUpdateText" class="pwa-install-lead"></p>' +
        '<ul id="appUpdateNotes" class="app-update-notes"></ul>' +
        '<p class="pwa-install-lead app-update-hint">다운로드한 POWDERLINE.apk를 열어 설치하면 기존 앱이 업데이트됩니다. 로그인 정보와 설정은 유지됩니다.</p>' +
        '<div class="app-update-actions">' +
          '<button type="button" class="pwa-install-close-btn" data-app-update="later">나중에</button>' +
          '<button type="button" class="app-update-now-btn" data-app-update="now">지금 업데이트</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      var act = e.target.closest && e.target.closest('[data-app-update]');
      // Either choice ends this prompt; the next check (next start, or resume after 6 h) may offer it again.
      if (e.target === modal || (act && act.dataset.appUpdate === 'later')) { pending = null; closeModal(); return; }
      if (act && act.dataset.appUpdate === 'now' && pending) {
        var url = pending.url;
        pending = null;
        closeModal();
        // External https URL: the Capacitor WebView hands it to the system browser, which downloads the APK.
        window.location.href = url;
      }
    });
    return modal;
  }
  function openModal(latest) {
    ensureModal();
    var cur = installed ? 'v' + installed.name + ' (' + installed.code + ')' : '';
    modal.querySelector('#appUpdateText').textContent = 'POWDERLINE v' + latest.name + ' (' + latest.code + ')을 설치할 수 있습니다.' + (cur ? ' 현재 ' + cur : '');
    var notes = modal.querySelector('#appUpdateNotes');
    notes.innerHTML = '';
    latest.notes.forEach(function (n) { var li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });
    notes.hidden = !latest.notes.length;
    modal.hidden = false;
    var now = modal.querySelector('.app-update-now-btn');
    if (now) now.focus();
  }
  function closeModal() { clearTimeout(retryTimer); if (modal) modal.hidden = true; }

  // ---- Settings row (account settings list, same row look as the existing rows; DOM only) ----
  function webVersion() {
    if (!('caches' in window)) return Promise.resolve('');
    return caches.keys().then(function (names) {
      var v = names.map(function (n) { var m = /^powderline-pwa-shell-(v\d+)$/.exec(n); return m ? m[1] : ''; }).filter(Boolean).sort().pop();
      return v || '';
    }).catch(function () { return ''; });
  }
  function manualWebCheck() {
    if (!('serviceWorker' in navigator)) { setStatus('이 브라우저는 자동 업데이트를 지원하지 않습니다.'); return; }
    setStatus('업데이트 확인 중…');
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) { setStatus('최신 웹 버전을 사용 중입니다.'); return; }
      return reg.update().then(function () {
        // A new worker shows the existing "새 버전이 준비되었습니다" prompt (index.html) once it is installed.
        setStatus(reg.installing || reg.waiting ? '새 버전을 준비 중입니다. 잠시 후 안내가 표시됩니다.' : '최신 버전을 사용 중입니다.');
      });
    }).catch(function () { setStatus('확인하지 못했습니다. 인터넷 연결을 확인하세요.'); });
  }
  function manualAppCheck() {
    setStatus('업데이트 확인 중…');
    check(true).then(function (result) {
      setStatus(result === 'update' ? '새 버전이 있습니다.'
        : result === 'latest' ? '최신 버전을 사용 중입니다.'
        : result === 'offline' ? '인터넷에 연결되어 있지 않습니다.'
        : '확인하지 못했습니다. 잠시 후 다시 시도하세요.');
    });
  }
  function addSettingsRow() {
    if (document.getElementById('appVersionRow')) return;
    var anchor = document.getElementById('stitchBtnChangeProfileImage');
    var list = anchor && anchor.parentElement;
    if (!list) return;
    var row = document.createElement('button');
    row.id = 'appVersionRow';
    row.type = 'button';
    row.className = anchor.className;
    row.innerHTML =
      '<div class="flex items-center gap-space-sm">' +
        '<div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary-container">' +
          '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">system_update</span>' +
        '</div>' +
        '<div>' +
          '<span id="appVersionLabel" class="font-body-md text-body-md text-on-surface block">앱 버전</span>' +
          '<span id="appVersionStatus" class="font-body-sm text-body-sm text-outline" role="status" aria-live="polite">업데이트 확인</span>' +
        '</div>' +
      '</div>' +
      '<span class="app-version-check-btn" aria-hidden="true">업데이트 확인</span>';
    list.appendChild(row);
    versionEl = row.querySelector('#appVersionLabel');
    statusEl = row.querySelector('#appVersionStatus');
    row.addEventListener('click', isAndroidApp ? manualAppCheck : manualWebCheck);
    if (isAndroidApp) getInstalled().catch(function () { versionEl.textContent = 'Android 앱'; });
    else webVersion().then(function (v) { versionEl.textContent = v ? '웹 앱 ' + v : '웹 앱'; });
  }

  function init() {
    addSettingsRow();
    if (!isAndroidApp) return;
    check(false); // every app start, logged in or not
    if (appPlugin && appPlugin.addListener) {
      try {
        Promise.resolve(appPlugin.addListener('appStateChange', function (state) {
          if (!state || !state.isActive) return;
          var last = Number(store(LAST_CHECK_KEY)) || 0;
          if (Date.now() - last >= RESUME_INTERVAL_MS) check(false);
          else if (pending && !(modal && !modal.hidden)) showWhenAllowed(false); // held back (ride / recording) earlier
        })).catch(function () {});
      } catch (e) { /* no resume check */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // Exposed for tests / diagnostics only.
  window.PowderlineAppUpdate = {check: check, _internal: {RESUME_INTERVAL_MS: RESUME_INTERVAL_MS}};
})();
