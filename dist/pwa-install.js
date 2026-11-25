/* POWDERLINE login screen: app install cards (Android APK download | iPhone home screen guide).
 * Shown only in an iOS / Android mobile browser that is not already running as the installed PWA.
 * Hidden in the Android app (Capacitor / WebView), in PC browsers and in the installed PWA.
 * Android card: plain link to the latest GitHub Release asset (POWDERLINE.apk).
 * iPhone card: illustrated "공유 → 홈 화면에 추가 → 추가" guide (Add to Home Screen has no API).
 * Independent of login / auth. The Android app's own update check lives in app-update.js. */
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var cap = window.Capacitor, platform = cap && cap.getPlatform ? cap.getPlatform() : '';
  var nativeApp = !!(cap && ((cap.isNativePlatform && cap.isNativePlatform()) || platform === 'android' || platform === 'ios'))
    || /Android.*(?:;\s*wv\)|Version\/4\.0.*Chrome\/)/i.test(ua); // Android app WebView (same check as pwa-offline-store.js)
  // iPadOS 13+ reports a Mac user agent; a Mac with touch points is an iPad.
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var installed = false;

  function standalone() {
    var mm = window.matchMedia;
    return navigator.standalone === true || !!(mm && (mm('(display-mode: standalone)').matches
      || mm('(display-mode: fullscreen)').matches || mm('(display-mode: minimal-ui)').matches));
  }
  // Only iOS / Android mobile browsers; never the Android app, PC browsers or the installed PWA.
  function eligible() { return !nativeApp && (isIOS || isAndroid) && !standalone() && !installed; }

  window.addEventListener('appinstalled', function () { installed = true; closeModal(); refresh(); });

  var cards, iosCard, modal, lastFocus = null;

  // The matching styles.css sets --pwa-install-styled on the cards. A new index.html served with an older cached
  // styles.css (service worker update still pending) lacks it: keep the cards hidden instead of bare browser buttons.
  function styled() {
    try { return getComputedStyle(cards).getPropertyValue('--pwa-install-styled').trim() === '1'; } catch (e) { return false; }
  }
  function refresh() { if (cards) cards.hidden = !(eligible() && styled()); }

  function openModal() {
    lastFocus = document.activeElement;
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
    if (!cards || !iosCard || !modal) return;
    iosCard.addEventListener('click', openModal);
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-pwa-install-close]')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    var mq = window.matchMedia && window.matchMedia('(display-mode: standalone)');
    if (mq) { var onMq = function () { refresh(); }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
