// Native Android FCM bridge. The token is kept in memory and emitted (app.js uploads it via register-push-token);
// this module does not persist it. The permission dialog only appears after an explicit call (app.js: after login).
(() => {
  let listenersReady = false;
  let listenersPromise = null;
  let registerRequested = false;
  let token = null;
  let permission = 'unknown';
  let status = 'idle';
  let lastError = null;

  const plugin = () => window.Capacitor?.Plugins?.PushNotifications || null;
  const isAndroidNative = () => window.Capacitor?.getPlatform?.() === 'android' && window.Capacitor?.isNativePlatform?.() === true;
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, {detail}));
  const snapshot = () => ({available: Boolean(plugin() && isAndroidNative()), status, permission, token, lastError});

  async function ensureListeners() {
    const push = plugin();
    if (!push || !isAndroidNative()) {
      status = 'unavailable';
      return false;
    }
    if (listenersReady) return true;
    if (listenersPromise) return listenersPromise;
    listenersPromise = Promise.all([
      push.addListener('registration', info => {
        token = typeof info?.value === 'string' && info.value ? info.value : null;
        status = token ? 'registered' : 'registration_error';
        lastError = token ? null : 'FCM registration returned an empty token.';
        if (token) emit('powderline:fcm-token', {token});
      }),
      push.addListener('registrationError', error => {
        status = 'registration_error';
        lastError = error?.error || error?.message || 'FCM registration failed.';
        emit('powderline:fcm-registration-error', {message: lastError});
      }),
      push.addListener('pushNotificationReceived', notification => {
        // Only fires while the app is in the foreground (Android then shows no system notification).
        emit('powderline:push-received', {notification});
        try { showForegroundNotification(notification); } catch (error) { console.warn('Push banner failed:', error?.message || error); }
      }),
      push.addListener('pushNotificationActionPerformed', action => {
        // Native SOS notification '위치 보기' / tap: the alert is already stopped natively; drop the matching banner too
        // (app.js opens the location through the same event).
        const data = action?.notification?.data;
        if (data?.type === 'party_sos' && typeof data.sos_id === 'string') {
          stopSosAlert(data.sos_id);
          document.querySelectorAll?.('#plPushBanners .pl-push-banner.is-sos').forEach(el => { if (el.dataset.sosId === data.sos_id) dismissBanner(el); });
        }
        emit('powderline:push-action', {action});
      })
    ]).then(() => {
      listenersReady = true;
      status = 'listeners_ready';
      return true;
    }).catch(error => {
      lastError = error?.message || String(error);
      status = 'listener_error';
      return false;
    }).finally(() => { listenersPromise = null; });
    return listenersPromise;
  }

  // The system dialog is shown at most once per install: after a "deny" the app keeps working and only
  // points to the Android settings; it never re-prompts by itself. Granting later in settings is picked up
  // by the next check (which also clears the flag).
  const DECLINED_KEY = 'powderline.push.permissionDeclined';
  const readDeclined = () => { try { return localStorage.getItem(DECLINED_KEY) === '1'; } catch { return false; } };
  const writeDeclined = value => {
    try { if (value) localStorage.setItem(DECLINED_KEY, '1'); else localStorage.removeItem(DECLINED_KEY); } catch { /* storage unavailable */ }
  };
  const PROMPTABLE = new Set(['prompt', 'prompt-with-rationale']);
  let queue = Promise.resolve();
  // Serialized: the startup check and the post-login request can never open two dialogs or register twice.
  const registerWithPermission = options => (queue = queue.then(() => registerOnce(options), () => registerOnce(options)));

  // ---- Foreground banners: 5 party + 2 account notifications (general), SOS created (sticky, red), SOS resolved ----
  const GENERAL_BANNER_MS = 5000;
  const MAX_GENERAL_BANNERS = 3;
  const GENERAL_TYPES = {
    party_invited: 'group_add', party_joined: 'how_to_reg', party_left: 'group_remove', party_disbanded: 'groups', party_kicked: 'person_remove',
    signup_requested: 'person_add', account_suspended: 'block'
  };
  const seenNotifications = new Map(); // dedupe key -> shown at (ms); bounded

  function classifyNotification(notification) {
    const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};
    const title = String(notification?.title || '').trim();
    const body = String(notification?.body || '').trim();
    if (data.type === 'party_sos') {
      const resolved = data.action === 'resolved';
      const sosId = typeof data.sos_id === 'string' ? data.sos_id : '';
      return {
        category: resolved ? 'sos_resolved' : 'sos', sosId, data, icon: resolved ? 'check_circle' : 'sos',
        key: sosId ? `sos:${sosId}:${resolved ? 'resolved' : 'created'}` : '',
        title: title || (resolved ? 'POWDERLINE SOS 종료' : 'POWDERLINE 긴급 SOS'),
        body: body || (resolved ? '파티원의 SOS가 종료되었습니다.' : '파티원이 긴급 위치를 공유했습니다.'),
        sticky: !resolved, navigable: false // SOS: the explicit "위치 보기" button opens the location
      };
    }
    const eventType = typeof data.event_type === 'string' ? data.event_type : '';
    return {
      category: GENERAL_TYPES[eventType] ? eventType : 'general', data, icon: GENERAL_TYPES[eventType] || 'notifications',
      key: typeof data.notification_id === 'string' && data.notification_id ? `n:${data.notification_id}` : '',
      title: title || 'POWDERLINE 알림', body, sticky: false, navigable: false // no existing in-app route for these
    };
  }

  // ---- SOS channel: HIGH importance, own SOS MP3 + strong vibration (native SosAlertNotifier creates it). Sound/vibration stay editable in
  // Android settings and follow ringer mode / Do Not Disturb. New id: Android never lets an app change an existing
  // channel's sound, vibration or importance. General notifications keep using the default FCM channel. ----
  const SOS_CHANNEL_ID = 'powderline_sos_alert_v3'; // v3 = own MP3 (res/raw/powderline_sos_emergency) + strong pattern, created natively first
  let sosChannelPromise = null;
  function ensureSosChannel() {
    const push = plugin();
    if (!push?.createChannel || !isAndroidNative()) return Promise.resolve(false);
    sosChannelPromise ||= Promise.resolve(push.createChannel({
      id: SOS_CHANNEL_ID, name: 'SOS 긴급 알림', description: '파티원의 긴급 SOS 위치 공유 알림',
      importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#FF0000', sound: 'powderline_sos_emergency'
    })).then(() => true, error => {
      sosChannelPromise = null;
      console.warn('SOS notification channel failed:', error?.message || error);
      return false;
    });
    return sosChannelPromise;
  }
  // The repeating SOS sound/vibration is native (android/.../SosAlertNotifier.java: one FLAG_INSISTENT notification per
  // SOS, foreground and background alike, 10-minute hard stop). JS only stops it: same tag + id (Java String.hashCode).
  const SOS_ALERT_TAG = 'powderline_sos';
  const sosNotificationId = sosId => { let h = 0; for (let i = 0; i < sosId.length; i++) h = (Math.imul(31, h) + sosId.charCodeAt(i)) | 0; return h; };
  function stopSosAlert(sosId) {
    const push = plugin();
    if (!sosId || !push?.removeDeliveredNotifications || !isAndroidNative()) return;
    try {
      Promise.resolve(push.removeDeliveredNotifications({notifications: [{id: sosNotificationId(sosId), tag: SOS_ALERT_TAG, title: '', body: '', data: {}}]})).catch(() => {});
    } catch { /* plugin unavailable: the native 10-minute stop still applies */ }
  }

  function bannerHost() {
    let host = document.getElementById('plPushBanners');
    if (!host) {
      host = document.createElement('div');
      host.id = 'plPushBanners';
      host.className = 'pl-push-banners';
      document.body.appendChild(host);
    }
    return host;
  }
  function dismissBanner(banner) {
    if (!banner?.isConnected || banner.classList.contains('is-leaving')) return;
    clearTimeout(banner._plTimer);
    if (banner.classList.contains('is-sos') && banner.dataset.sosId) stopSosAlert(banner.dataset.sosId);
    banner.classList.add('is-leaving');
    setTimeout(() => banner.remove(), 180);
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text; // server text is never parsed as HTML
    return el;
  }

  function showForegroundNotification(notification) {
    if (typeof document === 'undefined' || !document.body) return null;
    const info = classifyNotification(notification);
    const fallbackId = typeof notification?.id === 'string' && notification.id ? `m:${notification.id}` : `t:${info.title}|${info.body}`;
    const key = info.key || fallbackId;
    if (seenNotifications.has(key)) return null; // same notification delivered twice
    seenNotifications.set(key, Date.now());
    if (seenNotifications.size > 200) seenNotifications.delete(seenNotifications.keys().next().value);

    const host = bannerHost();
    if (info.category === 'sos_resolved' && info.sosId) { // the emergency is over: close its sticky banner
      for (const el of host.querySelectorAll('.pl-push-banner.is-sos')) if (el.dataset.sosId === info.sosId) dismissBanner(el);
      stopSosAlert(info.sosId); // native also stops it when the resolved message arrives
    }
    const banner = node('div', `pl-push-banner${info.sticky ? ' is-sos' : ''}`);
    banner.dataset.category = info.category;
    banner.dataset.key = key;
    if (info.sosId) banner.dataset.sosId = info.sosId;
    banner.setAttribute('role', info.sticky ? 'alert' : 'status');
    const icon = node('span', 'material-symbols-outlined pl-push-banner-icon', info.icon);
    icon.setAttribute('aria-hidden', 'true');
    const main = node('div', 'pl-push-banner-main');
    main.append(node('strong', 'pl-push-banner-title', info.title));
    if (info.body) main.append(node('span', 'pl-push-banner-body', info.body));
    banner.append(icon, main);
    const closeButton = () => {
      const close = node('button', 'pl-push-banner-close');
      close.type = 'button';
      close.setAttribute('aria-label', '알림 닫기');
      const x = node('span', 'material-symbols-outlined', 'close');
      x.setAttribute('aria-hidden', 'true');
      close.append(x);
      close.addEventListener('click', () => dismissBanner(banner));
      return close;
    };
    if (info.sticky) {
      // "위치 보기": moves the map to this SOS (app.js, same route as a system-notification tap). The banner closes
      // only when that succeeded; on failure it stays with the reason (and a close button appears).
      const locate = node('button', 'pl-push-banner-confirm', '위치 보기');
      locate.type = 'button';
      locate.addEventListener('click', async () => {
        if (locate.disabled) return;
        stopSosAlert(info.sosId); // stop the repeating alert at once, whatever the map result
        locate.disabled = true;
        locate.textContent = '이동 중…';
        let result;
        try {
          const open = window.PowderlinePartySos?.openFromPush;
          result = open ? await open(info.data) : {ok: false, message: '지금은 SOS 위치를 열 수 없습니다.'};
        } catch (error) {
          result = {ok: false, message: 'SOS 위치를 여는 중 오류가 발생했습니다.'};
        }
        if (!banner.isConnected || banner.classList.contains('is-leaving')) return;
        if (result?.ok) { dismissBanner(banner); return; }
        locate.disabled = false;
        locate.textContent = '위치 보기';
        let error = main.querySelector('.pl-push-banner-error');
        if (!error) { error = node('span', 'pl-push-banner-error'); error.setAttribute('role', 'alert'); main.append(error); }
        error.textContent = result?.message || 'SOS 위치로 이동하지 못했습니다.';
        if (!banner.querySelector('.pl-push-banner-close')) banner.append(closeButton());
      });
      banner.append(locate);
    } else {
      banner.append(closeButton());
      banner._plTimer = setTimeout(() => dismissBanner(banner), GENERAL_BANNER_MS);
    }
    host.prepend(banner);
    const general = [...host.querySelectorAll('.pl-push-banner:not(.is-sos):not(.is-leaving)')];
    for (const extra of general.slice(MAX_GENERAL_BANNERS)) dismissBanner(extra); // SOS banners are never evicted
    return banner;
  }

  async function registerOnce({request = false} = {}) {
    const push = plugin();
    if (!await ensureListeners() || !push) return snapshot();
    try {
      let result = await push.checkPermissions();
      permission = result?.receive || 'unknown';
      let justDenied = false;
      if (permission === 'granted') writeDeclined(false);
      else if (request && PROMPTABLE.has(permission) && !readDeclined()) {
        result = await push.requestPermissions();
        permission = result?.receive || 'unknown';
        justDenied = permission !== 'granted';
        writeDeclined(justDenied);
      }
      if (permission !== 'granted') {
        status = permission === 'denied' || readDeclined() ? 'permission_denied' : 'permission_required';
        emit('powderline:push-permission-required', {permission, declined: readDeclined() || permission === 'denied', justDenied});
        return snapshot();
      }
      await ensureSosChannel(); // before the first SOS can arrive in the background; failure never blocks register()
      if (!registerRequested) {
        registerRequested = true;
        status = 'registering';
        try {
          await push.register();
        } catch (error) {
          registerRequested = false;
          throw error;
        }
      }
    } catch (error) {
      lastError = error?.message || String(error);
      status = 'registration_error';
      emit('powderline:fcm-registration-error', {message: lastError});
    }
    return snapshot();
  }

  window.PowderlinePushNotifications = {
    initialize: () => registerWithPermission({request: false}),
    requestPermissionAndRegister: () => registerWithPermission({request: true}),
    showForegroundNotification,
    getState: snapshot
  };

  // Register without prompting when the user has already granted notification permission.
  void window.PowderlinePushNotifications.initialize();
})();
