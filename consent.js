/* ResBizAI consent notice.
   Tells visitors what is collected before analytics runs, records their choice,
   and holds Google Analytics until consent is given (Google Consent Mode v2).
   Drop-in: <script src="/consent.js" defer></script> */
(function () {
  'use strict';

  var KEY = 'rb_consent_v1';
  var POLICY = '/privacy';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        analytics: !!state.analytics,
        at: new Date().toISOString(),
        v: 1
      }));
    } catch (e) {}
  }

  /* ---- Google Consent Mode v2: deny until the visitor decides -------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  var prior = read();
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: prior && prior.analytics ? 'granted' : 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });
  function grant(on) {
    gtag('consent', 'update', { analytics_storage: on ? 'granted' : 'denied' });
  }

  /* ---- styles -------------------------------------------------------- */
  function css() {
    if (document.getElementById('rb-consent-css')) return;
    var s = document.createElement('style');
    s.id = 'rb-consent-css';
    s.textContent =
      '.rbc{position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#fffdf9;' +
      'border-top:1px solid #efe6db;box-shadow:0 -6px 30px rgba(42,30,26,.13);' +
      'padding:18px 22px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;' +
      'transform:translateY(110%);transition:transform .34s cubic-bezier(.22,1,.36,1)}' +
      '.rbc.in{transform:none}' +
      '.rbc-in{max-width:1080px;margin:0 auto;display:flex;gap:20px;align-items:center;flex-wrap:wrap}' +
      '.rbc-tx{flex:1;min-width:260px;font-size:13.5px;line-height:1.62;color:#5c4d42}' +
      '.rbc-tx b{color:#2a1e1a;display:block;font-size:14.5px;margin-bottom:4px}' +
      '.rbc-tx a{color:#ff4f2e;font-weight:600}' +
      '.rbc-btns{display:flex;gap:9px;flex-wrap:wrap;align-items:center}' +
      '.rbc-b{border:none;font-family:inherit;font-size:13.5px;font-weight:700;padding:11px 20px;' +
      'border-radius:9px;cursor:pointer;white-space:nowrap}' +
      '.rbc-b.y{background:#ff4f2e;color:#fff}.rbc-b.y:hover{background:#e8401f}' +
      '.rbc-b.n{background:#fff;color:#5c4d42;border:1px solid #e2d4c4}' +
      '.rbc-b.n:hover{border-color:#c4b3a3}' +
      '.rbc-more{background:none;border:none;color:#8a7a6c;font-size:12.5px;text-decoration:underline;' +
      'cursor:pointer;font-family:inherit;padding:4px}' +
      '.rbc-det{display:none;max-width:1080px;margin:14px auto 0;padding-top:14px;' +
      'border-top:1px solid #f0e6da;font-size:12.5px;line-height:1.65;color:#7a6a5d}' +
      '.rbc-det.on{display:block}' +
      '.rbc-det b{color:#2a1e1a}' +
      '.rbc-det ul{margin:8px 0 0;padding-left:18px}.rbc-det li{margin-bottom:5px}' +
      '@media(max-width:640px){.rbc{padding:16px 16px calc(16px + env(safe-area-inset-bottom))}' +
      '.rbc-in{gap:14px}.rbc-btns{width:100%}.rbc-b{flex:1;text-align:center}}';
    document.head.appendChild(s);
  }

  /* ---- banner -------------------------------------------------------- */
  function show() {
    css();
    var el = document.createElement('div');
    el.className = 'rbc';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Privacy and cookies');
    el.innerHTML =
      '<div class="rbc-in">' +
        '<div class="rbc-tx"><b>We use cookies and collect some information</b>' +
        'We use essential cookies to keep the site working, and analytics to understand how it is used ' +
        'so we can improve it. You choose whether analytics runs. Read our ' +
        '<a href="' + POLICY + '">privacy policy</a>. ' +
        '<button class="rbc-more" id="rbc-more">What is collected?</button></div>' +
        '<div class="rbc-btns">' +
          '<button class="rbc-b n" id="rbc-no">Essential only</button>' +
          '<button class="rbc-b y" id="rbc-yes">Accept all</button>' +
        '</div>' +
      '</div>' +
      '<div class="rbc-det" id="rbc-det">' +
        '<b>Essential (always on)</b> &mdash; sign-in session, your saved preferences, and security. ' +
        'The site cannot work without these.' +
        '<ul>' +
          '<li><b>Analytics (your choice)</b> &mdash; Google Analytics records pages viewed, ' +
          'approximate region, device type and referring site. It is used to improve the product. ' +
          'We do not sell this data.</li>' +
          '<li><b>Your restaurant data</b> &mdash; anything you enter in the app (inventory, sales, ' +
          'staff, menus) is stored to run your account. It is yours, it is never sold, and it is not ' +
          'used to advertise to you.</li>' +
          '<li><b>Your rights</b> &mdash; you can ask us what we hold, correct it, or have it deleted. ' +
          'Contact details are in the <a href="' + POLICY + '">privacy policy</a>.</li>' +
        '</ul>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });

    document.getElementById('rbc-more').onclick = function () {
      var d = document.getElementById('rbc-det');
      d.classList.toggle('on');
      this.textContent = d.classList.contains('on') ? 'Hide details' : 'What is collected?';
    };
    function close(analytics) {
      write({ analytics: analytics });
      grant(analytics);
      el.classList.remove('in');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 380);
    }
    document.getElementById('rbc-yes').onclick = function () { close(true); };
    document.getElementById('rbc-no').onclick = function () { close(false); };
  }

  /* Let anyone re-open their choice from a footer link. */
  window.rbConsentReopen = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (!document.querySelector('.rbc')) show();
  };

  if (!prior) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 900); });
    } else { setTimeout(show, 900); }
  }
})();
