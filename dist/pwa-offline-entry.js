/* PWA-only bridge from the existing offline menu to the isolated Kiroro map. */
(() => {
  'use strict';

  const capacitor = window.Capacitor;
  if (capacitor?.isNativePlatform?.() || ['android', 'ios'].includes(capacitor?.getPlatform?.())) return;
  if (/Android.*(?:;\s*wv\)|Version\/4\.0.*Chrome\/)/i.test(navigator.userAgent)) return;
  if (location.origin !== 'https://ygbsss-collab.github.io'
    || !location.pathname.startsWith('/powderline-hokkaido/')) return;

  const regionSelect = document.getElementById('homeRegionSelect');
  const homeList = document.getElementById('homeOfflineRegionList');
  const modalList = document.getElementById('offlineAllRegionList');
  const webNotice = document.getElementById('offlineAllWebNotice');
  if (!regionSelect || !homeList || !modalList || !webNotice) return;

  const kiroroUrl = new URL('./pwa-kiroro-offline.html', location.href).href;
  const makeLink = label => {
    const link = document.createElement('a');
    link.href = kiroroUrl;
    link.className = 'home-offline-all-btn';
    link.textContent = label;
    link.style.textDecoration = 'none';
    return link;
  };
  const homeLink = makeLink('키로로 PWA 지도 다운로드 / 관리');
  homeList.insertAdjacentElement('afterend', homeLink);
  const unsupportedNote = document.createElement('p');
  unsupportedNote.className = 'home-offline-region-empty';
  unsupportedNote.textContent = 'PWA 오프라인 지도는 현재 키로로만 지원합니다. 다른 지역은 Android 앱에서 다운로드할 수 있습니다.';
  homeLink.insertAdjacentElement('afterend', unsupportedNote);
  const modalLink = makeLink('키로로 PWA 지도 다운로드 / 관리');
  webNotice.insertAdjacentElement('afterend', modalLink);
  const noticeText = webNotice.querySelector('span:last-child');
  if (noticeText) noticeText.textContent = 'PWA 오프라인 지도는 키로로만 지원합니다. 다른 지역은 Android 앱에서 다운로드할 수 있습니다.';

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function syncList(list) {
    for (const item of list.querySelectorAll('[data-offline-region-id]')) {
      const kiroro = item.dataset.offlineRegionId === 'kiroro';
      const button = item.querySelector('[data-offline-region-download], [data-pwa-kiroro-download]');
      const state = item.querySelector('.home-offline-region-state, .offline-all-state');
      const stateText = state?.querySelector('span:last-child') || state;
      if (kiroro) {
        // app.js marks the state 'complete' once the saved pack is verified (offline map selectable on the main map)
        const saved = Boolean(state?.classList.contains('complete'));
        if (button) {
          button.removeAttribute('data-offline-region-download');
          button.setAttribute('data-pwa-kiroro-download', '');
          button.disabled = false;
          setText(button, saved ? '저장 관리' : 'PWA 지도 다운로드');
        }
        setText(stateText, saved ? '다운로드 완료 · 오프라인 지도 선택 가능' : 'PWA 지도 · 저장 화면에서 상태 확인');
      } else {
        if (button) {
          button.removeAttribute('data-offline-region-download');
          button.disabled = true;
          setText(button, 'PWA 미지원');
        }
        setText(stateText, 'PWA 미지원 · Android 앱에서 다운로드 가능');
      }
    }
  }

  function sync() {
    syncList(homeList);
    syncList(modalList);
    const selected = regionSelect.value;
    const homeHasKiroroButton = Boolean(homeList.querySelector('[data-offline-region-id="kiroro"] [data-pwa-kiroro-download]'));
    homeLink.style.display = selected === 'kiroro' && !homeHasKiroroButton ? 'flex' : 'none';
    unsupportedNote.style.display = selected && selected !== 'kiroro'
      && !homeList.querySelector('[data-offline-region-id]') ? 'block' : 'none';
    webNotice.hidden = false;
  }

  const openKiroro = event => {
    if (!event.target.closest('[data-pwa-kiroro-download]')) return;
    location.assign(kiroroUrl);
  };
  homeList.addEventListener('click', openKiroro);
  modalList.addEventListener('click', openKiroro);
  regionSelect.addEventListener('change', sync);
  new MutationObserver(sync).observe(homeList, { childList: true });
  new MutationObserver(sync).observe(modalList, { childList: true });
  sync();
})();
