// POWDERLINE PWA only: device notification test (local notification through the Service Worker, no server push).
// Loaded only by the PWA block at the end of index.html (never in the Capacitor Android app); it re-checks that here.
(() => {
  const capacitor = window.Capacitor;
  const platform = capacitor?.getPlatform?.();
  if (capacitor?.isNativePlatform?.() || platform === 'android' || platform === 'ios') return;
  if (/Android.*(?:;\s*wv\)|Version\/4\.0.*Chrome\/)/i.test(navigator.userAgent)) return;
  if (!('serviceWorker' in navigator)) return;
  if (document.getElementById('pwaNotifyTestBtn')) return;

  const TITLE = 'POWDERLINE';
  const BODY = '알림 기능이 정상 작동합니다.';
  const DEFAULT_HINT = '이 기기에서 테스트 알림 표시';

  // Same row look as the existing account settings rows; appended to that list (DOM only, no HTML file change).
  const anchor = document.getElementById('stitchBtnChangeProfileImage');
  const list = anchor?.parentElement;
  if (!list) return;
  const button = document.createElement('button');
  button.id = 'pwaNotifyTestBtn';
  button.type = 'button';
  button.className = anchor.className;
  button.innerHTML =
    '<div class="flex items-center gap-space-sm">' +
      '<div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary-container">' +
        '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">notifications</span>' +
      '</div>' +
      '<div>' +
        '<span class="font-body-md text-body-md text-on-surface block">알림 테스트</span>' +
        '<span id="pwaNotifyTestStatus" class="font-body-sm text-body-sm text-outline" role="status" aria-live="polite"></span>' +
      '</div>' +
    '</div>' +
    '<span class="material-symbols-outlined text-outline group-hover:text-on-surface group-hover:translate-x-0.5 transition-all text-[20px]" aria-hidden="true">chevron_right</span>';
  list.appendChild(button);
  const status = button.querySelector('#pwaNotifyTestStatus');
  const setStatus = text => { if (status) status.textContent = text; };
  setStatus(DEFAULT_HINT);

  // serviceWorker.ready never settles when no worker is registered: give up after a few seconds.
  const readyRegistration = () => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SW_TIMEOUT')), 5000))
  ]);

  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') {
      setStatus('이 브라우저는 알림을 지원하지 않습니다. (iPhone은 홈 화면에 추가한 앱에서만 지원)');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('알림이 차단되어 있습니다. 브라우저 사이트 설정에서 알림을 허용해 주세요.');
      return;
    }
    busy = true;
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied'
          ? '알림 권한이 거부되었습니다. 브라우저 사이트 설정에서 허용할 수 있습니다.'
          : '알림 권한이 허용되지 않았습니다.');
        return;
      }
      const registration = await readyRegistration();
      if (typeof registration?.showNotification !== 'function') throw new Error('SW_NO_NOTIFICATION');
      await registration.showNotification(TITLE, {
        body: BODY,
        icon: './assets/pwa-icon-192.png',
        badge: './assets/pwa-icon-192.png',
        tag: 'powderline-test',
        renotify: true
      });
      setStatus('테스트 알림을 보냈습니다.');
    } catch (error) {
      console.warn('PWA notification test failed:', error);
      setStatus(error?.message === 'SW_TIMEOUT'
        ? '앱 서비스 워커가 준비되지 않았습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
        : '알림을 표시하지 못했습니다.');
    } finally {
      busy = false;
    }
  });
})();
