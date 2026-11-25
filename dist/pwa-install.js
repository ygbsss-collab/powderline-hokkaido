/* POWDERLINE login screen: app install cards (Android APK download | iPhone home screen guide).
 * Shown only in an iOS / Android mobile browser (including in-app browsers such as KakaoTalk) that is not already
 * running as the installed PWA. Hidden in the POWDERLINE app (Capacitor), in PC browsers and in the installed PWA.
 * Android card: plain link to the latest GitHub Release asset (POWDERLINE.apk).
 * iPhone card: illustrated Safari "홈 화면에 추가" guide (Add to Home Screen has no API).
 * In-app browsers: iPhone -> open in Safari, Android -> open in Chrome when the APK download is blocked.
 * Independent of login / auth. The Android app's own update check lives in app-update.js. */
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  // The POWDERLINE app is detected by Capacitor only: its bridge (window.Capacitor) is injected at document start
  // (or into the served HTML on old WebViews), so it exists before this script runs. A plain Android WebView
  // ("; wv)" / "Version/4.0") is NOT the app: KakaoTalk and other in-app browsers use the same system WebView.
  var cap = window.Capacitor, platform = cap && cap.getPlatform ? cap.getPlatform() : '';
  var nativeApp = !!(cap && ((cap.isNativePlatform && cap.isNativePlatform()) || platform === 'android' || platform === 'ios'));
  // iPadOS 13+ reports a Mac user agent; a Mac with touch points is an iPad.
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var isKakao = /KAKAOTALK/i.test(ua);
  // In-app browsers (no Add to Home Screen on iOS, downloads may be blocked on Android).
  var inApp = isKakao || /NAVER\(inapp|Line\/|FBAN|FBAV|Instagram|DaumApps|everytimeApp|BAND\/|Whale\/.*inapp/i.test(ua)
    || (isAndroid && /;\s*wv\)/i.test(ua))
    || (isIOS && !/Safari\//i.test(ua));
  var installed = false;

  function standalone() {
    var mm = window.matchMedia;
    return navigator.standalone === true || !!(mm && (mm('(display-mode: standalone)').matches
      || mm('(display-mode: fullscreen)').matches || mm('(display-mode: minimal-ui)').matches));
  }
  // Only iOS / Android mobile browsers; never the POWDERLINE app, PC browsers or the installed PWA.
  function eligible() { return !nativeApp && (isIOS || isAndroid) && !standalone() && !installed; }

  window.addEventListener('appinstalled', function () { installed = true; closeModal(); refresh(); });

  var cards, iosCard, modal, inAppHint, inAppNotice, lastFocus = null;

  // The matching styles.css sets --pwa-install-styled on the cards. A new index.html served with an older cached
  // styles.css (service worker update still pending) lacks it: keep the cards hidden instead of bare browser buttons.
  function styled() {
    try { return getComputedStyle(cards).getPropertyValue('--pwa-install-styled').trim() === '1'; } catch (e) { return false; }
  }
  function refresh() {
    if (!cards) return;
    cards.hidden = !(eligible() && styled());
    // Android in-app browser: the APK download may be blocked there -> hint to open the page in Chrome.
    if (inAppHint) inAppHint.hidden = cards.hidden || !(isAndroid && inApp);
  }

  // KakaoTalk opens a URL in the device's default browser with this scheme (Android and iOS).
  function kakaoExternalUrl() { return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); }
  function setupExternalButtons() {
    var btns = document.querySelectorAll('[data-open-external]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].hidden = !isKakao;
      btns[i].addEventListener('click', function () { location.href = kakaoExternalUrl(); });
    }
  }

  function openModal() {
    lastFocus = document.activeElement;
    if (inAppNotice) inAppNotice.hidden = !(isIOS && inApp);
    modal.hidden = false;
    var close = modal.querySelector('.pwa-install-close-btn');
    if (close) close.focus();
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function init() {
    cards = document.getElementById('appInstallCards');
    iosCard = document.getElementById('appInstallIosCard');
    modal = document.getElementById('pwaInstallModal');
    inAppHint = document.getElementById('appInstallInAppHint');
    inAppNotice = document.getElementById('pwaInstallInAppNotice');
    if (!cards || !iosCard || !modal) return;
    iosCard.addEventListener('click', openModal);
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-pwa-install-close]')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    setupExternalButtons();
    var mq = window.matchMedia && window.matchMedia('(display-mode: standalone)');
    if (mq) { var onMq = function () { refresh(); }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
