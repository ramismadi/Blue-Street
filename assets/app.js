/* Blue Street — premium desk renderer. Plain static JS, no build step.
   Tabbed views (hash-routed: #today, #story, #story/2, #engine, #positioning, #banks,
   #calendar, #news), a theme picker, and edition data (story, macro engine,
   developing stories, news) from local JSON files. textContent-only DOM, no HTML injection. */

(function () {
  'use strict';

  /* Must equal the ?v= on app.js in index.html — bump both together. */
  var ASSET_VERSION = '85';

  var TABS = ['today', 'story', 'fx', 'engine', 'positioning', 'banks', 'calendar', 'news', 'learn'];   // views
  /* Rami, 2026-10-18: five tabs, one question each. Views without a tab of
     their own light up their parent: Story lives under Today; the macro
     engine, positioning and central banks are the three Drivers sections. */
  var TAB_PARENT = { story: 'today', engine: 'drivers', positioning: 'drivers', banks: 'drivers', learn: null };
  var DRIVER_VIEWS = ['engine', 'positioning', 'banks'];
  /* Theme catalogue. `sw` = swatch preview colors [background, accent, highlight].
     Token values live in style.css under [data-theme="<id>"]. */
  var THEMES = [
    { id: 'blue',      name: 'Blue Street', desc: 'Brand blue & ivory',  sw: ['#f6f2ea', '#0a84ff', '#f6f2ea'] },
    { id: 'ivory',     name: 'Ivory',     desc: 'Navy & brass',           sw: ['#f6f2ea', '#1f3a5f', '#a07a32'] },
    { id: 'sage',      name: 'Sage',      desc: 'Forest & sand',          sw: ['#f2f4ef', '#2f5d4a', '#c9ad7f'] },
    { id: 'claret',    name: 'Claret',    desc: 'Burgundy & cream',       sw: ['#f7f3ef', '#6e1f30', '#a8803c'] },
    { id: 'pearl',     name: 'Pearl',     desc: 'Black & champagne',      sw: ['#f5f3ee', '#151515', '#b8964f'] },
    { id: 'night',     name: 'Night',     desc: 'Brand blue after dark', sw: ['#0a0f1a', '#0a84ff', '#f6f2ea'], dark: true },
    { id: 'ink',       name: 'Ink',       desc: 'Ink, ivory & copper',    sw: ['#131a26', '#e9dcbc', '#cf9259'], dark: true },
    { id: 'forest',    name: 'Forest',    desc: 'Dark green & brass',     sw: ['#0e1714', '#9fd0b5', '#d2b072'], dark: true },
    { id: 'velvet',    name: 'Velvet',    desc: 'Oxblood, rosé & gold',   sw: ['#1e1216', '#e8a9a0', '#d6ad62'], dark: true },
    { id: 'onyx',      name: 'Onyx',      desc: 'Black & champagne',      sw: ['#0f0f10', '#e2c98f', '#6cc794'], dark: true }
  ];
  /* Four colorways, each a light + dark pair; the masthead toggle flips
     between the two, the menu picks the colorway. */
  var COLORWAYS = [
    { light: 'blue',   dark: 'night',  desc: 'Blue Street blue & ivory' },
    { light: 'ivory',  dark: 'ink',    desc: 'Navy, ivory & brass' },
    { light: 'sage',   dark: 'forest', desc: 'Green & sand' },
    { light: 'claret', dark: 'velvet', desc: 'Burgundy, ros\u00e9 & gold' },
    { light: 'pearl',  dark: 'onyx',   desc: 'Black & champagne' }
  ];
  function colorwayOf(id) {
    for (var i = 0; i < COLORWAYS.length; i++) if (COLORWAYS[i].light === id || COLORWAYS[i].dark === id) return COLORWAYS[i];
    return COLORWAYS[0];
  }
  var story = null;      // story.json, once loaded
  var chapterIdx = 0;    // chapter shown in the Story tab

  document.addEventListener('DOMContentLoaded', init);

  /* Loading splash (brand sign on blue): hides once the edition renders,
     never earlier than 350 ms (no flash) or later than 2.5 s. */
  var splashT0 = Date.now();
  function hideSplash() {
    var sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('out')) return;
    setTimeout(function () {
      sp.classList.add('out');
      setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 400);
    }, Math.max(0, 350 - (Date.now() - splashT0)));
  }
  setTimeout(hideSplash, 2500);

  function init() {
    checkFreshness();
    watchUpdates();
    initTheme();
    initSideNav();
    initTabs();
    startClock();
    initScrollStory();

    // Plain-words text lives in data/words.json (Claude's file); Herc's files
    // keep the numbers. words.json loads first and is merged in on render.
    var wordsP = fetchJSON('data/words.json').catch(function () { return {}; });
    function withWords(path, kind) {
      return Promise.all([fetchJSON(path), wordsP]).then(function (r) { return applyWords(kind, r[0], r[1]); });
    }
    withWords('data/story.json', 'story').then(function (d) {
      story = d;
      renderEdition(d);
      hideSplash();
      renderScenes(d);
      renderRail(d);
      renderFocus();
      route();
      renderFx();
    }).catch(function () {
      note('#today-story', 'Story unavailable.');
      note('#chapter-view', 'Story unavailable.');
      setText('#today-headline', 'Edition unavailable');
    });
    initGlossary();
    fetchJSON('data/pillars.json').then(function (d) {
      explainers = d.pillars || null;
      attachExplainers();
    }).catch(function () { /* explainers are optional */ });
    withWords('data/engine.json', 'engine').then(function (d) {
      renderEngine(d);
      renderPulse(d);
    }).catch(function () {
      note('#engine-rows', 'Macro engine data unavailable.');
      note('#today-pulse', 'Macro engine data unavailable.');
    });
    withWords('data/banks.json', 'banks').then(function (d) {
      renderBanks(d);
      (d.banks || []).forEach(function (b) { cal.banks[b.id] = b; });
      renderCalendar();
      renderFx();
    }).catch(function () {
      note('#bank-grid', 'Central bank data unavailable.');
    });
    initCalendar();
    initFx();
    initGlance();
    initFocus();
    initCot();
    withWords('data/currencies.json', 'currencies').then(function (d) {
      fx.data = d;
      renderFx();
      if (story) renderScenes(story);
    }).catch(function () {
      note('#fx-board', 'Currency data unavailable.');
      note('#today-lean', 'Currency data unavailable.');
    });
    // Surprise momentum is optional: until the feed exists the site shows
    // when tracking starts.
    fetchJSON('data/momentum.json').then(function (d) {
      momentum.data = d;
      renderFx();
    }).catch(function () { /* not published yet */ });
    fetchJSON('data/calendar.json').then(function (d) {
      cal.data = d;
      if (d.updated) setText('#cal-updated', fmtDateTime(d.updated, true));
      renderCalendar();
      renderFx();
      renderFocus();
      renderLearn();   // live release numbers on an open explainer
    }).catch(function () {
      note('#cal-list', 'Calendar data unavailable.');
      note('#today-next', 'Calendar data unavailable.');
    });
    fetchJSON('data/latest.json').then(renderWire).catch(function () {
      note('#latest-items', 'Nothing developing right now.');
    });
    initNews();
    fetchJSON('data/news.json').then(function (d) {
      news.data = d;
      renderNews();
      if (story) renderScenes(story);
      renderFx();   // "In the news" on currency pages
    }).catch(function () {
      note('#news-grid', 'News feed unavailable.');
    });
  }

  /* Self-update: home-screen web apps and browser caches can keep serving an
     old index.html (and therefore old assets). Re-fetch the page from the
     network; if it references a newer asset version, reload once. */
  function checkFreshness() {
    if (!window.fetch) return;
    fetch('index.html', { cache: 'reload' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      var m = /assets\/app\.js\?v=([\w.-]+)/.exec(html);
      if (!m || m[1] === ASSET_VERSION) return;
      var key = 'bluestreet-reloaded-' + m[1];
      try {
        if (sessionStorage.getItem(key)) return; // already tried once
        sessionStorage.setItem(key, '1');
      } catch (e) { return; }
      location.reload();
    }).catch(function () { /* offline — keep the current page */ });
  }

  /* words.json (Rami, 2026-10-19): the plain-words layer. Hercules writes the
     figures; Claude writes what they mean, in a file Herc never touches, so a
     data refresh can't put the number-heavy text back. Each section carries
     the date it was written for and only applies to data from that date or
     earlier — if Herc's file is newer, the page falls back to his text
     (still trimmed by the render clamps). */
  function wordsDay(t) { return String(t || '').slice(0, 10); }
  function applyWords(kind, d, w) {
    var sec = w && w[kind];
    if (!sec || !d) return d;
    // Rami, 2026-10-19: Claude owns the hawkish/neutral/dovish label (a judgment, not data).
    // It applies whatever day the data file is from; Herc no longer writes `bias`.
    if (kind === 'banks') {
      (d.banks || []).forEach(function (b) {
        var bx = sec.banks && sec.banks[b.id];
        if (bx && bx.bias) b.bias = bx.bias;
      });
    }
    var srcDay = wordsDay(kind === 'story' ? d.date : d.updated);
    if (sec.as_of && srcDay && srcDay > sec.as_of) return d;
    if (kind === 'story') {
      if (sec.headline) d.headline = sec.headline;
    } else if (kind === 'engine') {
      (d.rows || []).forEach(function (r) {
        if (sec.reads && sec.reads[r.id]) r.read = sec.reads[r.id];
      });
    } else if (kind === 'banks') {
      (d.banks || []).forEach(function (b) {
        var x = sec.banks && sec.banks[b.id];
        if (!x) return;
        if (!b.detail && b.priced && x.priced) b.detail = b.priced;
        if (x.summary) b.summary = x.summary;
        if (x.priced) b.priced = x.priced;
        if (x.why) b.why = x.why;       // plain Details text (Rami, 2026-10-19)
        if (x.watch) b.watch = x.watch;
      });
    } else if (kind === 'currencies') {
      // Rami, 2026-10-20: the pair picker and currency pages showed Herc's
      // shorthand driver notes. Claude's plain lines replace them; Herc keeps
      // the scores (which drive the board and the picker).
      (d.currencies || []).forEach(function (c) {
        var x = sec.currencies && sec.currencies[c.ccy];
        if (!x) return;
        if (x.summary) c.summary = x.summary;
        Object.keys(x.notes || {}).forEach(function (k) {
          if (c.drivers && c.drivers[k] && x.notes[k]) c.drivers[k].note = x.notes[k];
        });
      });
    }
    return d;
  }

  /* ---------------- helpers ---------------- */
  var loaded = {};   // path → raw text as rendered (see watchUpdates)
  function fetchJSON(path) {
    return fetch(path, {cache: 'no-store'}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      loaded[path] = t;
      return JSON.parse(t);
    });
  }

  /* Scheduled pushes (2 a.m. edition, 30-min wire, intraday actuals) land
     while the page sits open or a home-screen app waits in the background.
     Every few minutes while visible — and on returning to the page — re-fetch
     the data files and compare with what was rendered. Back after a long
     break: reload straight away. Mid-read: offer a refresh pill instead of
     yanking the page. */
  var CHECK_EVERY = 5 * 60 * 1000, AWAY_RELOAD = 10 * 60 * 1000;
  function watchUpdates() {
    var hiddenAt = 0;
    function check(autoReload) {
      // While a focus event is live, Focus Mode refreshes the wire in place.
      var paths = Object.keys(loaded).filter(function (p) {
        return !(p === 'data/latest.json' && focus.phase === 'live');
      });
      if (!paths.length || !window.fetch) return;
      Promise.all(paths.map(function (p) {
        return fetch(p, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : loaded[p]; })
          .catch(function () { return loaded[p]; });
      })).then(function (texts) {
        var changed = texts.some(function (t, i) { return t !== loaded[paths[i]]; });
        if (!changed) return;
        if (autoReload) location.reload();
        else showUpdatePill();
      });
    }
    setInterval(function () { if (!document.hidden) check(false); }, CHECK_EVERY);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      var away = hiddenAt ? Date.now() - hiddenAt : 0;
      checkFreshness();
      check(away >= AWAY_RELOAD);
    });
  }

  function showUpdatePill() {
    if ($('#update-pill')) return;
    var b = el('button', 'update-pill', 'New update · tap to refresh');
    b.id = 'update-pill';
    b.type = 'button';
    b.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(b);
  }

  function $(sel) { return document.querySelector(sel); }

  function setText(sel, txt) {
    var n = $(sel);
    if (n) n.textContent = txt;
  }

  /* Small DOM helper — textContent only, no HTML injection. */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function note(sel, msg) {
    var t = $(sel);
    if (t) t.appendChild(el('p', 'meta', msg));
  }

  /* Only plain http(s) URLs become links; anything else renders as text. */
  function safeUrl(u) {
    try {
      var x = new URL(u);
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null;
    } catch (e) {
      return null;
    }
  }

  function extLink(label, href) {
    var a = el('a', null, label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  /* Normalise a source field to [{label, url}]. `source` may be a string,
     a {label, url} object, or an array of either; `url` links a single
     string source. */
  function sourceList(source, url) {
    var list = Array.isArray(source) ? source : [source];
    var out = [];
    list.forEach(function (s) {
      if (s == null || s === '') return;
      var label = typeof s === 'object' ? s.label : s;
      if (!label) return;
      var href = safeUrl(typeof s === 'object' ? s.url : (list.length === 1 ? url : null));
      out.push({ label: label, url: href });
    });
    return out;
  }

  /* Compact source chips: each linked source opens the article in a new tab. */
  function sourceChips(source, url) {
    var list = sourceList(source, url);
    var wrap = el('div', 'sources');
    wrap.appendChild(el('span', 'sources-lbl', list.length > 1 ? 'Sources' : 'Source'));
    if (!list.length) wrap.appendChild(el('span', 'chip muted', 'n/a'));
    list.forEach(function (s) {
      var chip;
      if (s.url) {
        chip = extLink(s.label, s.url);
        chip.className = 'chip';
        chip.title = 'Open on ' + new URL(s.url).hostname;
      } else {
        chip = el('span', 'chip muted', s.label);
      }
      wrap.appendChild(chip);
    });
    return wrap;
  }

  /* "2026-10-08T02:00:00-05:00" -> "Oct 8, 2:00 AM CT" */
  function fmtDateTime(iso, withYear) {
    try {
      var o = { timeZone: 'America/Chicago', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit' };
      if (withYear) o.year = 'numeric';
      return new Date(iso).toLocaleString('en-US', o) + ' CT';
    } catch (e) {
      return iso;
    }
  }

  function relTime(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!isFinite(mins) || mins < 0) return fmtDateTime(iso);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 24 * 60) return Math.round(mins / 60) + 'h ago';
    var then = new Date(iso), today = new Date();
    today.setHours(0, 0, 0, 0);
    then.setHours(0, 0, 0, 0);
    var days = Math.round((today - then) / 864e5);
    if (days <= 1) return 'yesterday';
    if (days < 7) return days + 'd ago';
    return fmtDateTime(iso);
  }

  /* ---------------- theme menu (dropdown) ---------------- */
  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  function swatchBg(t) {
    return 'linear-gradient(135deg, ' + t.sw[0] + ' 0 34%, ' + t.sw[1] + ' 34% 67%, ' + t.sw[2] + ' 67%)';
  }

  function initTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    if (!themeById(cur)) cur = 'blue';

    var mode = $('#mode-btn');
    if (mode) mode.addEventListener('click', function () {
      var t = themeById(document.documentElement.getAttribute('data-theme')) || THEMES[0];
      var cw = colorwayOf(t.id);
      applyTheme(t.dark ? cw.light : cw.dark, true);
    });

    var btn = $('#theme-btn'), list = $('#theme-list');
    if (!btn || !list) { applyTheme(cur, false); return; }

    // Menu: the four colorways; picking one keeps the current light/dark mode.
    list.appendChild(el('div', 'tl-group', 'Colorway'));
    COLORWAYS.forEach(function (cw) {
      var item = el('button', 'tl-item');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('data-colorway', cw.light);
      item.appendChild(el('span', 'tm-swatch'));
      var txt = el('span', 'tl-text');
      var nm = el('span', 'tl-name');
      nm.appendChild(el('span', 'tl-cur'));
      nm.appendChild(el('span', 'tl-pair'));
      txt.appendChild(nm);
      txt.appendChild(el('span', 'tl-desc', cw.desc));
      item.appendChild(txt);
      item.appendChild(el('span', 'tl-check', '✓'));
      list.appendChild(item);
    });
    applyTheme(cur, false);

    function items() { return Array.prototype.slice.call(list.querySelectorAll('.tl-item')); }
    function open() {
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var sel = list.querySelector('[aria-checked="true"]') || items()[0];
      if (sel) sel.focus();
    }
    function close(refocus) {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    }

    btn.addEventListener('click', function () { if (list.hidden) open(); else close(false); });
    list.addEventListener('click', function (e) {
      var it = e.target.closest('.tl-item');
      if (!it) return;
      var cw = colorwayOf(it.getAttribute('data-colorway'));
      var dark = !!(themeById(document.documentElement.getAttribute('data-theme')) || {}).dark;
      applyTheme(dark ? cw.dark : cw.light, true);
      close(true);
    });
    list.addEventListener('keydown', function (e) {
      var all = items(), i = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var n = all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
        if (n) n.focus();
        e.preventDefault();
      } else if (e.key === 'Home' || e.key === 'End') {
        all[e.key === 'Home' ? 0 : all.length - 1].focus();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        close(true);
      } else if (e.key === 'Tab') {
        close(false);
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#theme-menu')) close(false);
    });
  }

  function applyTheme(id, save) {
    var t = themeById(id) || THEMES[0];
    var cw = colorwayOf(t.id), dark = !!t.dark;
    var root = document.documentElement;
    root.setAttribute('data-theme', t.id);
    root.setAttribute('data-mode', dark ? 'dark' : 'light');
    var btn = $('#theme-btn');
    if (btn) {
      btn.setAttribute('aria-label', 'Colorway: ' + t.name);
      btn.title = 'Colorway: ' + t.name;
    }
    var mode = $('#mode-btn');
    if (mode) {
      mode.setAttribute('aria-pressed', dark ? 'true' : 'false');
      var other = themeById(dark ? cw.light : cw.dark);
      mode.title = 'Switch to ' + (dark ? 'light' : 'dark') + ' mode (' + (other ? other.name : '') + ')';
    }
    var sw = $('#theme-swatch');
    if (sw) sw.style.background = swatchBg(t);
    Array.prototype.forEach.call(document.querySelectorAll('.tl-item'), function (b) {
      var c = colorwayOf(b.getAttribute('data-colorway'));
      var shown = themeById(dark ? c.dark : c.light), pair = themeById(dark ? c.light : c.dark);
      b.querySelector('.tm-swatch').style.background = swatchBg(shown);
      b.querySelector('.tl-cur').textContent = shown.name;
      b.querySelector('.tl-pair').textContent = ' · ' + pair.name;
      b.setAttribute('aria-checked', c === cw ? 'true' : 'false');
    });
    if (save) {
      try { localStorage.setItem('bluestreet-theme', t.id); } catch (e) { /* private mode */ }
    }
    syncSideTheme();
    // The phone's status-bar strip follows the theme's masthead colour.
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', (getComputedStyle(root).getPropertyValue('--mast-1') || '#0a84ff').trim());
  }

  /* ---------------- tabs / routing ---------------- */
  function initTabs() {
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    // Home links (wordmark, Today tab) go to the clean site URL, no #today.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-home]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (location.hash) history.pushState(null, '', location.pathname + location.search);
      route();
    });
    var bar = $('#tabs');
    // Arrow-key navigation between tabs.
    bar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(bar.querySelectorAll('[role=tab]'));
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
      e.preventDefault();
    });
    route();
  }

  function route() {
    var h = (location.hash || '#today').slice(1).split('/');
    if (h[0] === 'wire' || h[0] === 'flash') {   // Wire → Flash (2026-10-09) → merged into News (2026-10-18)
      h[0] = 'news';
      history.replaceState(null, '', '#' + h.join('/'));
    }
    if (h[0] === 'drivers') {   // the tab opens the Drivers section last read
      var last = 'engine';
      try { last = localStorage.getItem('bluestreet-driver') || 'engine'; } catch (e) { /* private mode */ }
      h = [DRIVER_VIEWS.indexOf(last) >= 0 ? last : 'engine'];
      history.replaceState(null, '', '#' + h[0]);
    }
    var tab = TABS.indexOf(h[0]) >= 0 ? h[0] : 'today';
    var parent = tab in TAB_PARENT ? TAB_PARENT[tab] : tab;
    TABS.forEach(function (t) { var v = $('#view-' + t); if (v) v.hidden = t !== tab; });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs [role=tab]'), function (a) {
      var on = a.getAttribute('data-tab') === parent;
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.tabIndex = on ? 0 : -1;
    });
    var dn = $('#drivers-nav');
    if (dn) {
      dn.hidden = DRIVER_VIEWS.indexOf(tab) < 0;
      Array.prototype.forEach.call(dn.querySelectorAll('[data-view]'), function (a) {
        var on = a.getAttribute('data-view') === tab;
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      if (!dn.hidden) { try { localStorage.setItem('bluestreet-driver', tab); } catch (e) { /* private mode */ } }
    }
    if (tab === 'story' && story) {
      var n = parseInt(h[1], 10);
      showChapter(isFinite(n) ? n - 1 : chapterIdx);
    }
    if (tab === 'fx') {
      fx.focus = (h[1] || '').toUpperCase();
      renderFx();
    }
    if (tab === 'learn') renderLearn();
    if (tab === 'news') {
      var nm = (h[1] || '').toUpperCase();
      news.ccy = NEWS_MKTS.indexOf(nm) >= 0 ? nm : '';
      renderNews();
      if (news.pending) {
        var pid = news.pending; news.pending = null;
        setTimeout(function () { var c = document.getElementById('news-' + pid); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
      }
    }
    if (tab === 'positioning') {
      cot.focus = (h[1] || '').toUpperCase();
      renderCot();
    }
    updateSideNav(tab, parent);
    var active = $('#tab-' + (parent || tab));
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo(0, 0);
    // Redraw the scroll-driven scenes now: returning to Today at scroll 0 fires no scroll event,
    // so it would otherwise keep its stale faded-out state until the next scroll.
    measureScenes();
    queueScroll();
  }

  /* ---------------- side menu (optional layout) ----------------
     Rami, 2026-10-18: the same sections can sit in a collapsible side menu
     instead of the top tab bar. Choice saved per browser:
     localStorage bluestreet-nav = top|side, bluestreet-nav-collapsed = 1.
     Wide screens: a fixed rail (full or icons-only). Narrow screens: a
     drawer that slides in from the masthead button. */
  var NAV_ITEMS = [
    { id: 'today', label: 'Today', href: './', home: true, badge: 'focus-badge',
      ico: 'M3 3h10v10H3z M5.5 6h5 M5.5 8.5h5 M5.5 11h3' },
    { id: 'fx', label: 'Currencies', href: '#fx',
      ico: 'M6 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z M10 4.6a3.5 3.5 0 1 1 0 6.8' },
    { id: 'drivers', label: 'Drivers', href: '#drivers',
      ico: 'M2.5 11.5a5.5 5.5 0 1 1 11 0 M8 11.5l2.6-3.6',
      subs: [['engine', 'Macro engine'], ['positioning', 'Positioning'], ['banks', 'Central banks']] },
    { id: 'news', label: 'News', href: '#news',
      ico: 'M2.5 4.5h9v8h-9z M11.5 6.5h2v5a1 1 0 0 1-2 0 M4.5 6.5h5 M4.5 8.5h5 M4.5 10.5h3' },
    { id: 'calendar', label: 'Calendar', href: '#calendar',
      ico: 'M2.5 4h11v9.5h-11z M2.5 7h11 M5.5 2.5v3 M10.5 2.5v3' },
    { id: 'learn', label: 'Learn', href: '#learn', minor: true,
      ico: 'M2.5 3.5H7a1.5 1.5 0 0 1 1 .5v9a1.5 1.5 0 0 0-1-.5H2.5z M13.5 3.5H9a1.5 1.5 0 0 0-1 .5v9a1.5 1.5 0 0 1 1-.5h4.5z' }
  ];
  var nav = { mode: 'top', collapsed: false };
  function navIcon(d) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'sn-ico');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }
  function isNarrow() { return window.matchMedia && window.matchMedia('(max-width: 980px)').matches; }
  function initSideNav() {
    try {
      nav.mode = localStorage.getItem('bluestreet-nav') === 'side' ? 'side' : 'top';
      nav.collapsed = localStorage.getItem('bluestreet-nav-collapsed') === '1';
    } catch (e) { /* private mode */ }
    // The top tab bar gets the same icons as the side menu (Rami, 2026-10-19).
    NAV_ITEMS.forEach(function (it) {
      var tab = document.querySelector('#tabs [data-tab="' + it.id + '"]');
      if (tab && !tab.querySelector('.sn-ico')) tab.insertBefore(navIcon(it.ico), tab.firstChild);
    });
    var box = $('#sidenav');
    if (!box) return;
    // Brand symbol at the top of the menu (links home).
    var logo = el('a', 'sn-logo');
    logo.href = './';
    logo.setAttribute('data-home', '');
    logo.setAttribute('aria-label', 'Blue Street — back to Today');
    var NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
    sv.setAttribute('viewBox', '84 80 362 352');
    sv.setAttribute('class', 'sn-mark');
    sv.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(NS, 'rect');
    [['x', 92], ['y', 88], ['width', 30], ['height', 336], ['rx', 15]].forEach(function (a) { r.setAttribute(a[0], a[1]); });
    var pa = document.createElementNS(NS, 'path');
    pa.setAttribute('d', 'M108 150 H384 L438 210 L384 270 H108 Z');
    pa.setAttribute('stroke-width', '14');
    pa.setAttribute('stroke-linejoin', 'round');
    sv.appendChild(r); sv.appendChild(pa);
    logo.appendChild(sv);
    var wm = el('span', 'sn-label sn-brand', 'BLUE');
    wm.setAttribute('aria-label', 'Blue Street');
    var st = el('span', 'wm-st', 'ST');
    st.setAttribute('aria-hidden', 'true');
    wm.appendChild(st);
    logo.appendChild(wm);
    box.appendChild(logo);
    var list = el('nav', 'sn-list');
    NAV_ITEMS.forEach(function (it) {
      var a = el('a', 'sn-item' + (it.minor ? ' minor' : ''));
      a.href = it.href;
      if (it.home) a.setAttribute('data-home', '');
      a.setAttribute('data-nav', it.id);
      a.title = it.label;
      a.appendChild(navIcon(it.ico));
      a.appendChild(el('span', 'sn-label', it.label));
      if (it.badge) {
        var b = el('span', 'badge sn-badge');
        b.setAttribute('data-mirror', it.badge);
        b.hidden = true;
        a.appendChild(b);
      }
      list.appendChild(a);
      if (it.subs) {
        var sub = el('div', 'sn-subs');
        it.subs.forEach(function (sv) {
          var sa = el('a', 'sn-sub', sv[1]);
          sa.href = '#' + sv[0];
          sa.setAttribute('data-nav-sub', sv[0]);
          sub.appendChild(sa);
        });
        list.appendChild(sub);
      }
    });
    box.appendChild(list);
    var foot = el('div', 'sn-foot');
    var col = el('button', 'sn-btn sn-collapse');
    col.type = 'button';
    col.appendChild(navIcon('M10 4l-4 4 4 4'));
    col.appendChild(el('span', 'sn-label', 'Collapse'));
    col.addEventListener('click', function () { setNav('side', !nav.collapsed); });
    var top = el('button', 'sn-btn sn-top');
    top.type = 'button';
    top.appendChild(navIcon('M2.5 3.5h11 M2.5 6.5h11 M5 9.5l3 3 3-3'));
    top.appendChild(el('span', 'sn-label', 'Tabs on top'));
    top.title = 'Move the sections back to the top bar';
    top.addEventListener('click', function () {
      if (nav.mode === 'side') setNav('top', nav.collapsed);
      else { openDrawer(false); setNav('side', false); }
    });
    // Look: light/dark + colorway (Rami, 2026-10-19: these live in the menu,
    // which frees the masthead for the session chips on a phone).
    var look = el('div', 'sn-look');
    var modeB = el('button', 'sn-btn sn-mode');
    modeB.type = 'button';
    modeB.appendChild(navIcon('M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z'));
    modeB.appendChild(el('span', 'sn-label', 'Dark mode'));
    modeB.addEventListener('click', function () {
      var t = themeById(document.documentElement.getAttribute('data-theme')) || THEMES[0];
      var cw = colorwayOf(t.id);
      applyTheme(t.dark ? cw.light : cw.dark, true);
    });
    look.appendChild(modeB);
    var sw = el('div', 'sn-swatches');
    sw.setAttribute('role', 'radiogroup');
    sw.setAttribute('aria-label', 'Colorway');
    COLORWAYS.forEach(function (cw) {
      var b = el('button', 'sn-swatch');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-colorway', cw.light);
      b.title = cw.desc;
      b.setAttribute('aria-label', cw.desc);
      sw.appendChild(b);
    });
    sw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-colorway]');
      if (!b) return;
      var cw = colorwayOf(b.getAttribute('data-colorway'));
      var dark = !!(themeById(document.documentElement.getAttribute('data-theme')) || {}).dark;
      applyTheme(dark ? cw.dark : cw.light, true);
    });
    look.appendChild(sw);
    foot.appendChild(look);
    foot.appendChild(col);
    foot.appendChild(top);
    box.appendChild(foot);

    // Close the drawer after choosing a section on a phone.
    box.addEventListener('click', function (e) {
      if (e.target.closest('a') && isNarrow()) openDrawer(false);
    });
    $('#sidenav-scrim').addEventListener('click', function () { openDrawer(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.classList.contains('open')) openDrawer(false);
    });
    $('#nav-btn').addEventListener('click', function () {
      if (isNarrow()) { openDrawer(!box.classList.contains('open')); return; }
      if (nav.mode === 'top') setNav('side', false);
      else setNav('side', !nav.collapsed);
    });
    // Mirror the tab-bar badges (live-thread count, focus LIVE).
    function syncBadges() {
      Array.prototype.forEach.call(box.querySelectorAll('[data-mirror]'), function (m) {
        var src = document.getElementById(m.getAttribute('data-mirror'));
        m.textContent = src ? src.textContent : '';
        m.hidden = !src || src.hidden || !src.textContent;
      });
    }
    if (window.MutationObserver) {
      var mo = new MutationObserver(syncBadges);
      ['wire-count', 'focus-badge'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) mo.observe(n, { attributes: true, childList: true, characterData: true, subtree: true });
      });
    }
    syncBadges();
    window.addEventListener('resize', function () { if (!isNarrow()) openDrawer(false); });
    applyNav();
  }
  function setNav(mode, collapsed) {
    nav.mode = mode;
    nav.collapsed = !!collapsed;
    try {
      localStorage.setItem('bluestreet-nav', mode);
      localStorage.setItem('bluestreet-nav-collapsed', nav.collapsed ? '1' : '0');
    } catch (e) { /* private mode */ }
    if (mode === 'top') openDrawer(false);
    applyNav();
  }
  function applyNav() {
    var root = document.documentElement, side = nav.mode === 'side';
    root.setAttribute('data-nav', nav.mode);
    if (side && nav.collapsed) root.setAttribute('data-nav-collapsed', ''); else root.removeAttribute('data-nav-collapsed');
    var box = $('#sidenav');
    if (box) box.hidden = !side && !box.classList.contains('open');
    var btn = $('#nav-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', side ? 'true' : 'false');
      btn.title = isNarrow() ? 'Menu' : (!side ? 'Show the sections as a side menu' : (nav.collapsed ? 'Expand the side menu' : 'Collapse the side menu'));
    }
    var col = box && box.querySelector('.sn-collapse .sn-label');
    if (col) col.textContent = nav.collapsed ? 'Expand' : 'Collapse';
    var lay = box && box.querySelector('.sn-top .sn-label');
    if (lay) lay.textContent = side ? 'Tabs on top' : 'Tabs on the side';
    syncSideTheme();
    // The masthead height changes when the tab bar hides; re-measure.
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
  }
  /* Side-menu look controls mirror the current theme. */
  function syncSideTheme() {
    var box = $('#sidenav');
    if (!box) return;
    var t = themeById(document.documentElement.getAttribute('data-theme')) || THEMES[0];
    var dark = !!t.dark, cw = colorwayOf(t.id);
    var ml = box.querySelector('.sn-mode .sn-label');
    if (ml) ml.textContent = dark ? 'Light mode' : 'Dark mode';
    var mi = box.querySelector('.sn-mode path');
    if (mi) mi.setAttribute('d', dark
      ? 'M8 5a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3'
      : 'M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z');
    Array.prototype.forEach.call(box.querySelectorAll('.sn-swatch'), function (b) {
      var c = colorwayOf(b.getAttribute('data-colorway'));
      var shown = themeById(dark ? c.dark : c.light);
      if (shown) b.style.background = swatchBg(shown);
      b.setAttribute('aria-checked', c === cw ? 'true' : 'false');
    });
  }

  function openDrawer(on) {
    var box = $('#sidenav'), scrim = $('#sidenav-scrim');
    if (!box) return;
    if (on) box.hidden = false;
    box.classList.toggle('open', !!on);
    if (!on && nav.mode !== 'side') setTimeout(function () { if (!box.classList.contains('open')) box.hidden = true; }, 260);
    if (scrim) scrim.hidden = !on;
    document.documentElement.classList.toggle('sn-locked', !!on);
  }
  function updateSideNav(tab, parent) {
    var box = $('#sidenav');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-nav]'), function (a) {
      var on = a.getAttribute('data-nav') === (parent || tab);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-nav-sub]'), function (a) {
      if (a.getAttribute('data-nav-sub') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    box.classList.toggle('drivers-open', parent === 'drivers');
  }

  /* First two sentences of a headline (one if two run past ~45 words).
     A sentence ends at . ! or ? followed by a space and a capital, digit or
     quote — so "4.5%" and "U.S." don't split. */
  function shortHeadline(t) { return firstSentences(t, 2, 45); }
  /* First `max` sentences; drops trailing ones while the total runs past `words`. */
  function firstSentences(t, max, words) {
    if (!t) return t;
    var out = [], start = 0;
    for (var i = 0; i < t.length && out.length < max; i++) {
      if ('.!?'.indexOf(t[i]) < 0) continue;
      var j = i + 1;
      while (j < t.length && '"\'”’)'.indexOf(t[j]) >= 0) j++;
      if (j < t.length && t[j] !== ' ') continue;
      var k = j; while (k < t.length && t[k] === ' ') k++;
      if (k < t.length && !/[A-Z0-9"“'‘]/.test(t[k])) continue;
      if (/(^|\s)[A-Z]\.$/.test(t.slice(Math.max(0, i - 2), i + 1))) continue;   // U.S.
      out.push(t.slice(start, j).trim());
      start = k;
    }
    if (!out.length) return t.trim();
    if (out.length < max && start < t.length) { /* fewer sentences than max: keep the rest too */ out.push(t.slice(start).trim()); }
    while (out.length > 1 && out.join(' ').split(/\s+/).length > words) out.pop();
    return out.join(' ');
  }

  /* ---------------- clock + sessions ---------------- */
  function startClock() {
    function tick() {
      var now = new Date();
      setText('#clock-utc', now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
      }) + ' UTC');
      renderSessions(now);
      tickRelTimes();
    }
    tick();
    setInterval(tick, 30000);
  }

  /* FX sessions, each judged on its own city's clock so daylight-saving
     shifts are handled automatically (Intl time zones):
       Sydney 07:00–16:00, Tokyo 09:00–18:00, London 08:00–17:00,
       New York 08:00–17:00 — local time, Monday–Friday.
     On top of that the FX week runs Sunday 17:00 → Friday 17:00 New York
     time, so nothing shows open over the weekend. Holidays are not modelled. */
  var SESSIONS = [
    { code: 'SYD', city: 'Sydney',   tz: 'Australia/Sydney', open: 7 * 60, close: 16 * 60 },
    { code: 'TYO', city: 'Tokyo',    tz: 'Asia/Tokyo',       open: 9 * 60, close: 18 * 60 },
    { code: 'LDN', city: 'London',   tz: 'Europe/London',    open: 8 * 60, close: 17 * 60 },
    { code: 'NYC', city: 'New York', tz: 'America/New_York', open: 8 * 60, close: 17 * 60 }
  ];
  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /* Weekday (0–6) and minutes after midnight in a given time zone. */
  function zoned(now, tz) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });
    return { wd: WD[parts.weekday], mins: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10) };
  }

  function fxWeekOpen(now) {
    var ny = zoned(now, 'America/New_York');
    if (ny.wd === 6) return false;                       // Saturday
    if (ny.wd === 0) return ny.mins >= 17 * 60;          // Sunday from 17:00
    if (ny.wd === 5) return ny.mins < 17 * 60;           // Friday until 17:00
    return true;
  }

  /* Minutes until the FX week reopens (Sunday 17:00 New York). */
  function minsUntilMarketOpen(now) {
    var ny = zoned(now, 'America/New_York');
    var days = (7 - ny.wd) % 7;                          // to Sunday
    return days * 1440 + 17 * 60 - ny.mins;
  }

  function hm(mins) {
    if (mins >= 1440) return Math.floor(mins / 1440) + 'd ' + Math.floor((mins % 1440) / 60) + 'h';
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + 'h ' : '') + m + 'm';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Minutes until this session next opens (local weekdays only). */
  function minsUntilOpen(z, s) {
    for (var d = 0; d <= 7; d++) {
      var wd = (z.wd + d) % 7;
      if (wd === 0 || wd === 6) continue;
      if (d === 0 && z.mins >= s.open) continue;
      return d * 1440 + s.open - z.mins;
    }
    return null;
  }

  function renderSessions(now) {
    var box = $('#sessions');
    if (!box) return;
    var marketOpen = fxWeekOpen(now);
    box.textContent = '';
    SESSIONS.forEach(function (s) {
      var z = zoned(now, s.tz);
      var weekday = z.wd >= 1 && z.wd <= 5;
      var open = marketOpen && weekday && z.mins >= s.open && z.mins < s.close;
      var hours = pad2(s.open / 60) + ':00–' + pad2(s.close / 60) + ':00 local';
      var status;
      if (open) {
        status = 'open · closes in ' + hm(s.close - z.mins);
      } else {
        var wait = minsUntilOpen(z, s);
        // Over the weekend a session can't open before the FX week does.
        if (!marketOpen && wait != null) wait = Math.max(wait, minsUntilMarketOpen(now));
        status = (marketOpen ? 'closed' : 'closed — FX market shut for the weekend') +
          (wait != null ? ' · opens in ' + hm(wait) : '');
      }
      var chip = el('span', 'sess' + (open ? ' open' : ''), s.code);
      chip.title = s.city + ' ' + hours + ' — ' + status;
      chip.setAttribute('aria-label', s.city + ' session ' + status);
      box.appendChild(chip);
      renderSessionClock(s, z, open, hours, status);
    });
  }

  /* Calendar: one analog clock per FX session, showing that city's local time
     (Rami, 2026-10-19). Out of session = greyed out; in session = lit with a
     warm light from the top down. Built once, hands updated on every tick. */
  function renderSessionClock(s, z, open, hours, status) {
    var box = $('#sess-clocks');
    if (!box) return;
    var NS = 'http://www.w3.org/2000/svg';
    var fig = box.querySelector('[data-sess="' + s.code + '"]');
    if (!fig) {
      fig = el('figure', 'sclock');
      fig.setAttribute('data-sess', s.code);
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('class', 'sclock-face');
      svg.setAttribute('aria-hidden', 'true');
      var mk = function (tag, attrs, cls) {
        var n = document.createElementNS(NS, tag);
        Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        if (cls) n.setAttribute('class', cls);
        svg.appendChild(n);
        return n;
      };
      var gid = 'glow-' + s.code;
      var defs = document.createElementNS(NS, 'defs');
      var lg = document.createElementNS(NS, 'linearGradient');
      lg.setAttribute('id', gid); lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
      [['0', '#ffd48a', '0.95'], ['0.55', '#ffe6bd', '0.35'], ['1', '#fff4e0', '0']].forEach(function (st) {
        var stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', st[0]); stop.setAttribute('stop-color', st[1]); stop.setAttribute('stop-opacity', st[2]);
        lg.appendChild(stop);
      });
      defs.appendChild(lg);
      svg.appendChild(defs);
      mk('circle', { cx: 50, cy: 50, r: 46 }, 'sc-dial');
      mk('circle', { cx: 50, cy: 50, r: 46, fill: 'url(#' + gid + ')' }, 'sc-glow');
      for (var k = 0; k < 12; k++) {
        var a = k * Math.PI / 6, r1 = k % 3 ? 39 : 35;
        mk('line', { x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a), x2: 50 + 42 * Math.sin(a), y2: 50 - 42 * Math.cos(a) }, k % 3 ? 'sc-tick' : 'sc-tick major');
      }
      mk('line', { x1: 50, y1: 50, x2: 50, y2: 27 }, 'sc-hour');
      mk('line', { x1: 50, y1: 50, x2: 50, y2: 15 }, 'sc-min');
      mk('circle', { cx: 50, cy: 50, r: 3.2 }, 'sc-pin');
      fig.appendChild(svg);
      var cap = el('figcaption');
      cap.appendChild(el('span', 'sc-city', s.code));
      cap.appendChild(el('span', 'sc-time mono'));
      fig.appendChild(cap);
      box.appendChild(fig);
    }
    var h = Math.floor(z.mins / 60), m = z.mins % 60;
    fig.querySelector('.sc-hour').setAttribute('transform', 'rotate(' + ((h % 12) * 30 + m * 0.5) + ' 50 50)');
    fig.querySelector('.sc-min').setAttribute('transform', 'rotate(' + (m * 6) + ' 50 50)');
    fig.querySelector('.sc-time').textContent = pad2(h) + ':' + pad2(m);
    fig.classList.toggle('open', !!open);
    fig.title = s.city + ' · ' + hours + ' — ' + status;
    fig.setAttribute('aria-label', s.city + ' ' + pad2(h) + ':' + pad2(m) + ', session ' + status);
  }

  /* ---------------- edition / today ---------------- */
  function renderEdition(d) {
    if (d.date) {
      var p = d.date.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var label = months[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
      setText('#edition-date', label);
      setText('#hero-date', '· ' + label);
    }
    // Rami, 2026-10-19: Today's read is 1–2 sentences, max. The editions are
    // told so; this keeps the page honest if a long one slips through.
    // Headline as word spans so it can rise in word by word.
    var h = $('#today-headline');
    h.textContent = '';
    (shortHeadline(d.headline) || 'Today’s edition').split(/\s+/).forEach(function (w, i) {
      if (i) h.appendChild(document.createTextNode(' '));
      var s = el('span', 'hw', w);
      s.style.setProperty('--i', i);
      h.appendChild(s);
    });
    var hc = $('#hero-chapters');
    hc.textContent = '';
    (d.chapters || []).forEach(function (ch, i) {
      var li = el('li');
      li.style.setProperty('--i', i);
      // Each chip jumps straight to its chapter card (or, if quiet, the Story
      // chapter). Rami, 2026-10-19: flag + code, like the News market chips.
      var code = chapterCcy(ch, i);
      var b = el('button', ch.quiet ? 'quiet' : null);
      if (code && FLAG_FILE[code]) {
        b.appendChild(flagEl(code));
        b.appendChild(el('span', null, code === 'XAU' || code === 'OIL' ? mktName(code) : code));
        b.setAttribute('aria-label', ch.title);
      } else b.textContent = ch.title;
      b.type = 'button';
      if (ch.quiet) b.title = 'Quiet today — opens the full chapter';
      b.addEventListener('click', function () {
        var sc = $('#scene-' + (i + 1));
        if (sc) jumpTo(sc);
        else location.hash = '#story/' + (i + 1);
      });
      li.appendChild(b);
      hc.appendChild(li);
    });
  }

  /* Numbers inside a data point get emphasis (split + textContent, no HTML). */
  var NUM_RE = /([+\-−~]?[$¥€£]?\d+(?:[.,]\d+)*(?:[–-]\d+(?:[.,]\d+)*)?(?:\s?(?:%|bp|T|k|bn)\b|%)?)/;
  function withFigures(node, text) {
    String(text).split(NUM_RE).forEach(function (part, i) {
      if (!part) return;
      node.appendChild(i % 2 ? el('b', 'fig mono', part) : document.createTextNode(part));
    });
    return node;
  }

  /* One pinned scene per chapter: number + title, then the teaser (the delta
     — what changed and why it matters), then the way into the full chapter.
     Each child with data-at reveals once the scene's scroll progress (0–1)
     passes that value. The full narrative lives in the Story tab, so the tap
     always earns itself. */
  /* Today's chapters as cards (Rami, 2026-10-19): currency, today's read
     (1–3 sentences), the top related headlines, and "More on …" into the
     full Story chapter. Re-rendered when news.json / currencies.json land. */
  function renderScenes(d) {
    var box = $('#today-story'), dots = $('#story-dots');
    box.textContent = '';
    dots.textContent = '';
    var chs = d.chapters || [];
    var quiet = [];
    var grid = el('div', 'ch-cards');
    chs.forEach(function (ch, i) {
      // Hercules flags a chapter `quiet` when nothing really changed since the
      // last edition: Today folds it into one line; Story still has it in full.
      if (ch.quiet) { quiet.push(i); return; }
      var code = chapterCcy(ch, i);
      var card = el('article', 'card ch-card gl-scope');
      card.id = 'scene-' + (i + 1);

      var head = el('header', 'chc-head');
      if (code) head.appendChild(flagEl(code));
      var h = el('h2', 'chc-title');
      var ha = el('a', null, ch.title);
      ha.href = '#story/' + (i + 1);
      h.appendChild(ha);
      head.appendChild(h);
      var lean = chapterLean(code);
      if (lean) {
        var L = NEWS_LEAN[lean.dir];
        var lt = el('span', 'chc-lean ' + L.cls);
        lt.appendChild(trendIcon(L.cls));
        lt.title = lean.title;
        lt.appendChild(el('span', 'sr-only', lean.title));
        head.appendChild(lt);
      }
      card.appendChild(head);

      var read = el('p', 'chc-read');
      withFigures(read, firstSentences(ch.teaser || ch.fx || '', 3, 60));
      card.appendChild(read);

      var items = code ? topNewsFor(code, 3) : [];
      if (items.length) {
        var nw = el('div', 'chc-news');
        nw.appendChild(el('h3', 'section-label', 'In the news'));
        var ul = el('ul');
        items.forEach(function (it) {
          var li = el('li');
          var a = el('a', 'chc-hl');
          a.href = '#news/' + code;
          a.setAttribute('data-open-news', slugId(it.id || it.url || it.headline));
          var x = (it.impact || []).filter(function (y) { return y && y.ccy === code; })[0];
          if (x) { var Lx = NEWS_LEAN[x.dir] || NEWS_LEAN.mixed; var ic = el('span', 'chc-ic ' + Lx.cls); ic.appendChild(trendIcon(Lx.cls)); a.appendChild(ic); }
          a.appendChild(el('span', 'chc-hl-t', it.headline));
          li.appendChild(a);
          var m = el('span', 'chc-src meta');
          m.appendChild(document.createTextNode((it.source || '') + ' · '));
          m.appendChild(newsWhenEl(it));
          li.appendChild(m);
          ul.appendChild(li);
        });
        nw.appendChild(ul);
        card.appendChild(nw);
      }

      var more = el('a', 'chc-more', 'More on ' + ch.title + ' →');
      more.href = '#story/' + (i + 1);
      card.appendChild(more);
      grid.appendChild(card);
    });
    box.appendChild(grid);
    if (quiet.length) {
      var q = el('p', 'quiet-line');
      q.appendChild(el('span', 'quiet-lbl', 'Quiet today'));
      quiet.forEach(function (i, k) {
        if (k) q.appendChild(document.createTextNode(' · '));
        var a = el('a', null, chs[i].title);
        a.href = '#story/' + (i + 1);
        q.appendChild(a);
      });
      q.appendChild(el('span', 'quiet-note', 'No real change since the last edition — full chapters in Story.'));
      box.appendChild(q);
    }
    measureScenes();
    queueScroll();
  }

  /* Lean for a chapter card: the strength-board score for a currency (sum of
     pillar scores), else the News read for gold / oil. Evidence, not a call. */
  function chapterLean(code) {
    if (!code) return null;
    var c = fx.data && fxGet(code);
    if (c) {
      var sc = fxScore(c);
      return { dir: sc > 0 ? 'bullish' : sc < 0 ? 'bearish' : 'mixed',
        title: 'Pillars net ' + (sc > 0 ? '+' : '') + sc + ' for ' + code + ' — evidence, not a call' };
    }
    var nr = news.data && news.data.narratives && news.data.narratives[code];
    if (nr && NEWS_LEAN[nr.lean]) return { dir: nr.lean, title: 'Headlines lean ' + nr.lean + ' — evidence, not a call' };
    return null;
  }
  /* Highest-impact recent headlines touching a market (news.json). */
  function topNewsFor(code, n) {
    var all = ((news.data && news.data.items) || []).filter(function (it) {
      return it && it.headline && (it.ts || it.date) && newsTouches(it, code);
    });
    all.sort(function (a, b) { return (newsImpact(b) - newsImpact(a)) || (newsTime(b) - newsTime(a)); });
    return all.slice(0, n);
  }

  /* Background mark behind each chapter scene: the chapter's currency symbol
     (currencies.json `chapter` join, else the chapter title), or the chapter
     number when a chapter isn't about one currency. */
  var CCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'Fr', AUD: 'A$', CAD: 'C$', NZD: 'NZ$',
    XAU: 'Au', OIL: 'Oil' };
  var CCY_TITLE = [[/new zealand|kiwi/i, 'NZD'], [/austral|aussie/i, 'AUD'], [/canad|loonie/i, 'CAD'],
    [/\b(us|u\.s\.)\s+dollar|greenback/i, 'USD'], [/\beuro\b/i, 'EUR'], [/pound|sterling|\bgbp\b/i, 'GBP'],
    [/\byen\b/i, 'JPY'], [/franc|swiss/i, 'CHF'], [/\bgold\b/i, 'XAU'], [/\boil\b|crude|brent|\bwti\b/i, 'OIL']];
  function chapterCcy(ch, i) {
    var list = (fx.data && fx.data.currencies) || [];
    for (var k = 0; k < list.length; k++) if (+list[k].chapter === i + 1) return list[k].ccy;
    for (var j = 0; j < CCY_TITLE.length; j++) if (CCY_TITLE[j][0].test(ch.title || '')) return CCY_TITLE[j][1];
    return null;
  }
  function ghostMark(ch, i) {
    var sym = CCY_SYMBOL[chapterCcy(ch, i)];
    var g = el('span', 'ghost-num mono' + (sym && sym.length > 1 ? ' len-' + Math.min(sym.length, 3) : ''),
      sym || String(i + 1).padStart(2, '0'));
    g.setAttribute('aria-hidden', 'true');
    return g;
  }
  /* currencies.json can land after the story: re-mark the scenes. */
  function refreshGhosts() {
    if (!story) return;
    Array.prototype.forEach.call(document.querySelectorAll('.ch-scene'), function (sc) {
      var i = +sc.getAttribute('data-ch');
      var old = sc.querySelector('.ghost-num'), ch = (story.chapters || [])[i];
      if (old && ch) old.parentNode.replaceChild(ghostMark(ch, i), old);
    });
  }

  /* ---------------- today: at a glance (reorderable) ----------------
     The strip's tiles can be put in any order. Arrow buttons work everywhere
     (touch included); on desktop a tile can also be dragged. The order is
     saved per browser (localStorage `bluestreet-glance`), unknown ids are
     dropped and new tiles are appended, so adding a tile later is safe. The
     first visible tile spans the full width. */
  var GLANCE_IDS = ['next', 'lean'];   // 'flash' (Developing) removed 2026-10-18
  var GLANCE_NAMES = { flash: 'Developing', next: 'Next up', lean: 'Evidence leans' };
  var glance = { editing: false, drag: null };

  function glanceOrder() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('bluestreet-glance') || 'null'); } catch (e) { /* private mode */ }
    var out = (Array.isArray(saved) ? saved : []).filter(function (id, i, a) {
      return GLANCE_IDS.indexOf(id) >= 0 && a.indexOf(id) === i;
    });
    GLANCE_IDS.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  function saveGlance(order) {
    try {
      if (order) localStorage.setItem('bluestreet-glance', JSON.stringify(order));
      else localStorage.removeItem('bluestreet-glance');
    } catch (e) { /* private mode: order lasts for this visit only */ }
  }
  function glanceTile(id) { return document.querySelector('.glance-tile[data-tile="' + id + '"]'); }
  function tileVisible(t) {
    var c = t.querySelector('.card');
    return !c || !c.hidden;
  }

  /* Put the tiles in order. animate = slide them from where they were (FLIP). */
  function applyGlance(animate, order) {
    var box = $('#today-glance');
    if (!box) return;
    order = order || glanceOrder();
    var tiles = order.map(glanceTile).filter(Boolean);
    var before = animate && !sx.reduced ? tiles.map(function (t) { return t.getBoundingClientRect(); }) : null;
    var lead = null;
    tiles.forEach(function (t, i) {
      box.appendChild(t);
      var show = glance.editing || tileVisible(t);
      t.hidden = !show;
      if (show && !lead) lead = t;
      var up = t.querySelector('.tc-up'), dn = t.querySelector('.tc-dn');
      if (up) up.disabled = i === 0;
      if (dn) dn.disabled = i === tiles.length - 1;
      var pos = t.querySelector('.tc-pos');
      if (pos) pos.textContent = (i + 1) + ' of ' + tiles.length;
    });
    tiles.forEach(function (t) { t.classList.toggle('lead', t === lead); });
    if (before) {
      tiles.forEach(function (t, i) {
        var a = before[i], b = t.getBoundingClientRect();
        var dx = a.left - b.left, dy = a.top - b.top;
        if (!dx && !dy) return;
        t.style.transition = 'none';
        t.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            t.style.transition = 'transform 0.35s var(--ease)';
            t.style.transform = '';
          });
        });
      });
    }
    var reset = $('#glance-reset');
    if (reset) reset.hidden = !glance.editing;
  }

  function moveGlance(id, to) {
    var order = glanceOrder(), from = order.indexOf(id);
    if (from < 0 || to < 0 || to >= order.length || to === from) return;
    order.splice(from, 1);
    order.splice(to, 0, id);
    saveGlance(order);
    applyGlance(true, order);
    setText('#glance-status', GLANCE_NAMES[id] + ' moved to position ' + (to + 1) + ' of ' + order.length + '.');
  }

  function setGlanceEditing(on) {
    glance.editing = on;
    var box = $('#today-glance'), btn = $('#glance-edit');
    if (box) box.classList.toggle('editing', on);
    if (btn) {
      btn.textContent = on ? 'Done' : 'Rearrange';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    Array.prototype.forEach.call(document.querySelectorAll('.glance-tile'), function (t) {
      t.draggable = on;
      // While editing, the cards are not links (a tap shouldn't navigate away).
      Array.prototype.forEach.call(t.querySelectorAll('.card a, a.card'), function (a) {
        if (on) a.setAttribute('tabindex', '-1'); else a.removeAttribute('tabindex');
      });
    });
    applyGlance(false);
    setText('#glance-status', on ? 'Rearranging. Use the arrows to move tiles; your order is saved.' : 'Order saved.');
  }

  function initGlance() {
    var box = $('#today-glance');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.glance-tile'), function (t) {
      var id = t.getAttribute('data-tile');
      var ctl = el('div', 'tile-ctl');
      ctl.appendChild(el('span', 'tc-grip', '⋮⋮'));
      ctl.appendChild(el('span', 'tc-name', GLANCE_NAMES[id] || id));
      ctl.appendChild(el('span', 'tc-pos meta'));
      [['tc-up', '↑', 'Move ' + GLANCE_NAMES[id] + ' up', -1], ['tc-dn', '↓', 'Move ' + GLANCE_NAMES[id] + ' down', 1]]
        .forEach(function (b) {
          var btn = el('button', 'tc-btn ' + b[0], b[1]);
          btn.type = 'button';
          btn.setAttribute('aria-label', b[2]);
          btn.addEventListener('click', function () {
            moveGlance(id, glanceOrder().indexOf(id) + b[3]);
            if (btn.disabled) { var other = t.querySelector(b[0] === 'tc-up' ? '.tc-dn' : '.tc-up'); if (other) other.focus(); }
            else btn.focus();
          });
          ctl.appendChild(btn);
        });
      t.insertBefore(ctl, t.firstChild);

      // Desktop drag: drop onto another tile to take its place.
      t.addEventListener('dragstart', function (e) {
        if (!glance.editing) { e.preventDefault(); return; }
        glance.drag = id;
        t.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
      });
      t.addEventListener('dragend', function () {
        glance.drag = null;
        Array.prototype.forEach.call(box.querySelectorAll('.glance-tile'), function (n) { n.classList.remove('dragging', 'drop-target'); });
      });
      t.addEventListener('dragover', function (e) {
        if (!glance.drag || glance.drag === id) return;
        e.preventDefault();
        t.classList.add('drop-target');
      });
      t.addEventListener('dragleave', function () { t.classList.remove('drop-target'); });
      t.addEventListener('drop', function (e) {
        e.preventDefault();
        t.classList.remove('drop-target');
        if (glance.drag && glance.drag !== id) moveGlance(glance.drag, glanceOrder().indexOf(id));
      });
      // Editing: swallow clicks on the card so nothing navigates.
      t.addEventListener('click', function (e) {
        if (glance.editing && !e.target.closest('.tile-ctl')) e.preventDefault();
      }, true);
    });
    var edit = $('#glance-edit'), reset = $('#glance-reset');
    if (edit) edit.addEventListener('click', function () { setGlanceEditing(!glance.editing); });
    if (reset) reset.addEventListener('click', function () {
      saveGlance(null);
      applyGlance(true);
      setText('#glance-status', 'Back to the default order.');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && glance.editing) setGlanceEditing(false);
    });
    applyGlance(false);
  }

  /* ---------------- today: scroll engine ----------------
     Each [data-scene] is taller than the screen; its .pin sticks under the
     masthead while the scene scrolls past. Progress p (0 → 1) through that
     travel is written to --p (continuous effects in CSS) and flips .in on
     [data-at] steps (eased CSS transitions). [data-reveal] blocks fade up
     once they enter the viewport. Reduced motion: no pinning, all shown. */
  var sx = { raf: 0, mast: 0, reduced: false };

  function initScrollStory() {
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var setReduced = function () {
      sx.reduced = !!(mq && mq.matches);
      document.documentElement.classList.toggle('no-motion', sx.reduced);
      measureScenes();
      queueScroll();
    };
    setReduced();
    if (mq && mq.addEventListener) mq.addEventListener('change', setReduced);
    window.addEventListener('scroll', queueScroll, { passive: true });
    window.addEventListener('resize', function () { measureScenes(); queueScroll(); });
    window.addEventListener('hashchange', function () { setTimeout(function () { measureScenes(); queueScroll(); }, 0); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureScenes(); queueScroll(); });
    measureScenes();
  }

  function queueScroll() {
    if (!sx.raf) sx.raf = requestAnimationFrame(updateScroll);
  }

  /* Masthead height (sticky offset) and, per scene, how far the pinned
     content overflows the screen — it then drifts up as you scroll. */
  function measureScenes() {
    var m = $('.masthead');
    sx.mast = m ? m.offsetHeight : 0;
    document.documentElement.style.setProperty('--mast-h', sx.mast + 'px');
    var v = $('#view-today');
    if (!v || v.hidden) return;
    Array.prototype.forEach.call(v.querySelectorAll('[data-scene]'), function (sc) {
      var pin = sc.querySelector('.pin'), inner = sc.querySelector('.pin-inner');
      if (!pin || !inner) return;
      if (sc.classList.contains('ch-scene')) {
        // Never shorter than its content + a brief hold, so it can't overlap the next.
        sc.style.minHeight = sx.reduced ? '' : Math.round(pin.offsetHeight + window.innerHeight * 0.22) + 'px';
        return;
      }
      var ov = Math.max(0, inner.offsetHeight - pin.clientHeight + 48);
      sc.style.setProperty('--ov', ov + 'px');
      sc.classList.toggle('tall', ov > 0);
    });
  }

  function updateScroll() {
    sx.raf = 0;
    var v = $('#view-today');
    if (!v || v.hidden) return;
    var vh = window.innerHeight, avail = vh - sx.mast;
    var scenes = v.querySelectorAll('[data-scene]');
    var reads = [], active = -1;
    Array.prototype.forEach.call(scenes, function (sc) {
      reads.push(sc.getBoundingClientRect());
    });
    Array.prototype.forEach.call(scenes, function (sc, i) {
      var r = reads[i], span = Math.max(1, r.height - avail);
      var p = sx.reduced ? 1 : Math.min(1, Math.max(0, (sx.mast - r.top) / span));
      if (sc.classList.contains('ch-scene') && !sx.reduced) {
        // Short scenes: 0 as the top enters the lower screen, 1 as it reaches the masthead.
        var start = vh * 0.85;
        p = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - sx.mast)));
      }
      sc.style.setProperty('--p', p.toFixed(4));
      Array.prototype.forEach.call(sc.querySelectorAll('[data-at]'), function (n) {
        n.classList.toggle('in', sx.reduced || p >= +n.getAttribute('data-at'));
      });
      if (sc.classList.contains('ch-scene') && r.top <= sx.mast + avail * 0.5) active = i - 1;
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-reveal]'), function (n) {
      if (sx.reduced || n.getBoundingClientRect().top < vh * 0.9) n.classList.add('in');
    });

    // Reading progress through the chapters, and the chapter dots.
    var story = $('#today-story'), bar = $('#read-bar');
    if (story && bar) {
      var sr = story.getBoundingClientRect();
      var prog = Math.min(1, Math.max(0, (sx.mast - sr.top) / Math.max(1, sr.height - avail)));
      bar.style.transform = 'scaleX(' + prog.toFixed(4) + ')';
      var inStory = sr.top < sx.mast + avail * 0.5 && sr.bottom > sx.mast + avail * 0.5;
      $('#story-dots').classList.toggle('on', inStory);
    }
    Array.prototype.forEach.call(document.querySelectorAll('#story-dots .sdot'), function (d, i) {
      if (i === active) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
  }

  /* Scroll so a chapter scene's content is fully revealed. */
  function jumpTo(sc) {
    var span = sc.classList.contains('ch-scene') ? 0 : sc.offsetHeight - (window.innerHeight - sx.mast);
    var y = sc.getBoundingClientRect().top + window.pageYOffset - sx.mast + Math.max(0, span) * 0.86;
    window.scrollTo({ top: y, behavior: sx.reduced ? 'auto' : 'smooth' });
  }

  /* Macro pulse: pillar title + its one-line read. */
  function renderPulse(d) {
    var box = $('#today-pulse');
    (d.rows || []).forEach(function (row) {
      var li = el('li');
      li.appendChild(el('span', 'p-title', row.title));
      li.appendChild(el('span', 'p-read', firstSentences(row.read || '', 1, 40)));
      box.appendChild(li);
    });
  }

  /* ---------------- story ---------------- */
  function renderRail(d) {
    var rail = $('#chapter-rail');
    (d.chapters || []).forEach(function (ch, i) {
      var li = el('li');
      var a = el('a');
      a.href = '#story/' + (i + 1);
      a.appendChild(el('span', 'r-num mono', String(i + 1).padStart(2, '0')));
      a.appendChild(el('span', 'r-title', ch.title));
      li.appendChild(a);
      rail.appendChild(li);
    });
  }

  function showChapter(i) {
    var chs = story.chapters || [];
    if (!chs.length) return;
    chapterIdx = Math.max(0, Math.min(chs.length - 1, i));
    var ch = chs[chapterIdx];

    Array.prototype.forEach.call(document.querySelectorAll('#chapter-rail a'), function (a, k) {
      if (k === chapterIdx) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });

    var v = $('#chapter-view');
    v.textContent = '';
    v.appendChild(el('p', 'kicker', 'Chapter ' + (chapterIdx + 1) + ' of ' + chs.length));
    v.appendChild(el('h1', 'display', ch.title));

    // Prose leads: the narrative under its labels (The story so far / What
    // changed / What it means / What's next). An unlabelled `fx` (older editions) is
    // still the FX takeaway up top.
    var body = el('div', 'narrative gl-scope');
    var fxSecs = narrativeSections(ch.fx);
    if (ch.fx && !fxSecs[0].label) {
      var fx = el('div', 'fx-callout');
      fx.appendChild(el('span', 'callout-lbl', 'What it means for FX'));
      fx.appendChild(el('p', null, ch.fx));
      body.appendChild(fx);
      fxSecs = [];
    }
    narrativeSections(ch.meaning).concat(fxSecs).forEach(function (sec) {
      if (!sec.text) return;
      var part = el('section', 'narr' + (/watch|next/i.test(sec.label || '') ? ' narr-watch' : ''));
      if (sec.label) part.appendChild(el('h3', 'narr-lbl', sec.label));
      part.appendChild(el('p', 'narr-p', sec.label ? sec.text.charAt(0).toUpperCase() + sec.text.slice(1) : sec.text));
      body.appendChild(part);
    });
    v.appendChild(body);

    // Figures serve the prose: one tap away.
    if ((ch.numbers || []).length) {
      var det = drawer('Details', ch.numbers.length + (ch.numbers.length === 1 ? ' figure' : ' figures'));
      var ul = el('ul', 'numbers');
      ch.numbers.forEach(function (n) { ul.appendChild(withFigures(el('li'), n)); });
      det.appendChild(ul);
      v.appendChild(det);
    }

    if (ch.scenarios) v.appendChild(scenarioSwitch(ch.scenarios));

    v.appendChild(sourceChips(ch.sources || ch.source, ch.source_url));

    // Prev / next
    var nav = el('div', 'chapter-nav');
    if (chapterIdx > 0) {
      var p = el('a', 'btn ghost', '← ' + chs[chapterIdx - 1].title);
      p.href = '#story/' + chapterIdx;
      nav.appendChild(p);
    } else {
      nav.appendChild(el('span'));
    }
    if (chapterIdx < chs.length - 1) {
      var n = el('a', 'btn', chs[chapterIdx + 1].title + ' →');
      n.href = '#story/' + (chapterIdx + 2);
      nav.appendChild(n);
    }
    v.appendChild(nav);
  }

  /* Split narrative prose on its section labels. Text before the first label
     (or prose with none) comes back as one unlabelled section. */
  // "The story so far" and "What's next" are the current labels; "Thread" and
  // "What to watch" are older editions' names for the same sections.
  var NARR_RE = /(?:^|\s)(The story so far|What changed|Thread|What it means|What[\u2019']s next|What to watch)\s*:\s*/g;
  var NARR_SHOW = { 'Thread': 'The story so far', 'What to watch': 'What\u2019s next' };
  function narrativeSections(text) {
    text = String(text || '').trim();
    var out = [], m, last = 0, label = null;
    NARR_RE.lastIndex = 0;
    while ((m = NARR_RE.exec(text))) {
      var chunk = text.slice(last, m.index).trim();
      if (chunk || label) out.push({ label: label, text: chunk });
      label = NARR_SHOW[m[1]] || m[1].replace("'", '\u2019');
      last = NARR_RE.lastIndex;
    }
    out.push({ label: label, text: text.slice(last).trim() });
    return out;
  }

  /* Tap-to-reveal drawer for figures and raw numbers (prose-first rule). */
  function drawer(label, hint) {
    var d = el('details', 'drawer');
    var sm = el('summary');
    sm.appendChild(el('span', 'drawer-lbl', label));
    if (hint) sm.appendChild(el('span', 'drawer-hint', hint));
    d.appendChild(sm);
    return d;
  }

  /* Base / Bull / Bear as a segmented control: one scenario visible at a time. */
  function scenarioSwitch(sc) {
    var box = el('div', 'scenarios');
    var head = el('div', 'sc-head');
    head.appendChild(el('h2', 'section-label', 'Scenarios'));
    var seg = el('div', 'segmented');
    seg.setAttribute('role', 'tablist');
    seg.setAttribute('aria-label', 'Scenario');
    head.appendChild(seg);
    box.appendChild(head);
    var body = el('p', 'sc-body');
    body.setAttribute('aria-live', 'polite');
    box.appendChild(body);

    var keys = [['base', 'Base'], ['bull', 'Bull'], ['bear', 'Bear']].filter(function (k) {
      return sc[k[0]];
    });
    function pick(key) {
      Array.prototype.forEach.call(seg.children, function (b) {
        b.setAttribute('aria-selected', b.getAttribute('data-k') === key ? 'true' : 'false');
      });
      body.className = 'sc-body sc-' + key;
      body.textContent = sc[key];
    }
    keys.forEach(function (k) {
      var b = el('button', 'seg sc-' + k[0], k[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-k', k[0]);
      b.addEventListener('click', function () { pick(k[0]); });
      seg.appendChild(b);
    });
    if (keys.length) pick(keys[0][0]);
    return box;
  }

  /* ---------------- macro engine ---------------- */
  var NUMWORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  var explainers = null;   // data/pillars.json, keyed by engine row id

  function renderEngine(d) {
    if (d.updated) setText('#engine-updated', fmtDateTime(d.updated, true));
    var rows = d.rows || [];
    setText('#pillar-count', NUMWORDS[rows.length] || String(rows.length));
    var box = $('#engine-rows');
    box.textContent = '';
    // 3-up grid with no orphans: a remainder of 1 turns the last four tiles
    // into two rows of halves (7 → 3+2+2); a remainder of 2 halves the last two.
    var n = rows.length, rem = n % 3;
    var halfFrom = rem === 1 && n >= 4 ? n - 4 : rem === 2 ? n - 2 : n;
    rows.forEach(function (row, i) {
      var c = el('div', 'card pillar gl-scope' + (i >= halfFrom ? ' half' : ''));
      c.setAttribute('data-pillar', row.id);
      var head = el('div', 'pillar-head');
      head.appendChild(el('span', 'pillar-title', row.title));
      c.appendChild(head);
      // The read leads; the figures behind it sit one tap away.
      // Rami, 2026-10-19: the read is the meaning in 2–3 plain sentences; numbers live in Details.
      c.appendChild(el('p', 'pillar-read', firstSentences(row.read || '', 3, 70)));
      var det = drawer('Details');
      if (row.figure) det.appendChild(withFigures(el('p', 'pillar-figure'), row.figure));
      det.appendChild(sourceChips(row.sources || row.source, row.source_url));
      c.appendChild(det);
      box.appendChild(c);
    });
    attachExplainers();
  }

  /* "What is this?" toggle on each pillar that has an explainer. */
  function attachExplainers() {
    if (!explainers) return;
    Array.prototype.forEach.call(document.querySelectorAll('.pillar[data-pillar]'), function (c) {
      var x = explainers[c.getAttribute('data-pillar')];
      if (!x || c.querySelector('.explain-btn')) return;
      var id = 'explain-' + c.getAttribute('data-pillar');
      var btn = el('button', 'explain-btn');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', id);
      btn.appendChild(el('span', 'explain-i', 'i'));
      btn.appendChild(document.createTextNode('What is this?'));
      c.querySelector('.pillar-head').appendChild(btn);

      var panel = el('div', 'explain');
      panel.id = id;
      panel.hidden = true;
      panel.appendChild(el('p', null, x.body));
      if (x.live) {
        var live = el('div', 'explain-live');
        live.appendChild(el('span', 'callout-lbl', 'Live example'));
        live.appendChild(el('p', null, x.live));
        panel.appendChild(live);
      }
      c.insertBefore(panel, c.querySelector('.pillar-read'));
      btn.addEventListener('click', function () {
        var open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        c.classList.toggle('explaining', open);
      });
    });
  }

  /* ---------------- central banks ----------------
     data/banks.json → one card per bank, soonest decision first. Banks with
     no data yet sink to the end as compact "not covered" cards. */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function ymd(str) {               // "2026-10-27" -> local Date at midnight
    var p = (str || '').split('-');
    return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
  }

  function fmtMeeting(m) {
    var a = ymd(m.start), b = ymd(m.end);
    if (!a) return '';
    var out = MONTHS[a.getMonth()] + ' ' + a.getDate();
    if (b && +b !== +a) out += '–' + (b.getMonth() === a.getMonth() ? '' : MONTHS[b.getMonth()] + ' ') + b.getDate();
    return out;
  }

  /* Days from today to the meeting; null if it has passed. */
  function daysUntil(m) {
    var a = ymd(m.start), b = ymd(m.end) || a;
    if (!a) return null;
    var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    if (b < t) return null;
    return Math.max(0, Math.round((a - t) / 864e5));
  }

  function inDays(n) {
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
  }

  function moveChip(mv) {
    if (!mv || mv.bp == null) return null;
    var d = ymd(mv.date), when = d ? ' · ' + MONTHS[d.getMonth()] + ' ' + d.getDate() : '';
    if (mv.bp > 0) return el('span', 'move up', 'Hiked +' + mv.bp + 'bp' + when);
    if (mv.bp < 0) return el('span', 'move dn', 'Cut ' + mv.bp + 'bp' + when);
    return el('span', 'move flat', 'Held' + when);
  }

  /* Rami, 2026-10-19: the trend line next to the bias shows which way it tends to push
     the currency. Hawkish (rates up) lifts it, dovish (rates down) weighs on it,
     neutral goes sideways. Same line and colours as the News tab. */
  var BIAS = {
    hawkish: ['Hawkish', 'bull', 'tends to support'],
    dovish: ['Dovish', 'bear', 'tends to weigh on'],
    neutral: ['Neutral', 'mixed', 'is not pushing']
  };

  function renderBanks(d) {
    if (d.updated) setText('#banks-updated', fmtDateTime(d.updated, true));
    var grid = $('#bank-grid');
    var banks = (d.banks || []).map(function (b) {
      var nm = b.next_meeting && b.next_meeting.start ? b.next_meeting : null;
      return { b: b, nm: nm, days: nm ? daysUntil(nm) : null, covered: !!(b.rate || b.priced || b.bias) };
    });
    // Covered first, then by soonest meeting; unknown dates last.
    banks.sort(function (x, y) {
      if (x.covered !== y.covered) return x.covered ? -1 : 1;
      var dx = x.days == null ? 1e9 : x.days, dy = y.days == null ? 1e9 : y.days;
      return dx - dy;
    });

    var thin = [];
    banks.forEach(function (o) {
      var b = o.b;
      var c = el('article', 'card bank gl-scope' + (o.covered ? '' : ' thin'));
      var head = el('div', 'bank-head');
      head.appendChild(flagEl(b.ccy));   // Rami, 2026-10-19: each bank carries its flag
      head.appendChild(el('span', 'bank-short', b.short));
      head.appendChild(el('span', 'bank-ccy mono', b.ccy || ''));
      if (b.bias && BIAS[b.bias]) {
        var BX = BIAS[b.bias], bp = el('span', 'bias-pill bank-bias ' + BX[1]);
        bp.appendChild(el('span', null, BX[0]));
        bp.appendChild(trendIcon(BX[1]));
        bp.title = BX[0] + ': ' + BX[2] + ' ' + (b.ccy || 'the currency');
        head.appendChild(bp);
      }
      c.appendChild(head);
      c.appendChild(el('p', 'bank-name', b.name));

      // Prose first: the bank's story (summary, if the feed gives one) and
      // what the market prices lead; the rate stays as a compact figure.
      // Rami, 2026-10-19: lead with the meaning in 1–2 plain sentences; the numbers sit in Details.
      if (b.summary) c.appendChild(el('p', 'bank-summary', firstSentences(b.summary, 2, 45)));
      if (b.priced) {
        var pr = el('div', 'bank-priced');
        pr.appendChild(el('span', 'meet-lbl', 'Market pricing'));
        pr.appendChild(el('span', null, b.summary ? firstSentences(b.priced, 1, 25) : b.priced));
        c.appendChild(pr);
      }
      if (o.covered && b.rate) {
        var rate = el('div', 'bank-rate');
        rate.appendChild(el('span', 'meet-lbl', 'Policy rate'));
        rate.appendChild(el('span', 'rate-val', b.rate));
        c.appendChild(rate);
      }

      var meet = el('div', 'bank-meet');
      meet.appendChild(el('span', 'meet-lbl', 'Next decision'));
      if (o.nm) {
        var when = el('span', 'meet-when');
        when.appendChild(el('b', null, fmtMeeting(o.nm)));
        if (o.days != null) when.appendChild(el('span', 'meet-in', inDays(o.days)));
        meet.appendChild(when);
      } else {
        meet.appendChild(el('span', 'meet-when muted', 'Date to come'));
      }
      c.appendChild(meet);

      if (o.covered) {
        // Raw numbers: rate definition, last move, sources — on tap.
        var mc = moveChip(b.last_move);
        var plain = !!(b.why || b.watch);
        if (b.rate_label || mc || b.detail || plain || (b.sources || []).length) {
          var det = drawer('Details');
          // Rami, 2026-10-19: the old Details read like data slop. When plain-words text
          // exists (words.json) it replaces the number-heavy detail; otherwise fall back.
          [['What is driving it', b.why], ['What to watch', b.watch]].forEach(function (r) {
            if (!r[1]) return;
            var blk = el('div', 'bank-note');
            blk.appendChild(el('span', 'meet-lbl', r[0]));
            blk.appendChild(el('p', null, r[1]));
            det.appendChild(blk);
          });
          if (b.detail && !plain) det.appendChild(el('p', 'bank-detail', b.detail));
          if (b.rate_label) det.appendChild(el('p', 'rate-lbl', b.rate_label + ': ' + (b.rate || '—')));
          if (mc) det.appendChild(mc);
          if ((b.sources || []).length) det.appendChild(sourceChips(b.sources));
          c.appendChild(det);
        }
      } else {
        thin.push(b.short);
      }
      grid.appendChild(c);
    });

    // Headline strip: the very next decision across all banks.
    var next = banks.filter(function (o) { return o.days != null; })
      .sort(function (x, y) { return x.days - y.days; })[0];
    var strip = $('#bank-next');
    if (next && strip) {
      strip.textContent = '';
      strip.appendChild(el('span', 'kicker', 'Next decision'));
      var line = el('p', 'bank-next-line');
      line.appendChild(el('b', null, next.b.name));
      line.appendChild(document.createTextNode(' · ' + fmtMeeting(next.nm) + ' · ' + inDays(next.days)));
      strip.appendChild(line);
      strip.hidden = false;
    }
    setText('#bank-foot', thin.length
      ? 'Rates and pricing for ' + thin.join(', ') + ' arrive as the data feed covers them.'
      : '');
  }

  /* ---------------- positioning (COT) ----------------
     data/cot.json (Claude's weekly job; numbers from assets/cot.js) → how
     hedge funds are leaning on each market compared with their own usual
     since 2015. One dot per row (hedge funds), coloured by lean; real money
     only surfaces when it disagrees. Rami, 2026-10-19: no legend, no
     how-to — the row says it in words.
     Safety net: no file, or a report behind → build live from the CFTC in
     the reader's browser with the same code. */
  var cot = { data: null, live: false, focus: '', loading: false };
  /* What a group is betting, in words, from its net position (flip, net as a
     share of open interest). For = betting the market rises. */
  function cotStance(g) {
    var f = g.flip, a = Math.abs(f);
    if (a < 2) return { text: 'Evenly split', tone: 'flat', sign: 0 };
    return { text: (a < 8 ? 'Leaning' : a < 20 ? 'Betting' : 'Strongly') + (f > 0 ? ' for' : ' against'), tone: f > 0 ? 'bull' : 'bear', sign: f > 0 ? 1 : -1 };
  }
  function cotPos(g) { return Math.min(97, Math.max(3, 50 + g.flip)); }
  /* Near an extreme for the hedge funds' net position since 2015? */
  function cotExtreme(m) {
    if (m.hf.pct <= 10) return m.hf.pct < 2 ? 'Lowest since 2015' : 'Near its low since 2015';
    if (m.hf.pct >= 90) return m.hf.pct > 98 ? 'Highest since 2015' : 'Near its high since 2015';
    return '';
  }

  function initCot() {
    fetchJSON('data/cot.json').then(function (d) {
      cot.data = d;
      renderCot();
      if (window.BlueStreetCOT && BlueStreetCOT.isStale(d.report_date)) cotLive();
    }).catch(function () { cotLive(); });
  }

  function cotLive() {
    if (cot.loading || !window.BlueStreetCOT || !window.fetch) { renderCot(); return; }
    cot.loading = true;
    renderCot();
    BlueStreetCOT.build().then(function (d) {
      if (!cot.data || d.report_date > cot.data.report_date) { cot.data = d; cot.live = true; }
    }).catch(function () { /* keep the snapshot */ }).then(function () {
      cot.loading = false;
      renderCot();
      renderFx();
    });
  }

  function cotMarket(id) {
    var ms = (cot.data && cot.data.markets) || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i];
    return null;
  }

  function fmtSigned(x) {
    if (x == null) return '—';
    return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('en-US');
  }
  function fmtCount(x) { return x == null ? '—' : (x < 0 ? '−' : '') + Math.abs(x).toLocaleString('en-US'); }
  function ordinalN(p) {
    if (p < 0.5) return '<1st';
    if (p > 99.5) return '>99th';
    var r = Math.round(p), s = ['th', 'st', 'nd', 'rd'], v = r % 100;
    return r + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function fmtDay(ymd, opts) {
    try {
      return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US',
        Object.assign({ timeZone: 'UTC', month: 'short', day: 'numeric' }, opts || {}));
    } catch (e) { return ymd; }
  }
  /* Next CFTC release after this report: the Friday 3 days after the next
     Tuesday, 3:30 PM New York — shown in the reader's zone. */
  function cotNextRelease(reportDate) {
    var t = new Date(reportDate + 'T00:00:00Z');
    var fri = new Date(t.getTime() + 10 * 864e5);
    var ymd = fri.toISOString().slice(0, 10);
    // 3:30 PM New York = 19:30 UTC (EDT) or 20:30 UTC (EST)
    var probe = new Date(ymd + 'T19:30:00Z');
    var nyH = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(probe);
    var at = nyH === 15 ? probe : new Date(ymd + 'T20:30:00Z');
    return at;
  }

  function stretch(m) { return Math.abs(m.hf.pct - 50); }

  /* Net position on one track: against ← even → for. Hedge funds = filled dot,
     real money = ring; both coloured by which way they lean. */
  function cotGauge(m) {
    var hs = cotStance(m.hf), rs = m.rm ? cotStance(m.rm) : null;
    var g = el('div', 'cg');
    g.setAttribute('role', 'img');
    g.setAttribute('aria-label', 'Hedge funds ' + hs.text.toLowerCase() + ' ' + m.name + (rs ? ', real money ' + rs.text.toLowerCase() : ''));
    var tr = el('div', 'cg-track');
    tr.appendChild(el('i', 'cg-mid'));
    if (m.rm) {
      var r = el('b', 'cg-rm tone-' + rs.tone);
      r.style.left = cotPos(m.rm) + '%';
      tr.appendChild(r);
    }
    var h = el('b', 'cg-hf tone-' + hs.tone);
    h.style.left = cotPos(m.hf) + '%';
    tr.appendChild(h);
    g.appendChild(tr);
    return g;
  }

  /* Weekly net bars (hedge funds), zero line, first/last dates. */
  function cotBars(hist, key, label) {
    var pts = hist.filter(function (h) { return h[key] != null; });
    var wrap = el('figure', 'cb');
    wrap.appendChild(el('figcaption', 'cb-cap', label));
    if (pts.length < 2) return wrap;
    var NS = 'http://www.w3.org/2000/svg', W = 260, H = 70, pad = 2;
    var max = Math.max.apply(null, pts.map(function (p) { return Math.abs(p[key]); })) || 1;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'cb-svg');
    svg.setAttribute('aria-hidden', 'true');
    var bw = (W - pad * 2) / pts.length, mid = H / 2;
    pts.forEach(function (p, i) {
      var v = p[key], hgt = Math.max(1, Math.abs(v) / max * (mid - 3));
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', (pad + i * bw + bw * 0.15).toFixed(2));
      r.setAttribute('width', (bw * 0.7).toFixed(2));
      r.setAttribute('y', (v >= 0 ? mid - hgt : mid).toFixed(2));
      r.setAttribute('height', hgt.toFixed(2));
      r.setAttribute('class', (v >= 0 ? 'cb-pos' : 'cb-neg') + (i === pts.length - 1 ? ' cb-last' : ''));
      var t = document.createElementNS(NS, 'title');
      t.textContent = fmtDay(p.d) + ': ' + fmtSigned(v);
      r.appendChild(t);
      svg.appendChild(r);
    });
    var z = document.createElementNS(NS, 'line');
    z.setAttribute('x1', 0); z.setAttribute('x2', W);
    z.setAttribute('y1', mid); z.setAttribute('y2', mid);
    z.setAttribute('class', 'cb-zero');
    svg.appendChild(z);
    wrap.appendChild(svg);
    var ax = el('div', 'cb-axis meta');
    ax.appendChild(el('span', null, fmtDay(pts[0].d)));
    ax.appendChild(el('span', null, fmtDay(pts[pts.length - 1].d)));
    wrap.appendChild(ax);
    return wrap;
  }

  function cotFigures(g, label) {
    var box = el('div', 'cf');
    box.appendChild(el('p', 'cf-lbl', label));
    var dl = el('dl', 'cf-grid');
    [
      ['Net position', fmtSigned(g.net) + ' contracts · ' + (g.flip > 0 ? '+' : '') + g.flip.toFixed(1) + '% of open interest'],
      ['Longs · shorts', fmtCount(g.long) + ' · ' + fmtCount(g.short)],
      ['Rank since 2015 (low → high)', ordinalN(g.pct) + ' percentile'],
      ['Change over 1 week · 4 weeks', fmtSigned(g.chg1) + ' · ' + fmtSigned(g.chg4)]
    ].forEach(function (r) {
      dl.appendChild(el('dt', null, r[0]));
      dl.appendChild(el('dd', 'mono', r[1]));
    });
    box.appendChild(dl);
    return box;
  }

  function cotRow(m) {
    var d = el('details', 'cot-row gl-scope');
    d.id = 'cot-' + m.id;
    if (cot.focus === m.id) d.open = true;
    var s = el('summary', 'cot-sum');
    s.appendChild(el('span', 'cot-id mono', m.id));
    s.appendChild(el('span', 'cot-name', m.name));
    s.appendChild(cotGauge(m));
    var hs = cotStance(m.hf), rs = m.rm ? cotStance(m.rm) : null;
    var zl = el('span', 'cot-zone');
    [['hf', 'Hedge funds', hs], m.rm ? ['rm', 'Real money', rs] : null].forEach(function (r) {
      if (!r) return;
      var ln = el('span', 'cs-line');
      ln.appendChild(el('i', 'cs-mk ' + r[0] + ' tone-' + r[2].tone));
      ln.appendChild(el('span', 'cs-who', r[1]));
      ln.appendChild(el('b', 'tone-' + r[2].tone, r[2].text));
      zl.appendChild(ln);
    });
    s.appendChild(zl);
    var flags = el('span', 'cot-flags');
    var xt = cotExtreme(m);
    if (xt) flags.appendChild(el('span', 'cot-flag ext', xt));
    if (m.split) flags.appendChild(el('span', 'cot-flag split', 'Real money disagrees'));
    s.appendChild(flags);
    d.appendChild(s);

    var body = el('div', 'cot-body');
    body.appendChild(el('p', 'cot-prose', m.summary));
    body.appendChild(el('p', 'meta cot-means', 'Betting for means betting on ' + m.long_means + '.'));
    var charts = el('div', 'cot-charts');
    charts.appendChild(cotBars(m.history, 'hf', 'Hedge funds · weekly net bet, 26 weeks (up = for)'));
    if (m.rm) charts.appendChild(cotBars(m.history, 'rm', 'Real money · weekly net bet, 26 weeks (up = for)'));
    body.appendChild(charts);
    var det = drawer('Details', 'the numbers');
    var figs = el('div', 'cot-figs');
    figs.appendChild(cotFigures(m.hf, m.hf_label || 'Hedge funds'));
    if (m.rm) figs.appendChild(cotFigures(m.rm, m.rm_label || 'Real money'));
    det.appendChild(figs);
    det.appendChild(el('p', 'meta', m.contract + ' · ' + (m.report === 'TFF' ? 'Traders in Financial Futures' : 'Disaggregated') +
      ' report, futures only · open interest ' + fmtCount(m.oi) + ' · positions as of ' + fmtDay(m.as_of, { year: 'numeric' })));
    det.appendChild(sourceChips(cot.data.sources || []));
    body.appendChild(det);
    if (m.kind === 'fx' && m.id !== 'USD') {
      var a = el('a', 'more', m.name + ' page →');
      a.href = '#fx/' + m.id;
      body.appendChild(a);
    } else if (m.id === 'USD') {
      var u = el('a', 'more', 'US dollar page →');
      u.href = '#fx/USD';
      body.appendChild(u);
    }
    d.appendChild(body);
    return d;
  }

  /* The takeaway, in plain words: any extreme, the biggest bets, where the two
     camps disagree, and the biggest move of the month. */
  function cotTakeaway(ms) {
    var lines = [];
    var ext = ms.filter(function (m) { return m.hf.pct <= 10 || m.hf.pct >= 90; })
      .sort(function (a, b) { return stretch(b) - stretch(a); });
    if (ext.length) {
      lines.push(ext.slice(0, 2).map(function (m) {
        return 'Hedge funds are betting ' + (m.hf.pct <= 10 ? 'less' : 'more') + ' on ' + m.ref + ' rising than at almost any time since 2015.';
      }).join(' ') + ' When positioning is this lopsided, a sharp move the other way is more likely.');
    } else {
      lines.push('Nothing is at an extreme this week. No bet is close to its high or low since 2015.');
    }
    var fxs = ms.filter(function (m) { return m.kind === 'fx'; }).sort(function (a, b) { return b.hf.flip - a.hf.flip; });
    if (fxs.length > 1) {
      var up = fxs[0], dn = fxs[fxs.length - 1], bits = [];
      if (up.hf.flip >= 2) bits.push('their biggest bet for is ' + up.ref);
      if (dn.hf.flip <= -2) bits.push('their biggest bet against is ' + dn.ref);
      if (bits.length) lines.push('Among currencies, ' + bits.join(' and ') + '.');
    }
    var splits = ms.filter(function (m) { return m.split; });
    if (splits.length) {
      var nm = splits.map(function (m) { return m.ref; });
      lines.push('Real money disagrees with the hedge funds on ' + (nm.length > 1 ? nm.slice(0, -1).join(', ') + ' and ' + nm[nm.length - 1] : nm[0]) + '.');
    }
    var mover = ms.slice().filter(function (m) { return m.hf.chg4 != null && m.oi; })
      .sort(function (a, b) { return Math.abs(b.hf.chg4) / b.oi - Math.abs(a.hf.chg4) / a.oi; })[0];
    if (mover) {
      var sh = Math.abs(mover.hf.chg4) / mover.oi * 100, long = mover.hf.net >= 0;
      lines.push('Biggest shift over the past month: hedge funds ' + (sh >= 10 ? 'sharply ' : '') +
        ((long ? mover.hf.chg4 > 0 : mover.hf.chg4 < 0) ? 'added to' : 'cut') + ' their bet ' + (long ? 'on ' : 'against ') + mover.ref + '.');
    }
    return lines;
  }

  function renderCot() {
    var box = $('#cot-body');
    if (!box) return;
    box.textContent = '';
    var d = cot.data;
    if (!d || !(d.markets || []).length) {
      setText('#cot-meta', cot.loading ? 'Loading the latest report from the CFTC…' : 'Positioning data unavailable.');
      return;
    }
    var nxt = cotNextRelease(d.report_date);
    var meta = 'Positions as of ' + fmtDay(d.report_date, { weekday: 'short', year: 'numeric' }) +
      ' · next report ' + nxt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) +
      (cot.live ? ' · computed live from the CFTC' : '');
    if (cot.loading) meta += ' · checking for a newer report…';
    setText('#cot-meta', meta);

    var ms = d.markets;
    var top = el('section', 'card cot-take');
    top.appendChild(el('p', 'kicker', 'This week'));
    var ul = el('ul', 'cot-lines');
    cotTakeaway(ms).forEach(function (l) { ul.appendChild(el('li', null, l)); });
    top.appendChild(ul);
    box.appendChild(top);

    [['fx', 'Currencies', 'What the big traders are betting on each one'],
     ['commodity', 'Commodities', 'The same bet, for the markets that feed the terms-of-trade pillar']].forEach(function (grp) {
      var list = ms.filter(function (m) { return m.kind === grp[0]; })
        .sort(function (a, b) { return Math.abs(b.hf.flip) - Math.abs(a.hf.flip); });
      if (!list.length) return;
      var sec = el('section', 'card cot-group');
      var hd = el('div', 'cot-group-head');
      hd.appendChild(el('h2', 'section-label', grp[1]));
      hd.appendChild(el('span', 'meta', grp[2]));
      sec.appendChild(hd);
      var ax = el('div', 'cot-axis meta');
      ax.appendChild(el('span', 'ca-l', 'Betting against'));
      ax.appendChild(el('span', 'ca-m', 'Even'));
      ax.appendChild(el('span', 'ca-r', 'Betting for'));
      sec.appendChild(ax);
      list.forEach(function (m) { sec.appendChild(cotRow(m)); });
      box.appendChild(sec);
    });

    var about = el('section', 'card cot-how');
    var ab = drawer('About this data', 'where it comes from');
    [
      'Every Friday the CFTC publishes what big traders hold in US futures, as of the Tuesday before. Hedge funds are the fast, trend-following money; real money means slower asset managers.',
      'The dot shows each group’s net position: right of the middle means more of its money is betting the market rises, left means falling. Positioning is context, not a signal, and it runs about three days behind.'
    ].forEach(function (t) { ab.appendChild(el('p', null, t)); });
    ab.appendChild(el('p', 'meta', 'Method: ' + (d.method || '')));
    ab.appendChild(sourceChips(d.sources || []));
    about.appendChild(ab);
    box.appendChild(about);

    if (cot.focus) {
      var row = $('#cot-' + cot.focus);
      if (row && row.scrollIntoView) setTimeout(function () { row.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
    }
  }

  /* Currency page: one line on positioning, linking to the tab. */
  function cotLine(ccy) {
    var m = cotMarket(ccy);
    if (!m) return null;
    var a = el('a', 'fd-cot');
    a.href = '#positioning/' + ccy;
    a.appendChild(el('span', 'callout-lbl', 'Positioning'));
    a.appendChild(el('span', null, 'Hedge funds ' + cotStance(m.hf).text.toLowerCase() + (m.rm ? ' · real money ' + cotStance(m.rm).text.toLowerCase() : '') + ' →'));
    return a;
  }

  /* ---------------- calendar ----------------
     data/calendar.json → filterable, time-zone-aware event list.
     Each event: ts (UTC ISO) or date + time_tbd; ccy; impact; title;
     actual/forecast/previous; better ("higher"/"lower" = good for the
     currency); why / if_beat / if_miss; chapter (story link); bank (joins
     banks.json); sources. Reader prefs persist in localStorage. */
  var CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
  var IMPACTS = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  var TZS = [
    ['local', 'Local time'], ['America/Chicago', 'Chicago (CT)'], ['America/New_York', 'New York (ET)'],
    ['Europe/London', 'London'], ['Asia/Tokyo', 'Tokyo'], ['UTC', 'UTC']
  ];
  var cal = {
    data: null,
    banks: {},
    open: {},
    prefs: { range: 'week', impact: { high: true, medium: true, low: false }, ccy: [], tz: 'local' },
    timer: null
  };

  function makePips(level) {
    var p = el('span', 'pips pips-' + level);
    for (var i = 0; i < 3; i++) p.appendChild(el('i'));
    return p;
  }

  function loadCalPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem('bluestreet-cal') || 'null');
      if (p && typeof p === 'object') {
        if (p.range) cal.prefs.range = p.range;
        if (p.impact) cal.prefs.impact = p.impact;
        if (Array.isArray(p.ccy)) cal.prefs.ccy = p.ccy;
        if (p.tz) cal.prefs.tz = p.tz;
      }
    } catch (e) { /* defaults */ }
  }
  function saveCalPrefs() {
    try { localStorage.setItem('bluestreet-cal', JSON.stringify(cal.prefs)); } catch (e) { /* private mode */ }
  }

  function tzOpt() { return cal.prefs.tz === 'local' ? undefined : cal.prefs.tz; }

  function tzAbbr() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tzOpt(), timeZoneName: 'short' }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'timeZoneName') return parts[i].value;
    } catch (e) {}
    return '';
  }

  /* "YYYY-MM-DD" of a Date in the chosen zone. */
  function dayKeyOf(date) {
    var parts = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tzOpt(), year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + '-' + parts.month + '-' + parts.day;
  }
  function keyAdd(key, n) {
    var p = key.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function keyDow(key) {
    var p = key.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  }
  function keyLabel(key, todayKey) {
    var p = key.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var lbl = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
    if (key === todayKey) return 'Today · ' + lbl;
    if (key === keyAdd(todayKey, 1)) return 'Tomorrow · ' + lbl;
    if (key === keyAdd(todayKey, -1)) return 'Yesterday · ' + lbl;
    return lbl;
  }
  function fmtClock(date) {
    return date.toLocaleTimeString('en-US', { timeZone: tzOpt(), hour: 'numeric', minute: '2-digit' });
  }

  function evWhen(e) { return e.ts ? new Date(e.ts) : null; }
  /* Short zone name for a time ("CDT"), in the reader's chosen zone. */
  function tzAbbr(date) {
    try {
      var parts = date.toLocaleTimeString('en-US', { timeZone: tzOpt(), timeZoneName: 'short' }).split(' ');
      return parts[parts.length - 1];
    } catch (e) { return ''; }
  }
  function evKey(e) { var w = evWhen(e); return w ? dayKeyOf(w) : e.date; }
  /* Sort value: timed events by instant; date-only events at the start of their day. */
  function evSort(e) {
    var w = evWhen(e);
    if (w) return w.getTime();
    var p = (e.date || '').split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) - 1;
  }
  function evUpcoming(e, now, todayKey) {
    var w = evWhen(e);
    return w ? w.getTime() >= now.getTime() : (e.date >= todayKey);
  }

  function num(v) {
    if (v == null) return null;
    var n = parseFloat(String(v).replace(/[,%$¥€£\s]/g, '').replace(/[KMBT]$/i, ''));
    return isFinite(n) ? n : null;
  }
  /* 'good' | 'bad' | 'inline' | null — actual vs forecast, from the currency's view. */
  function surprise(e) {
    var a = num(e.actual), f = num(e.forecast);
    if (a == null || f == null || !e.better) return null;
    if (a === f) return 'inline';
    var up = a > f;
    return (e.better === 'higher' ? up : !up) ? 'good' : 'bad';
  }

  function countdown(ms) {
    if (ms <= 0) return 'now';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    var s = Math.floor((ms % 60000) / 1000);
    return mm + 'm ' + (s < 10 ? '0' : '') + s + 's';
  }

  function initCalendar() {
    loadCalPrefs();
    var sel = $('#cal-tz');
    if (sel) {
      TZS.forEach(function (t) {
        var o = el('option', null, t[1]);
        o.value = t[0];
        sel.appendChild(o);
      });
      sel.value = cal.prefs.tz;
      sel.addEventListener('change', function () { cal.prefs.tz = sel.value; saveCalPrefs(); renderCalendar(); });
    }
    var range = $('#cal-range');
    if (range) range.addEventListener('click', function (e) {
      var b = e.target.closest('[data-range]');
      if (!b) return;
      cal.prefs.range = b.getAttribute('data-range'); saveCalPrefs(); renderCalendar();
    });
    var imp = $('#cal-impact');
    if (imp) {
      IMPACTS.forEach(function (i) {
        var b = el('button', 'fchip imp-' + i[0]);
        b.type = 'button';
        b.setAttribute('data-impact', i[0]);
        b.appendChild(makePips(i[0]));
        b.appendChild(document.createTextNode(i[1]));
        imp.appendChild(b);
      });
      imp.addEventListener('click', function (e) {
        var b = e.target.closest('[data-impact]');
        if (!b) return;
        var k = b.getAttribute('data-impact');
        cal.prefs.impact[k] = !cal.prefs.impact[k]; saveCalPrefs(); renderCalendar();
      });
    }
    var cc = $('#cal-ccy');
    if (cc) {
      ['ALL'].concat(CCYS).forEach(function (c) {
        var b = el('button', 'fchip ccy', c === 'ALL' ? 'All' : c);
        b.type = 'button';
        b.setAttribute('data-ccy', c);
        cc.appendChild(b);
      });
      cc.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ccy]');
        if (!b) return;
        var c = b.getAttribute('data-ccy');
        if (c === 'ALL') cal.prefs.ccy = [];
        else {
          var i = cal.prefs.ccy.indexOf(c);
          if (i >= 0) cal.prefs.ccy.splice(i, 1); else cal.prefs.ccy.push(c);
          if (cal.prefs.ccy.length === CCYS.length) cal.prefs.ccy = [];
        }
        saveCalPrefs(); renderCalendar();
      });
    }
    var list = $('#cal-list');
    if (list) list.addEventListener('click', function (e) {
      var ics = e.target.closest('[data-ics]');
      if (ics) { downloadIcs(ics.getAttribute('data-ics')); return; }
      var row = e.target.closest('.ev-row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      cal.open[id] = !cal.open[id];
      row.setAttribute('aria-expanded', cal.open[id] ? 'true' : 'false');
      var det = row.parentNode.querySelector('.ev-detail');
      if (det) det.hidden = !cal.open[id];
    });
    if (!cal.timer) cal.timer = setInterval(tickCalendar, 1000);
  }

  function filtered(now) {
    var evs = (cal.data && cal.data.events) || [];
    var todayKey = dayKeyOf(now);
    var monday = keyAdd(todayKey, -((keyDow(todayKey) + 6) % 7));
    var lo, hi;
    switch (cal.prefs.range) {
      case 'today': lo = hi = todayKey; break;
      case 'next': lo = keyAdd(monday, 7); hi = keyAdd(monday, 13); break;
      case 'past': lo = keyAdd(todayKey, -7); hi = todayKey; break;
      case 'all': lo = keyAdd(todayKey, -7) < monday ? keyAdd(todayKey, -7) : monday; hi = '9999-12-31'; break;
      default: lo = monday; hi = keyAdd(monday, 6);
    }
    return evs.filter(function (e) {
      var k = evKey(e);
      if (!k || k < lo || k > hi) return false;
      if (!cal.prefs.impact[e.impact]) return false;
      if (cal.prefs.ccy.length && cal.prefs.ccy.indexOf(e.ccy) < 0) return false;
      return true;
    }).sort(function (a, b) { return evSort(a) - evSort(b); });
  }

  function renderCalendar() {
    if (!cal.data) return;
    var now = new Date();
    var todayKey = dayKeyOf(now);

    // Controls reflect prefs.
    Array.prototype.forEach.call(document.querySelectorAll('#cal-range [data-range]'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-range') === cal.prefs.range ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#cal-impact [data-impact]'), function (b) {
      b.setAttribute('aria-pressed', cal.prefs.impact[b.getAttribute('data-impact')] ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#cal-ccy [data-ccy]'), function (b) {
      var c = b.getAttribute('data-ccy');
      var on = c === 'ALL' ? !cal.prefs.ccy.length : cal.prefs.ccy.indexOf(c) >= 0;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var sel = $('#cal-tz');
    if (sel && sel.options.length) sel.options[0].textContent = 'Local time (' + (cal.prefs.tz === 'local' ? tzAbbr() : 'device') + ')';

    renderNextUp(now, todayKey);
    renderUpNext(now);

    var list = $('#cal-list');
    list.textContent = '';
    var evs = filtered(now);
    if (!evs.length) {
      var empty = el('div', 'card cal-empty');
      empty.appendChild(el('p', null, 'No events match these filters.'));
      list.appendChild(empty);
      return;
    }
    var bar = el('div', 'cal-bar');
    bar.appendChild(el('span', 'meta', evs.length + (evs.length === 1 ? ' event' : ' events') + ' · times in ' + tzAbbr()));
    var ex = el('button', 'btn ghost small', 'Add these to my calendar');
    ex.type = 'button';
    ex.setAttribute('data-ics', '__visible');
    bar.appendChild(ex);
    list.appendChild(bar);

    // This week / All: days already gone fold into one "Earlier" line so
    // today and what's next come first. Not in "Last 7 days" (that's the
    // point there), and not when nothing is left to come.
    var fold = null;
    var pastN = evs.filter(function (e) { return evKey(e) < todayKey; }).length;
    if ((cal.prefs.range === 'week' || cal.prefs.range === 'all') && pastN && pastN < evs.length) {
      fold = earlierFold(pastN, cal.prefs.range === 'week' ? 'Earlier this week' : 'Earlier');
      list.appendChild(fold.wrap);
    }

    var group = null, groupKey = null, nowDrawn = false;
    evs.forEach(function (e) {
      var k = evKey(e);
      if (k !== groupKey) {
        groupKey = k;
        group = el('section', 'cal-day card' + (k === todayKey ? ' today' : '') + (k < todayKey ? ' past' : ''));
        group.appendChild(el('h3', 'cal-day-head', keyLabel(k, todayKey)));
        (fold && k < todayKey ? fold.body : list).appendChild(group);
      }
      if (k === todayKey && !nowDrawn && evUpcoming(e, now, todayKey) && evWhen(e)) {
        var nl = el('div', 'now-line');
        nl.appendChild(el('span', null, 'Now · ' + fmtClock(now)));
        group.appendChild(nl);
        nowDrawn = true;
      }
      group.appendChild(eventRow(e, now, todayKey));
    });
    // Today's events all done: put "Now" at the end of today's list.
    var todayGroup = list.querySelector('.cal-day.today');
    if (todayGroup && !nowDrawn) {
      var end = el('div', 'now-line');
      end.appendChild(el('span', null, 'Now \u00b7 ' + fmtClock(now)));
      todayGroup.appendChild(end);
    }
  }

  /* The "Earlier this week · N events" toggle; open state lasts the visit. */
  function earlierFold(n, label) {
    var wrap = el('div', 'cal-earlier' + (cal.earlierOpen ? ' open' : ''));
    var btn = el('button', 'cal-earlier-btn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', cal.earlierOpen ? 'true' : 'false');
    btn.appendChild(el('span', 'ce-lbl', label));
    btn.appendChild(el('span', 'ce-n', n + (n === 1 ? ' event' : ' events')));
    btn.appendChild(el('span', 'ce-act', cal.earlierOpen ? 'Hide' : 'Show'));
    var body = el('div', 'cal-earlier-body');
    body.hidden = !cal.earlierOpen;
    btn.addEventListener('click', function () {
      cal.earlierOpen = !cal.earlierOpen;
      body.hidden = !cal.earlierOpen;
      wrap.classList.toggle('open', cal.earlierOpen);
      btn.setAttribute('aria-expanded', cal.earlierOpen ? 'true' : 'false');
      btn.querySelector('.ce-act').textContent = cal.earlierOpen ? 'Hide' : 'Show';
    });
    wrap.appendChild(btn);
    wrap.appendChild(body);
    return { wrap: wrap, body: body };
  }

  function eventRow(e, now, todayKey) {
    var w = evWhen(e), up = evUpcoming(e, now, todayKey), sp = surprise(e);
    var wrap = el('div', 'ev imp-' + e.impact + (up ? '' : ' past'));
    var row = el('button', 'ev-row');
    row.type = 'button';
    row.setAttribute('data-id', e.id);
    row.setAttribute('aria-expanded', cal.open[e.id] ? 'true' : 'false');

    row.appendChild(el('span', 'ev-time mono', w && !e.time_tbd ? fmtClock(w) : 'TBD'));
    // Currency + impact travel together as one tag.
    var tag = el('span', 'ev-tag');
    tag.appendChild(el('span', 'ev-ccy mono', e.ccy));
    var pips = makePips(e.impact);
    pips.title = e.impact.charAt(0).toUpperCase() + e.impact.slice(1) + ' impact';
    tag.appendChild(pips);
    row.appendChild(tag);

    var t = el('span', 'ev-title');
    var nm = el('span', 'ev-name', e.title);
    if (e.focus && FOCUS_ON) nm.appendChild(el('span', 'ev-focus', 'Focus'));
    t.appendChild(nm);
    if (!up && e.outcome) t.appendChild(el('span', 'ev-outcome', e.outcome));
    if (up && w) {
      var cd = el('span', 'ev-cd', 'in ' + countdown(w - now));
      cd.setAttribute('data-ts', w.getTime());
      t.appendChild(cd);
    }
    row.appendChild(t);

    // Compound values ("+6.1K / 6.5%", "5.300% (b/c 2.77)") show the lead
    // figure, with the rest as a small line under it — no mid-value wraps.
    function cell(lbl, v, cls) {
      var nil = v == null || v === '';
      var c = el('span', 'ev-num' + (nil ? ' nil' : ''));
      c.appendChild(el('small', null, lbl));
      var parts = nil ? ['—'] : String(v).split(/\s+\/\s+|\s+(?=\()/);
      c.appendChild(el('b', 'mono' + (cls ? ' ' + cls : ''), parts[0]));
      if (parts.length > 1) c.appendChild(el('span', 'ev-sub mono', parts.slice(1).join(' · ')));
      return c;
    }
    var nums = el('span', 'ev-nums');
    // Speeches, minutes, auctions without figures: no wall of dashes.
    if ([e.actual, e.forecast, e.previous].some(function (v) { return v != null && v !== ''; })) {
      nums.appendChild(cell('Actual', e.actual, sp ? 'sp-' + sp : null));
      nums.appendChild(cell('Forecast', e.forecast));
      nums.appendChild(cell('Previous', e.previous));
    }
    row.appendChild(nums);
    row.appendChild(el('span', 'ev-caret', '›'));
    wrap.appendChild(row);

    var det = el('div', 'ev-detail gl-scope');
    det.hidden = !cal.open[e.id];
    if (sp && sp !== 'inline') {
      det.appendChild(el('p', 'sp-note sp-' + sp, (sp === 'good' ? 'Beat' : 'Missed') + ' forecast — ' +
        (sp === 'good' ? 'supportive' : 'negative') + ' for ' + e.ccy));
    }
    if (e.outcome && !up) {
      var oc = el('div', 'ev-outcome-box');
      oc.appendChild(el('span', 'callout-lbl', 'What it meant'));
      oc.appendChild(el('p', null, e.outcome));
      det.appendChild(oc);
    }
    if (e.why) det.appendChild(el('p', 'ev-why', e.why));
    // Once the outcome is in, it supersedes the beat/miss branches (speeches
    // and minutes never get an actual) — render-only; the feed keeps all fields.
    var settled = !!e.outcome && !up;
    if (!settled && (e.if_beat || e.if_miss)) {
      var cb = e.category === 'central-bank';
      var g = el('div', 'ev-scen');
      if (e.if_beat) {
        var b1 = el('div', 'sc-box sc-bull');
        b1.appendChild(el('span', 'callout-lbl', cb ? 'Hawkish outcome' : 'If it beats'));
        b1.appendChild(el('p', null, e.if_beat));
        g.appendChild(b1);
      }
      if (e.if_miss) {
        var b2 = el('div', 'sc-box sc-bear');
        b2.appendChild(el('span', 'callout-lbl', cb ? 'Dovish outcome' : 'If it misses'));
        b2.appendChild(el('p', null, e.if_miss));
        g.appendChild(b2);
      }
      det.appendChild(g);
    }
    var bk = e.bank && cal.banks[e.bank];
    if (bk) {
      var bx = el('div', 'ev-bank');
      bx.appendChild(el('span', 'callout-lbl', bk.short + ' today'));
      var bits = [];
      if (bk.rate) bits.push(bk.rate + (bk.rate_label ? ' ' + bk.rate_label.toLowerCase() : ''));
      if (bk.last_move && bk.last_move.bp != null) {
        var lm = ymd(bk.last_move.date);
        bits.push((bk.last_move.bp > 0 ? 'hiked +' + bk.last_move.bp + 'bp' : bk.last_move.bp < 0 ? 'cut ' + bk.last_move.bp + 'bp' : 'held') +
          (lm ? ' ' + MONTHS[lm.getMonth()] + ' ' + lm.getDate() : ''));
      }
      if (bk.priced) bits.push('priced: ' + bk.priced);
      if (bk.bias) bits.push(bk.bias);
      bx.appendChild(el('p', null, bits.join(' · ')));
      det.appendChild(bx);
    }
    var links = el('div', 'ev-links');
    if (e.chapter) {
      var ch = el('a', 'more', 'Read the story chapter →');
      ch.href = '#story/' + e.chapter;
      links.appendChild(ch);
    }
    if (bk) {
      var bl = el('a', 'more', 'Central bank card →');
      bl.href = '#banks';
      links.appendChild(bl);
    }
    var add = el('button', 'btn ghost small', 'Add to calendar');
    add.type = 'button';
    add.setAttribute('data-ics', e.id);
    links.appendChild(add);
    det.appendChild(links);
    if ((e.sources || []).length) det.appendChild(sourceChips(e.sources));
    if (!e.why && !e.if_beat && !(e.outcome && !up) && !bk && !(e.sources || []).length) {
      det.insertBefore(el('p', 'meta', 'No briefing for this event yet.'), det.firstChild);
    }
    wrap.appendChild(det);
    return wrap;
  }

  /* "Up next": the next high-impact event, with a live countdown. */
  function renderUpNext(now) {
    var box = $('#cal-next');
    if (!box || !cal.data) return;
    var todayKey = dayKeyOf(now);
    var evs = (cal.data.events || []).filter(function (e) {
      return e.impact === 'high' && evWhen(e) && evUpcoming(e, now, todayKey);
    }).sort(function (a, b) { return evSort(a) - evSort(b); });
    var e = evs[0];
    if (!e) { box.hidden = true; return; }
    var w = evWhen(e);
    box.textContent = '';
    var left = el('div', 'cn-main');
    left.appendChild(el('span', 'kicker', 'Up next · high impact'));
    var h = el('p', 'cn-title');
    h.appendChild(el('span', 'ev-ccy mono', e.ccy));
    h.appendChild(document.createTextNode(' ' + e.title));
    left.appendChild(h);
    var k = dayKeyOf(w);
    left.appendChild(el('p', 'meta', keyLabel(k, todayKey) + ' · ' + fmtClock(w) + ' ' + tzAbbr() +
      (e.forecast ? ' · forecast ' + e.forecast : '') + (e.previous ? ' · previous ' + e.previous : '')));
    box.appendChild(left);
    var cd = el('div', 'cn-count mono', countdown(w - now));
    cd.setAttribute('data-ts', w.getTime());
    box.appendChild(cd);
    box.hidden = false;
  }

  /* Today tab "Next up": next three high/medium events. */
  function renderNextUp(now, todayKey) {
    var box = $('#today-next');
    if (!box) return;
    box.textContent = '';
    var evs = ((cal.data && cal.data.events) || []).filter(function (e) {
      return e.impact !== 'low' && evUpcoming(e, now, todayKey);
    }).sort(function (a, b) { return evSort(a) - evSort(b); }).slice(0, 2);
    if (!evs.length) { box.appendChild(el('li', 'meta', 'Nothing scheduled.')); return; }
    evs.forEach(function (e) {
      var w = evWhen(e), k = evKey(e), p = k.split('-');
      var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      var row = el('li', e.impact === 'high' ? 'key' : null);
      row.appendChild(el('span', 'n-day mono', d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })));
      var what = el('span', 'n-what', e.ccy + ' · ' + e.title);
      if (w && !e.time_tbd) what.appendChild(el('small', 'n-time', fmtClock(w) + ' ' + tzAbbr(w)));
      row.appendChild(what);
      box.appendChild(row);
    });
  }

  /* Live countdowns; full re-render when an event crosses "now". */
  function tickCalendar() {
    var now = Date.now(), crossed = false;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ts]'), function (n) {
      var ms = +n.getAttribute('data-ts') - now;
      if (ms <= 0) crossed = true;
      n.textContent = (n.classList.contains('ev-cd') ? 'in ' : '') + countdown(ms);
    });
    if (crossed) renderCalendar();
  }

  /* ---- .ics export (one event, or everything currently visible) ---- */
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsEvent(e) {
    var w = evWhen(e), L = ['BEGIN:VEVENT', 'UID:' + e.id + '@bluestreet', 'DTSTAMP:' + icsStamp(new Date())];
    if (w && !e.time_tbd) {
      L.push('DTSTART:' + icsStamp(w), 'DURATION:PT30M');
    } else {
      var k = evKey(e);
      L.push('DTSTART;VALUE=DATE:' + k.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + keyAdd(k, 1).replace(/-/g, ''));
    }
    L.push('SUMMARY:' + icsEsc(e.ccy + ' · ' + e.title));
    var desc = [e.why, e.forecast ? 'Forecast ' + e.forecast : '', e.previous ? 'Previous ' + e.previous : '']
      .filter(Boolean).join('\n');
    if (desc) L.push('DESCRIPTION:' + icsEsc(desc));
    if (w && !e.time_tbd) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.title), 'TRIGGER:-PT15M', 'END:VALARM');
    L.push('END:VEVENT');
    return L.join('\r\n');
  }
  function downloadIcs(which) {
    var evs = (cal.data && cal.data.events) || [];
    var pick = which === '__visible' ? filtered(new Date()) : evs.filter(function (e) { return e.id === which; });
    if (!pick.length) return;
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blue Street//Calendar//EN', 'CALSCALE:GREGORIAN']
      .concat(pick.map(icsEvent)).concat(['END:VCALENDAR']).join('\r\n');
    var blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (which === '__visible' ? 'bluestreet-calendar' : which) + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- currencies ----------------
     data/currencies.json → strength board (sum of pillar scores), currency
     detail (#fx/AUD: breakdown, trend, story, bank, events, best crosses) and
     a pair picker that ranks counterparts by divergence. Carry comes from
     banks.json, event risk from calendar.json. */
  var PILLARS = [
    ['policy', 'Policy'], ['growth', 'Growth'], ['inflation', 'Inflation'], ['risk', 'Risk sentiment'],
    ['tot', 'Terms of trade'], ['positioning', 'Positioning'], ['fiscal', 'Fiscal & sovereign']
  ];
  /* Market quoting convention: the higher-priority currency is the base. */
  var PRIORITY = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  var fx = { data: null, focus: '', dir: 'bull', ccy: 'AUD' };
  /* data/momentum.json — per-currency economic surprises (Hercules). Counting
     starts fresh with the first scored release; MOMENTUM_START is only the
     fallback shown before the feed exists. */
  var momentum = { data: null };
  var MOMENTUM_START = '2026-10-14';

  function initFx() {
    try {
      var p = JSON.parse(localStorage.getItem('bluestreet-fx') || 'null');
      if (p && p.dir) fx.dir = p.dir;
      if (p && p.ccy) fx.ccy = p.ccy;
    } catch (e) { /* defaults */ }
    var dir = $('#fx-dir');
    if (dir) dir.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dir]');
      if (b) { fx.dir = b.getAttribute('data-dir'); saveFx(); renderPicker(); }
    });
    var cc = $('#fx-ccy');
    if (cc) {
      CCYS.forEach(function (c) {
        var b = el('button', 'fchip ccy', c);
        b.type = 'button';
        b.setAttribute('data-ccy', c);
        cc.appendChild(b);
      });
      cc.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ccy]');
        if (b) { fx.ccy = b.getAttribute('data-ccy'); saveFx(); renderPicker(); }
      });
    }
    // "Express it" shortcuts from a currency page preset the picker.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-express]');
      if (!a) return;
      var v = a.getAttribute('data-express').split(':');
      fx.dir = v[0]; fx.ccy = v[1]; saveFx();
    });
  }
  function saveFx() {
    try { localStorage.setItem('bluestreet-fx', JSON.stringify({ dir: fx.dir, ccy: fx.ccy })); } catch (e) {}
  }

  function fxList() { return (fx.data && fx.data.currencies) || []; }
  function fxGet(c) {
    var l = fxList();
    for (var i = 0; i < l.length; i++) if (l[i].ccy === c) return l[i];
    return null;
  }
  function fxScore(c) {
    var d = (c && c.drivers) || {}, t = 0;
    Object.keys(d).forEach(function (k) { t += +d[k].score || 0; });
    return t;
  }
  function fxRanked() {
    return fxList().slice().sort(function (a, b) {
      return fxScore(b) - fxScore(a) || PRIORITY.indexOf(a.ccy) - PRIORITY.indexOf(b.ccy);
    });
  }
  /* Score history for one currency, oldest first; today's live score appended
     if the feed's history doesn't include this edition yet. */
  function fxHistory(c) {
    var h = ((fx.data && fx.data.history) || []).filter(function (x) { return x.scores && x.scores[c.ccy] != null; })
      .map(function (x) { return { date: x.date, v: +x.scores[c.ccy] }; });
    var asOf = fx.data.as_of;
    if (!h.length || h[h.length - 1].date !== asOf) h.push({ date: asOf || 'today', v: fxScore(c) });
    return h;
  }
  function fxDelta(c) {
    var h = fxHistory(c);
    return h.length > 1 ? h[h.length - 1].v - h[h.length - 2].v : null;
  }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }

  function rateNum(bankId) {
    var b = cal.banks[bankId];
    if (!b || !b.rate) return null;
    var m = String(b.rate).match(/-?\d+(\.\d+)?/g);
    if (!m) return null;
    var v = m.map(Number);
    return v.length > 1 ? (v[0] + v[1]) / 2 : v[0];
  }

  /* Upcoming high-impact events for a set of currencies within N days. */
  function eventsFor(ccys, days) {
    var now = new Date(), lim = now.getTime() + days * 864e5;
    var todayKey = dayKeyOf(now);
    return ((cal.data && cal.data.events) || []).filter(function (e) {
      if (e.impact !== 'high' || ccys.indexOf(e.ccy) < 0 || !evUpcoming(e, now, todayKey)) return false;
      var w = evWhen(e);
      return w ? w.getTime() <= lim : true;
    }).sort(function (a, b) { return evSort(a) - evSort(b); });
  }

  /* Rank the 7 crosses for a view, e.g. bullish AUD. */
  function fxPicks(dir, X) {
    var x = fxGet(X);
    if (!x) return [];
    var sx = fxScore(x);
    return fxList().filter(function (y) { return y.ccy !== X; }).map(function (y) {
      var sy = fxScore(y);
      var gap = dir === 'bull' ? sx - sy : sy - sx;
      var base = PRIORITY.indexOf(X) < PRIORITY.indexOf(y.ccy) ? X : y.ccy;
      var quote = base === X ? y.ccy : X;
      var longBase = dir === 'bull' ? base === X : base === y.ccy;
      var rx = rateNum(x.bank), ry = rateNum(y.bank);
      var carry = rx == null || ry == null ? null : (dir === 'bull' ? rx - ry : ry - rx);
      return {
        y: y, sy: sy, gap: gap, pair: base + '/' + quote, action: longBase ? 'Buy' : 'Sell', carry: carry,
        rating: gap >= 2 ? ['Best', 'best'] : gap === 1 ? ['Good', 'good'] : gap === 0 ? ['No edge', 'flat'] : ['Avoid', 'avoid'],
        events: eventsFor([X, y.ccy], 14)
      };
    }).sort(function (a, b) { return b.gap - a.gap || (b.carry || 0) - (a.carry || 0); });
  }

  /* Why this counterpart: its drivers pointing the useful way. */
  function pickWhy(p, dir) {
    var want = dir === 'bull' ? -1 : 1;      // bullish X wants a weak counterpart
    var d = p.y.drivers || {};
    var notes = PILLARS.filter(function (k) { return d[k[0]] && Math.sign(d[k[0]].score) === want; })
      .map(function (k) { return d[k[0]].note; });
    if (p.gap < 0) return p.y.ccy + ' is ' + (dir === 'bull' ? 'stronger' : 'weaker') + ' on the board (' + signed(p.sy) + ') — this cross fights your view.';
    if (notes.length) return notes.slice(0, 2).join(' · ');
    return p.y.summary || '';
  }

  function diverging(score, max) {
    var bar = el('span', 'dbar');
    bar.setAttribute('aria-hidden', 'true');
    var fill = el('i', score >= 0 ? 'pos' : 'neg');
    fill.style.width = (Math.min(Math.abs(score), max) / max * 50) + '%';
    bar.appendChild(fill);
    return bar;
  }

  function renderFx() {
    if (!fx.data) return;
    setText('#fx-asof', fx.data.as_of || '—');
    setText('#fx-method', fx.data.method || '');
    var ranked = fxRanked();
    var max = Math.max(4, Math.max.apply(null, ranked.map(function (c) { return Math.abs(fxScore(c)); })));

    var board = $('#fx-board');
    board.textContent = '';
    ranked.forEach(function (c, i) {
      var li = el('li');
      var a = el('a', 'board-row' + (fx.focus === c.ccy ? ' on' : ''));
      a.href = '#fx/' + c.ccy;
      a.appendChild(el('span', 'b-rank mono', String(i + 1)));
      var id = el('span', 'b-id');
      id.appendChild(el('b', 'mono', c.ccy));
      id.appendChild(el('small', null, c.name));
      a.appendChild(id);
      a.appendChild(diverging(fxScore(c), max));
      a.appendChild(el('span', 'b-score mono', signed(fxScore(c))));
      var dl = fxDelta(c);
      a.appendChild(el('span', 'b-delta mono' + (dl > 0 ? ' up' : dl < 0 ? ' dn' : ''),
        dl == null ? '' : dl === 0 ? '=' : (dl > 0 ? '▲' : '▼') + Math.abs(dl)));
      a.appendChild(el('span', 'b-sum', c.summary || ''));
      li.appendChild(a);
      board.appendChild(li);
    });

    renderFxDetail(ranked, max);
    renderPicker();
    renderLean(ranked);
  }

  /* How many pillars support / weigh on / sit neutral for a currency. */
  function fxTally(c) {
    var t = { pos: 0, neg: 0, zero: 0 };
    PILLARS.forEach(function (k) {
      var d = (c.drivers || {})[k[0]], s = d ? +d.score || 0 : 0;
      t[s > 0 ? 'pos' : s < 0 ? 'neg' : 'zero']++;
    });
    return t;
  }
  function tallyText(t) {
    return t.pos + ' for · ' + t.neg + ' against · ' + t.zero + ' neutral';
  }

  /* ---------- surprise momentum ---------- */
  function momFor(ccy) {
    var cs = momentum.data && momentum.data.currencies;
    var m = cs && cs[ccy];
    var recent = (m && m.recent) || [];
    var n = { beat: 0, miss: 0, inline: 0 };
    recent.forEach(function (r) { if (n[r.result] != null) n[r.result]++; });
    return { m: m || null, recent: recent, n: n };
  }
  function ymd(s) {
    var p = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return p ? new Date(+p[1], +p[2] - 1, +p[3]) : null;
  }
  function shortDate(s) {
    var d = ymd(s);
    return d ? MONTHS[d.getMonth()] + ' ' + d.getDate() : (s || '');
  }
  var MOM_LBL = { beat: 'Beat', miss: 'Missed', inline: 'In line' };

  /* Dots oldest → newest: green beat, red miss, grey in line. */
  function momDots(recent) {
    var row = el('span', 'mom-dots');
    recent.slice().reverse().forEach(function (r) {
      var i = el('i', 'mom-' + (MOM_LBL[r.result] ? r.result : 'inline'));
      i.title = shortDate(r.date) + ' · ' + (r.title || '') + ': ' + (MOM_LBL[r.result] || 'In line') +
        (r.actual != null ? ' (' + r.actual + (r.forecast != null ? ' vs ' + r.forecast : '') + ')' : '');
      row.appendChild(i);
    });
    return row;
  }

  function momentumBlock(c) {
    var wrap = el('div', 'mom');
    wrap.appendChild(el('h2', 'section-label', 'Data surprises'));
    var since = (momentum.data && momentum.data.since) || MOMENTUM_START;
    var s = momFor(c.ccy);
    if (!s.recent.length) {
      wrap.appendChild(el('p', 'meta', momentum.data
        ? 'No ' + c.ccy + ' releases scored since ' + shortDate(since) + ' yet.'
        : 'Tracking starts ' + shortDate(since) + ' with US CPI. From then on every scored release lands here: beat or miss versus expectations, judged by what is good for the currency.'));
      return wrap;
    }
    var top = el('div', 'mom-top');
    top.appendChild(momDots(s.recent));
    top.appendChild(el('span', 'mom-count', 'Beat ' + s.n.beat + ' · missed ' + s.n.miss + ' · in line ' + s.n.inline +
      ' of the last ' + s.recent.length));
    wrap.appendChild(top);
    if (s.m && s.m.note) wrap.appendChild(el('p', 'mom-note', s.m.note));
    var ul = el('ul', 'mom-list');
    s.recent.slice(0, 3).forEach(function (r) {
      var li = el('li', 'mom-' + (MOM_LBL[r.result] ? r.result : 'inline'));
      li.appendChild(el('span', 'mono', shortDate(r.date)));
      var t = el('span');
      t.appendChild(el('b', null, (MOM_LBL[r.result] || 'In line') + ' '));
      t.appendChild(document.createTextNode((r.title || '') +
        (r.actual != null ? ' — ' + r.actual + (r.forecast != null ? ' vs ' + r.forecast + ' expected' : '') : '')));
      li.appendChild(t);
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    wrap.appendChild(el('p', 'meta', 'Since ' + shortDate(since) + '. A beat means better than expected for the currency, not just a higher number.'));
    return wrap;
  }

  /* At a glance: each currency's pillar tally, strongest to weakest. */
  function renderGlanceLean(ranked) {
    var box = $('#glance-lean');
    if (!box) return;
    box.textContent = '';
    ranked.forEach(function (c) {
      var t = fxTally(c), net = t.pos - t.neg;
      var li = el('li', net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero');
      var a = el('a');
      a.href = '#fx/' + c.ccy;
      a.title = c.ccy + ': ' + tallyText(t);
      a.appendChild(el('b', 'mono', c.ccy));
      a.appendChild(el('span', 'mono', t.pos + '–' + t.neg));
      li.appendChild(a);
      box.appendChild(li);
    });
  }

  /* Today: where the evidence leans — every currency's pillars as dots. */
  function renderLean(ranked) {
    renderGlanceLean(ranked);
    var box = $('#today-lean');
    if (!box || !fx.data) return;
    box.textContent = '';
    ranked.forEach(function (c) {
      var li = el('li');
      var a = el('a', 'lean-row');
      a.href = '#fx/' + c.ccy;
      a.appendChild(el('b', 'l-id mono', c.ccy));
      var dots = el('span', 'l-dots');
      PILLARS.forEach(function (k) {
        var d = (c.drivers || {})[k[0]], sc = d ? +d.score || 0 : 0;
        var i = el('i', sc > 0 ? 'pos' : sc < 0 ? 'neg' : 'zero');
        i.title = k[1] + ': ' + (sc > 0 ? 'supports' : sc < 0 ? 'weighs' : 'neutral') + (d && d.note && sc ? ' — ' + d.note : '');
        dots.appendChild(i);
      });
      var t = fxTally(c);
      dots.setAttribute('role', 'img');
      dots.setAttribute('aria-label', c.ccy + ': ' + tallyText(t));
      a.appendChild(dots);
      a.appendChild(el('span', 'l-tally', t.pos + ' for · ' + t.neg + ' against'));
      var s = momFor(c.ccy);
      var dt = el('span', 'l-data mono');
      if (s.recent.length) {
        dt.textContent = 'data ' + s.n.beat + '–' + s.n.miss;
        dt.title = 'Last ' + s.recent.length + ' releases: ' + s.n.beat + ' beat, ' + s.n.miss + ' missed, ' + s.n.inline + ' in line';
      }
      a.appendChild(dt);
      li.appendChild(a);
      box.appendChild(li);
    });
  }

  function renderPicker() {
    if (!fx.data) return;
    Array.prototype.forEach.call(document.querySelectorAll('#fx-dir [data-dir]'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-dir') === fx.dir ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fx-ccy [data-ccy]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-ccy') === fx.ccy ? 'true' : 'false');
    });
    var x = fxGet(fx.ccy);
    setText('#fx-sub', x ? (fx.dir === 'bull' ? 'Bullish ' : 'Bearish ') + fx.ccy + ' (' + signed(fxScore(x)) +
      ' on the board): every cross, grouped by how far the other side sits ' + (fx.dir === 'bull' ? 'below' : 'above') + ' it.' : '');
    var box = $('#fx-picks');
    box.textContent = '';
    var picks = fxPicks(fx.dir, fx.ccy);
    var maxGap = Math.max(3, Math.max.apply(null, picks.map(function (p) { return Math.abs(p.gap); })));
    var tiers = [
      ['edge', 'Strongest edge', 'The other side points the opposite way — both currencies help the trade.',
        function (p) { return p.gap > 0; }],
      ['flat', 'No edge', 'Tied on the board — works only if your view is right. Ordered by carry.',
        function (p) { return p.gap === 0; }],
      ['against', 'Fights your view', 'The other side is moving the same way you expect ' + fx.ccy + ' to.',
        function (p) { return p.gap < 0; }]
    ];
    tiers.forEach(function (t) {
      var rows = picks.filter(t[3]);
      if (!rows.length && t[0] !== 'edge') return;
      var group = el('li', 'pick-group ' + t[0]);
      var head = el('div', 'pick-group-head');
      head.appendChild(el('h3', 'pick-group-title', t[1] + (rows.length ? ' · ' + rows.length : '')));
      head.appendChild(el('p', 'meta pick-group-note', rows.length ? t[2]
        : 'No cross has an edge today — every counterpart is level with or ahead of ' + fx.ccy + ' on the board.'));
      group.appendChild(head);
      if (rows.length) {
        var list = el('ol', 'picks-tier');
        rows.forEach(function (p) { list.appendChild(pickRow(p, maxGap)); });
        group.appendChild(list);
      }
      box.appendChild(group);
    });
  }

  function pickRow(p, maxGap) {
    var li = el('li', 'pick ' + p.rating[1]);
    var top = el('div', 'pick-top');
    // Rami, 2026-10-20: no Buy/Sell (that reads as a call). Say where the pair
    // goes if the reader's view is right.
    var act = el('span', 'pick-act ' + (p.action === 'Buy' ? 'buy' : 'sell'), p.action === 'Buy' ? '↑ Rises' : '↓ Falls');
    act.title = 'Where ' + p.pair + ' goes if your view is right';
    top.appendChild(act);
    top.appendChild(el('b', 'pick-pair mono', p.pair));
    top.appendChild(el('span', 'pick-rate ' + p.rating[1], p.rating[0]));
    var gw = el('span', 'pick-gap');
    gw.title = 'Score divergence between the two sides';
    if (p.gap > 0) {
      var bar = el('span', 'gap-bar');
      bar.setAttribute('aria-hidden', 'true');
      var fill = el('i');
      fill.style.width = (Math.min(p.gap, maxGap) / maxGap * 100) + '%';
      bar.appendChild(fill);
      gw.appendChild(bar);
    }
    gw.appendChild(el('span', 'mono', 'gap ' + signed(p.gap)));
    top.appendChild(gw);
    li.appendChild(top);
    li.appendChild(el('p', 'pick-why', pickWhy(p, fx.dir)));
    var meta = [];
    if (p.carry != null) meta.push('carry ' + (p.carry >= 0 ? '+' : '−') + Math.abs(p.carry).toFixed(2) + '%' + (p.carry >= 0 ? ' (you earn)' : ' (you pay)'));
    if (p.events.length) {
      var e0 = p.events[0], w0 = evWhen(e0);
      meta.push(p.events.length + ' high-impact in 14d — next ' + e0.ccy + ' ' + e0.title +
        (w0 ? ' ' + MONTHS[new Date(w0).getMonth()] + ' ' + new Date(w0).getDate() : ''));
    }
    if (meta.length) li.appendChild(el('p', 'meta pick-meta', meta.join(' · ')));
    return li;
  }

  function renderFxDetail(ranked, max) {
    var box = $('#fx-detail');
    var c = fxGet(fx.focus);
    if (!c) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = '';
    var card = el('article', 'card fx-detail gl-scope');

    var back = el('a', 'more', '← All currencies');
    back.href = '#fx';
    card.appendChild(back);

    var head = el('div', 'fd-head');
    var t = el('div');
    t.appendChild(el('p', 'kicker', '#' + (ranked.indexOf(c) + 1) + ' of ' + ranked.length + ' on the board'));
    var h = el('h1', 'display');
    h.appendChild(el('span', 'mono fd-code', c.ccy));
    h.appendChild(document.createTextNode(' ' + c.name));
    t.appendChild(h);
    if (c.summary) t.appendChild(el('p', 'lede', c.summary));
    head.appendChild(t);
    var sc = el('div', 'fd-score');
    sc.appendChild(el('span', 'fd-num mono', signed(fxScore(c))));
    var dl = fxDelta(c);
    sc.appendChild(el('span', 'meta', dl == null ? 'score' : 'score · ' + (dl === 0 ? 'unchanged' : signed(dl)) + ' vs prior edition'));
    sc.appendChild(el('span', 'meta fd-tally', 'Pillars: ' + tallyText(fxTally(c))));
    head.appendChild(sc);
    card.appendChild(head);

    var cols = el('div', 'fd-cols');

    // What's driving it, as prose: the live drivers' notes, supportive first.
    // The full scored table (all pillars, -1/0/+1) sits behind a tap.
    var bd = el('section', 'fd-break');
    bd.appendChild(el('h2', 'section-label', 'What’s driving it'));
    var live = PILLARS.map(function (k) { return { k: k, d: (c.drivers || {})[k[0]] }; })
      .filter(function (x) { return x.d && +x.d.score && x.d.note; })
      .sort(function (a, b) { return +b.d.score - +a.d.score; });
    var why = el('ul', 'driver-prose');
    if (!live.length) why.appendChild(el('li', 'meta', 'No pillar is moving it today.'));
    live.forEach(function (x) {
      var li = el('li', +x.d.score > 0 ? 'pos' : 'neg');
      li.appendChild(el('span', 'sr-only', +x.d.score > 0 ? 'Supportive: ' : 'Weighing: '));
      li.appendChild(document.createTextNode(x.d.note));
      li.appendChild(el('span', 'dp-pillar', ' · ' + x.k[1]));
      why.appendChild(li);
    });
    bd.appendChild(why);
    var sdet = drawer('Score breakdown', 'all pillars');
    bd.appendChild(sdet);
    var ul = el('ul', 'drivers');
    PILLARS.forEach(function (k) {
      var d = (c.drivers || {})[k[0]];
      var s = d ? +d.score || 0 : 0;
      var li = el('li', s > 0 ? 'pos' : s < 0 ? 'neg' : 'zero');
      var a = el('a', 'dr-name', k[1]);
      a.href = '#engine';
      li.appendChild(a);
      li.appendChild(el('span', 'dr-score mono', s === 0 ? '0' : signed(s)));
      li.appendChild(el('span', 'dr-note', d && d.note ? d.note : 'Not a driver today'));
      ul.appendChild(li);
    });
    sdet.appendChild(ul);
    cols.appendChild(bd);

    var side = el('section', 'fd-side');
    // Trend
    side.appendChild(el('h2', 'section-label', 'Trend'));
    side.appendChild(sparkline(fxHistory(c)));
    side.appendChild(momentumBlock(c));
    var cl = cotLine(c.ccy);
    if (cl) side.appendChild(cl);
    // Story chapter
    if (c.chapter && story && story.chapters && story.chapters[c.chapter - 1]) {
      var sl = el('a', 'fd-story');
      sl.href = '#story/' + c.chapter;
      sl.appendChild(el('span', 'callout-lbl', 'The story behind it'));
      sl.appendChild(el('span', null, story.chapters[c.chapter - 1].title + ' →'));
      side.appendChild(sl);
    }
    // Central bank
    var bk = cal.banks[c.bank];
    if (bk) {
      var bx = el('a', 'fd-bank');
      bx.href = '#banks';
      bx.appendChild(el('span', 'callout-lbl', bk.short));
      bx.appendChild(el('span', null, (bk.rate || '') + (bk.bias ? ' · ' + bk.bias : '') +
        (bk.next_meeting ? ' · next ' + fmtMeeting(bk.next_meeting) : '')));
      side.appendChild(bx);
    }
    // Events
    var evs = eventsFor([c.ccy], 45);
    side.appendChild(el('h2', 'section-label', 'Next high-impact events'));
    var el2 = el('ul', 'fd-events');
    if (!evs.length) el2.appendChild(el('li', 'meta', 'None in the next 6 weeks.'));
    evs.slice(0, 4).forEach(function (e) {
      var w = evWhen(e), li = el('li');
      li.appendChild(el('span', 'mono', w ? MONTHS[w.getMonth()] + ' ' + w.getDate() : e.date));
      li.appendChild(el('span', null, e.title));
      el2.appendChild(li);
    });
    side.appendChild(el2);
    // Latest headlines for this currency (news.json)
    var nItems = ((news.data && news.data.items) || []).filter(function (it) { return newsTouches(it, c.ccy); })
      .sort(function (a, b) { return newsTime(b) - newsTime(a); }).slice(0, 3);
    if (nItems.length) {
      side.appendChild(el('h2', 'section-label', 'In the news'));
      nItems.forEach(function (it) {
        var a = el('a', 'fd-wire fd-news');
        a.href = '#news/' + c.ccy;
        var lb = el('span', 'callout-lbl');
        lb.appendChild(document.createTextNode((it.source || '') + ' · '));
        lb.appendChild(newsWhenEl(it));
        a.appendChild(lb);
        a.appendChild(el('span', null, it.headline));
        var x = (it.impact || []).filter(function (y) { return y.ccy === c.ccy; })[0];
        if (x) { var tg = el('span', 'news-tags'); tg.appendChild(biasTag(x)); a.appendChild(tg); }
        side.appendChild(a);
      });
    }
    // Express it
    side.appendChild(el('h2', 'section-label', 'Express it'));
    [['bull', 'Bullish'], ['bear', 'Bearish']].forEach(function (d) {
      var picks = fxPicks(d[0], c.ccy).filter(function (p) { return p.gap > 0; }).slice(0, 3);
      var row = el('p', 'fd-express');
      var lk = el('a', null, d[1] + ' ' + c.ccy + ':');
      lk.href = '#fx';
      lk.setAttribute('data-express', d[0] + ':' + c.ccy);
      row.appendChild(lk);
      row.appendChild(document.createTextNode(' ' + (picks.length
        ? picks.map(function (p) { return p.pair + (p.action === 'Buy' ? ' rises' : ' falls'); }).join(', ')
        : 'no cross with an edge today')));
      side.appendChild(row);
    });
    cols.appendChild(side);
    card.appendChild(cols);
    box.appendChild(card);
  }

  /* Score trend over editions; needs at least two points to draw. */
  function sparkline(h) {
    var wrap = el('div', 'spark');
    if (h.length < 2) {
      wrap.appendChild(el('p', 'meta', 'Trend builds from the next edition — one point so far (' + signed(h[0].v) + ').'));
      return wrap;
    }
    var W = 260, H = 64, pad = 6, lo = -4, hi = 4;
    h.forEach(function (p) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); });
    var xs = function (i) { return pad + i * (W - 2 * pad) / (h.length - 1); };
    var ys = function (v) { return pad + (hi - v) * (H - 2 * pad) / (hi - lo); };
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'spark-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Score trend: ' + h.map(function (p) { return p.date + ' ' + signed(p.v); }).join(', '));
    var zero = document.createElementNS(NS, 'line');
    zero.setAttribute('x1', pad); zero.setAttribute('x2', W - pad);
    zero.setAttribute('y1', ys(0)); zero.setAttribute('y2', ys(0));
    zero.setAttribute('class', 'spark-zero');
    svg.appendChild(zero);
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', h.map(function (p, i) { return xs(i) + ',' + ys(p.v); }).join(' '));
    line.setAttribute('class', 'spark-line');
    svg.appendChild(line);
    h.forEach(function (p, i) {
      var g = document.createElementNS(NS, 'circle');
      g.setAttribute('cx', xs(i)); g.setAttribute('cy', ys(p.v));
      g.setAttribute('r', i === h.length - 1 ? 4 : 8);
      g.setAttribute('class', i === h.length - 1 ? 'spark-end' : 'spark-hit');
      var tt = document.createElementNS(NS, 'title');
      tt.textContent = p.date + ': ' + signed(p.v);
      g.appendChild(tt);
      svg.appendChild(g);
    });
    wrap.appendChild(svg);
    var first = h[0], last = h[h.length - 1];
    wrap.appendChild(el('p', 'meta', h.length + ' editions · ' + signed(first.v) + ' → ' + signed(last.v)));
    return wrap;
  }

  /* ---------------- Flash (data/latest.json) ----------------
     Bullets prefixed "Numbers:", "Meaning:", "FX:" are split into labelled
     parts. The FX line shows by default; the rest sits behind "Full detail". */
  function splitBullet(b) {
    var m = /^\s*(Numbers|Meaning|FX)\s*:\s*/i.exec(b);
    return m ? { key: m[1].toLowerCase(), text: b.slice(m[0].length) } : { key: null, text: b };
  }

  var COOL_AFTER = 24 * 3600 * 1000;

  /* <time> showing "2h ago"; the exact time is in the tooltip. Kept current
     by tickRelTimes() so an open tab doesn't go stale. */
  function relTimeEl(iso) {
    var t = el('time', 'mono rel', relTime(iso));
    t.dateTime = iso;
    t.title = fmtDateTime(iso, true);
    return t;
  }
  function tickRelTimes() {
    Array.prototype.forEach.call(document.querySelectorAll('time.rel'), function (t) {
      t.textContent = relTime(t.dateTime);
    });
  }

  /* Group wire items into threads (same `thread` id = one developing
     story); items without a thread stand alone. Newest thread first. */
  var wireThreads = [];
  function buildThreads(items) {
    var map = {}, out = [];
    items.forEach(function (it, i) {
      var key = it.thread || ('solo-' + i);
      if (!map[key]) { map[key] = { id: key, items: [] }; out.push(map[key]); }
      map[key].items.push(it);
    });
    out.forEach(function (t) {
      t.items.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
      t.latest = t.items[0];
      t.first = t.items[t.items.length - 1];
      var cc = [];
      t.items.forEach(function (it) {
        (it.ccy || []).forEach(function (c) { if (cc.indexOf(c) < 0) cc.push(c); });
      });
      t.ccy = cc;
      t.pillar = t.latest.pillar || null;
      t.next = t.latest.next || null;
    });
    return out.sort(function (a, b) { return new Date(b.latest.ts) - new Date(a.latest.ts); });
  }

  function pillarName(id) {
    for (var i = 0; i < PILLARS.length; i++) if (PILLARS[i][0] === id) return PILLARS[i][1];
    return id;
  }

  function fxPart(it) {
    var parts = (it.bullets || []).map(splitBullet);
    var f = parts.filter(function (p) { return p.key === 'fx'; })[0];
    return { fx: f, rest: parts.filter(function (p) { return p !== f; }) };
  }

  function detailBlock(rest, label) {
    var det = el('details', 'more-detail');
    det.appendChild(el('summary', null, label || 'Full detail'));
    rest.forEach(function (p) {
      var para = el('p');
      if (p.key) para.appendChild(el('span', 'lbl', p.key === 'numbers' ? 'Numbers' : p.key === 'fx' ? 'FX' : 'Meaning'));
      para.appendChild(document.createTextNode(p.text));
      det.appendChild(para);
    });
    return det;
  }

  /* Which News filter chips a developing thread answers to: its currency
     tags, plus Oil / Gold when the story is about them. */
  var DEV_OIL = /\b(oil|crude|brent|wti|opec|hormuz|tanker|refiner|lng)\b/i, DEV_GOLD = /\bgold\b/i;
  function devMarkets(t) {
    var m = t.ccy.slice(), txt = t.items.map(function (it) { return it.headline || ''; }).join(' ');
    if (t.pillar === 'tot' || DEV_OIL.test(txt)) m.push('OIL');
    if (DEV_GOLD.test(txt)) m.push('XAU');
    return m;
  }
  /* Apply the News market filter to the Developing strip. */
  function filterDev() {
    var box = $('#latest-items');
    if (!box) return;
    var c = news.ccy, shown = 0, shownEarlier = 0;
    Array.prototype.forEach.call(box.querySelectorAll('.thread'), function (w) {
      var ok = !c || (' ' + w.getAttribute('data-mkts') + ' ').indexOf(' ' + c + ' ') >= 0;
      w.hidden = !ok;
      // The first visible live thread spans the row.
      w.classList.toggle('dev-lead', ok && !shown && !w.closest('.dev-earlier'));
      if (ok) { if (w.closest('.dev-earlier')) shownEarlier++; else shown++; }
    });
    var ear = box.querySelector('.dev-earlier');
    if (ear) {
      ear.hidden = !shownEarlier;
      var sm = ear.querySelector('summary');
      if (sm) sm.textContent = 'Earlier stories \u00b7 ' + shownEarlier + ' cooling';
    }
    var empty = $('#dev-empty');
    if (empty) {
      empty.hidden = shown > 0;
      empty.textContent = c ? 'Nothing developing on ' + mktName(c) + ' in the last 24 hours.' : 'Nothing developing in the last 24 hours.';
    }
  }

  function renderWire(d) {
    var box = $('#latest-items');
    var items = (d.items || []).slice();
    focus.wire = items;
    if (focus.data) renderFocus();
    // Rami, 2026-10-18: the Developing strip is gone from the site; latest.json
    // still feeds Focus Mode's live blog, so only the data hand-off above runs.
    if (!box) { wireThreads = buildThreads(items); return; }
    box.textContent = '';
    if (!items.length) {
      box.appendChild(el('p', 'meta', 'Nothing developing right now.'));
      return;
    }
    var threads = buildThreads(items);
    wireThreads = threads;
    // Live threads (an update in the last 24h) lead; cooling ones fold away.
    var liveN = threads.filter(function (t) { return Date.now() - new Date(t.latest.ts).getTime() <= COOL_AFTER; }).length;
    var badge = $('#wire-count');
    if (badge) { badge.textContent = liveN; badge.hidden = !liveN; }
    var earlier = el('details', 'dev-earlier');
    var earlierN = 0;

    threads.forEach(function (t, i) {
      var it = t.latest, n = t.items.length;
      // No update in 24h: the thread is cooling — dimmed, no live pill. It
      // phases out when Hercules prunes it (72h after its last update).
      var cooling = Date.now() - new Date(it.ts).getTime() > COOL_AFTER;
      var w = el('article', 'card wire-item thread gl-scope' + (i === 0 && !cooling ? ' latest' : '') +
        (cooling ? ' cooling' : ''));
      w.id = 'thread-' + t.id;
      w.setAttribute('data-mkts', devMarkets(t).join(' '));

      // Meta: live status, update count, time span
      var meta = el('div', 'wire-meta');
      if (!cooling) {
        if (i === 0) meta.appendChild(el('span', 'live-pill', n > 1 ? 'Developing' : 'Latest'));
        else if (n > 1) meta.appendChild(el('span', 'thread-pill', 'Developing'));
      }
      meta.appendChild(relTimeEl(it.ts));
      if (n > 1) meta.appendChild(el('span', null, '· ' + n + ' updates since ' + fmtDateTime(t.first.ts)));
      w.appendChild(meta);

      var h = el('h3', 'wire-headline');
      var hu = safeUrl(it.url);
      if (hu) h.appendChild(extLink(it.headline, hu)); else h.textContent = it.headline;
      w.appendChild(h);

      // Tags: affected currencies (→ currency page) and pillar (→ engine)
      if (t.ccy.length || t.pillar) {
        var tags = el('div', 'wire-tags');
        t.ccy.forEach(function (c) {
          var a = el('a', 'tag ccy mono');
          a.appendChild(flagEl(c));
          a.appendChild(document.createTextNode(c));
          a.href = '#fx/' + c;
          a.title = c + ' on the strength board';
          tags.appendChild(a);
        });
        if (t.pillar) {
          var pa = el('a', 'tag pillar', pillarName(t.pillar));
          pa.href = '#engine';
          tags.appendChild(pa);
        }
        w.appendChild(tags);
      }

      var parts = fxPart(it);
      if (parts.fx) {
        var fx = el('div', 'fx-callout small');
        fx.appendChild(el('span', 'callout-lbl', 'FX'));
        fx.appendChild(el('p', null, parts.fx.text));
        w.appendChild(fx);
      }
      if (t.next) {
        var nx = el('div', 'wire-next');
        nx.appendChild(el('span', 'callout-lbl', 'What’s next'));
        var nt = t.next.replace(/^Next:\s*/i, '');
        nx.appendChild(el('p', null, nt.charAt(0).toUpperCase() + nt.slice(1)));
        w.appendChild(nx);
      }
      if (parts.rest.length) w.appendChild(detailBlock(parts.rest));
      w.appendChild(sourceChips(it.sources || []));

      // The arc: earlier updates in this thread, newest first
      if (n > 1) {
        var arc = el('details', 'thread-arc');
        arc.appendChild(el('summary', null, 'How it developed \u00b7 ' + n + ' updates'));
        var ol = el('ol', 'arc');
        t.items.forEach(function (u, k) {
          var li = el('li', k === 0 ? 'now' : null);
          li.appendChild(relTimeEl(u.ts));
          var body = el('div', 'arc-body');
          body.appendChild(el('p', 'arc-hl', u.headline));
          if (k > 0) {
            var pp = fxPart(u);
            if (pp.fx) body.appendChild(el('p', 'arc-fx', 'FX: ' + pp.fx.text));
            var rest = pp.rest;
            if (rest.length || (u.sources || []).length) {
              var det = detailBlock(rest, 'Detail');
              if ((u.sources || []).length) det.appendChild(sourceChips(u.sources));
              body.appendChild(det);
            }
          } else {
            body.appendChild(el('p', 'arc-fx meta', 'Latest — above'));
          }
          li.appendChild(body);
          ol.appendChild(li);
        });
        arc.appendChild(ol);
        w.appendChild(arc);
      }
      if (cooling) { earlier.appendChild(w); earlierN++; } else box.appendChild(w);
    });
    if (earlierN) {
      earlier.insertBefore(el('summary', null, 'Earlier stories'), earlier.firstChild);
      box.appendChild(earlier);
    }
    filterDev();

    // Teaser on the Today tab.
    var t0 = threads[0], tz = $('#today-wire');
    if (tz) {
      tz.textContent = '';
      var cool0 = Date.now() - new Date(t0.latest.ts).getTime() > COOL_AFTER;
      var top = el('div', 'gf-top');
      top.appendChild(el('span', cool0 ? 'thread-pill' : 'live-pill',
        (t0.items.length > 1 ? (cool0 ? 'Thread' : 'Developing') : 'Latest') + ' · ' + relTime(t0.latest.ts)));
      if (t0.items.length > 1) top.appendChild(el('span', 'meta', t0.items.length + ' updates'));
      top.appendChild(el('span', 'tk-cta', 'Open News →'));
      tz.appendChild(top);
      tz.appendChild(el('p', 'gf-hl', t0.latest.headline));
      if (t0.ccy.length || t0.pillar) {
        var tags = el('div', 'wire-tags');
        t0.ccy.forEach(function (c) {
          var tg = el('span', 'tag ccy');
          tg.appendChild(flagEl(c));
          tg.appendChild(document.createTextNode(c));
          tags.appendChild(tg);
        });
        if (t0.pillar) tags.appendChild(el('span', 'tag pillar', pillarName(t0.pillar)));
        tz.appendChild(tags);
      }
      if (t0.next) tz.appendChild(el('p', 'gf-next', t0.next));
      tz.hidden = false;
      applyGlance(false);   // the Flash tile may now lead
    }
    renderFx();
  }

  /* ---------------- News (data/news.json, Claude's job) ----------------
     Every headline that matters for FX, read for you: picture, source, time,
     what it does to each currency it touches (headline pressure — evidence,
     not a call), a one-line summary, and on tap the four beats plus a link
     out to the publisher. Repeat headlines on one storyline (same `story`)
     fold into one card with "Earlier on this story". Picking a market
     filters the grid and shows that market's news read (`narratives`). */
  var NEWS_MKTS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'XAU', 'OIL'];
  var NEWS_NAMES = { XAU: 'Gold', OIL: 'Oil' };
  var NEWS_LEAN = {
    bullish: { cls: 'bull', arrow: '▲', word: 'Bullish' },
    bearish: { cls: 'bear', arrow: '▼', word: 'Bearish' },
    mixed:   { cls: 'mixed', arrow: '◆', word: 'Mixed' }
  };
  var NEWS_STRENGTH = { 1: 'mild', 2: 'clear', 3: 'strong' };
  var NEWS_BEATS = [['was', 'What this was'], ['happened', 'What happened'],
    ['means', 'What it means'], ['fx', 'For the currency']];
  var news = { data: null, ccy: '', src: '', open: {}, sort: 'impact' };
  try { if (localStorage.getItem('bluestreet-news-sort') === 'latest') news.sort = 'latest'; } catch (e) { /* private mode */ }
  /* Impact ranking (Rami, 2026-10-18): strongest push on any market first,
     then how many markets it clearly moves, then newest. */
  function newsImpact(it) {
    var imp = (it.impact || []).filter(function (x) { return x && x.ccy; });
    var top = 0, clear = 0;
    imp.forEach(function (x) { var st = +x.strength || 1; if (st > top) top = st; if (st >= 2) clear++; });
    return top * 10 + Math.min(clear, 9);
  }

  function mktName(c) { return NEWS_NAMES[c] || c; }
  /* Country flag (or a gold / oil icon) beside a market code. Local SVGs in
     assets/flags — emoji flags don't render on Windows. */
  var FLAG_FILE = { USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', CHF: 'ch', CAD: 'ca', AUD: 'au', NZD: 'nz', XAU: 'xau', OIL: 'oil' };
  function flagEl(c) {
    var f = FLAG_FILE[c];
    if (!f) return document.createTextNode('');
    var i = document.createElement('img');
    i.className = 'flag';
    i.src = 'assets/flags/' + f + '.svg';
    i.alt = '';
    i.width = 16; i.height = 12;
    i.decoding = 'async';
    return i;
  }
  /* Items carry `ts` (exact) or, when the publisher shows no time, `date`
     (YYYY-MM-DD, sorted as midday UTC and shown as the date). */
  function newsTime(it) { return new Date(it.ts || (it.date + 'T12:00:00Z')).getTime() || 0; }
  function newsWhenEl(it) {
    if (it.ts) return relTimeEl(it.ts);
    var d = new Date(it.date + 'T12:00:00Z');
    return el('span', 'mono', isFinite(d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : it.date);
  }

  function initNews() {
    // A headline tapped on a Today card opens expanded on News.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-open-news]');
      if (!a) return;
      var id = a.getAttribute('data-open-news');
      news.open[id] = true;
      news.pending = id;
    }, true);
    var row = $('#news-mkts');
    if (row) {
      [''].concat(NEWS_MKTS).forEach(function (c) {
        var b = el('button', 'fchip ccy');
        b.type = 'button';
        b.setAttribute('data-mkt', c);
        if (c) b.appendChild(flagEl(c));
        b.appendChild(el('span', null, c ? mktName(c) : 'All'));
        row.appendChild(b);
      });
      row.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mkt]');
        if (!b) return;
        var c = b.getAttribute('data-mkt');
        if (c === news.ccy) c = '';               // tap again = back to all
        history.replaceState(null, '', c ? '#news/' + c : '#news');
        news.ccy = c;
        renderNews();
      });
    }
    var srcSel = $('#news-src');
    if (srcSel) srcSel.addEventListener('change', function () {
      news.src = srcSel.value;
      renderNews();
    });
    var sortBox = $('#news-sort');
    if (sortBox) sortBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sort]');
      if (!b) return;
      news.sort = b.getAttribute('data-sort');
      try { localStorage.setItem('bluestreet-news-sort', news.sort); } catch (er) { /* private mode */ }
      renderNews();
    });
    var grid = $('#news-grid');
    if (grid) grid.addEventListener('click', function (e) {
      var t = e.target.closest('[data-news-toggle]');
      if (!t) return;
      var id = t.getAttribute('data-news-toggle');
      news.open[id] = !news.open[id];
      renderNews();
      var card = document.getElementById('news-' + id);
      if (card && news.open[id] && card.scrollIntoView) {
        var r = card.getBoundingClientRect();
        if (r.top < 60 || r.top > window.innerHeight * 0.6) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  }

  /* Group by storyline; newest item leads; storylines sort by their newest. */
  function newsStories(items) {
    var map = {}, out = [];
    items.forEach(function (it, i) {
      // Rami, 2026-10-18: every article gets its own card (no folding).
      var key = it.id || it.url || ('n' + i);
      if (!map[key]) { map[key] = { id: slugId(key), title: it.story_title || null, items: [] }; out.push(map[key]); }
      map[key].items.push(it);
      if (!map[key].title && it.story_title) map[key].title = it.story_title;
    });
    out.forEach(function (s) {
      s.items.sort(function (a, b) { return newsTime(b) - newsTime(a); });
      s.lead = s.items[0];
    });
    return out.sort(function (a, b) { return newsTime(b.lead) - newsTime(a.lead); });
  }

  function newsTouches(it, c) {
    return (it.impact || []).some(function (x) { return x && x.ccy === c; });
  }

  /* A tiny trend line: rising (bullish, green), falling (bearish, red),
     choppy (mixed, gold). Rami, 2026-10-18: colour + line, no words. */
  var TREND_PATHS = { bull: 'M1 9 L5 5.5 L8 7 L15 1.5', bear: 'M1 1.5 L5 5 L8 3.5 L15 9', mixed: 'M1 6 L4.5 3 L8 7 L11.5 4 L15 6' };
  function trendIcon(cls) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 10');
    svg.setAttribute('class', 'trend-ico');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', TREND_PATHS[cls] || TREND_PATHS.mixed);
    svg.appendChild(path);
    return svg;
  }
  function biasTag(x) {
    var L = NEWS_LEAN[x.dir] || NEWS_LEAN.mixed;
    var t = el('span', 'bias-tag ' + L.cls);
    t.appendChild(trendIcon(L.cls));
    t.appendChild(flagEl(x.ccy));
    t.appendChild(el('span', 'mono', mktName(x.ccy)));
    t.appendChild(el('span', 'sr-only', ' ' + L.word.toLowerCase()));
    t.title = L.word + ' for ' + mktName(x.ccy) + ' — headline pressure, not a call';
    return t;
  }

  /* Publisher preview image when we have one; otherwise (or if it fails to
     load) a generated tile: the market it moves most, and the pillar. */
  function newsFigure(it) {
    var fig = el('div', 'news-fig');
    var main = (it.impact || [])[0];
    function fallback() {
      fig.textContent = '';
      fig.className = 'news-fig fallback' + (main ? ' ' + ((NEWS_LEAN[main.dir] || NEWS_LEAN.mixed).cls) : '');
      fig.appendChild(el('span', 'nf-mkt', main ? mktName(main.ccy) : 'FX'));
    }
    var src = safeUrl(it.image);
    if (!src) { fallback(); return fig; }
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', fallback);
    img.src = src;
    fig.appendChild(img);
    return fig;
  }

  function renderNews() {
    var grid = $('#news-grid');
    if (!grid || !news.data) return;
    var all = (news.data.items || []).filter(function (it) { return it && it.headline && (it.ts || it.date); });
    if (news.data.updated) setText('#news-updated', relTime(news.data.updated));

    // Market chips: pressed state; markets with no stories are dimmed.
    var stAll = newsStories(all);
    Array.prototype.forEach.call(document.querySelectorAll('#news-mkts [data-mkt]'), function (b) {
      var c = b.getAttribute('data-mkt');
      b.setAttribute('aria-pressed', c === news.ccy ? 'true' : 'false');
      var n = c ? stAll.filter(function (s) { return s.items.some(function (it) { return newsTouches(it, c); }); }).length : stAll.length;
      b.classList.toggle('empty', !n);
    });

    // Source chips (only worth showing with 2+ publishers).
    var srcs = [];
    all.forEach(function (it) { if (it.source && srcs.indexOf(it.source) < 0) srcs.push(it.source); });
    srcs.sort();
    if (news.src && srcs.indexOf(news.src) < 0) news.src = '';
    var srcSel = $('#news-src');
    if (srcSel) {
      srcSel.textContent = '';
      [''].concat(srcs).forEach(function (s) {
        var o = el('option', null, s || 'All sources');
        o.value = s;
        srcSel.appendChild(o);
      });
      srcSel.value = news.src;
      srcSel.parentNode.hidden = srcs.length < 2;
    }

    // The news read for the picked market.
    var nb = $('#news-read');
    nb.textContent = '';
    var nr = news.ccy && news.data.narratives && news.data.narratives[news.ccy];
    nb.hidden = !nr || !nr.text;
    if (!nb.hidden) {
      var head = el('div', 'nr-head');
      var kk = el('span', 'kicker nr-kicker');
      kk.appendChild(flagEl(news.ccy));
      kk.appendChild(document.createTextNode(mktName(news.ccy) + ' · the news read'));
      head.appendChild(kk);
      var L = NEWS_LEAN[nr.lean];
      if (L) {
        var pill = el('span', 'bias-pill ' + L.cls);
        pill.appendChild(trendIcon(L.cls));
        pill.appendChild(el('span', 'sr-only', L.word + ' lean'));
        pill.title = 'Headlines lean ' + L.word.toLowerCase() + ' — evidence, not a call';
        head.appendChild(pill);
      }
      nb.appendChild(head);
      nb.appendChild(el('p', 'nr-text', nr.text));
      var foot = el('p', 'meta');
      foot.appendChild(document.createTextNode('What today’s headlines add up to — evidence, not a call'));
      if (nr.ts) { foot.appendChild(document.createTextNode(' · ')); foot.appendChild(relTimeEl(nr.ts)); }
      if (NEWS_MKTS.slice(0, 8).indexOf(news.ccy) >= 0) {
        foot.appendChild(document.createTextNode(' · '));
        var a = el('a', null, 'All pillars on ' + news.ccy + ' →');
        a.href = '#fx/' + news.ccy;
        foot.appendChild(a);
      }
      nb.appendChild(foot);
    }

    filterDev();

    // Filter, then group.
    var items = all.filter(function (it) {
      if (news.src && it.source !== news.src) return false;
      return !news.ccy || newsTouches(it, news.ccy);
    });
    var stories = newsStories(items);
    if (news.sort === 'impact') stories.sort(function (a, b) {
      return (newsImpact(b.lead) - newsImpact(a.lead)) || (newsTime(b.lead) - newsTime(a.lead));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#news-sort [data-sort]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-sort') === news.sort ? 'true' : 'false');
    });
    grid.textContent = '';
    if (!stories.length) {
      grid.appendChild(el('p', 'meta news-empty', news.ccy
        ? 'Nothing on ' + mktName(news.ccy) + ' in the current feed.'
        : 'No headlines yet.'));
      return;
    }

    stories.forEach(function (s) {
      var it = s.lead, open = !!news.open[s.id];
      var card = el('article', 'card news-card' + (open ? ' open' : ''));
      card.id = 'news-' + s.id;
      card.appendChild(newsFigure(it));

      var body = el('div', 'news-body');
      var meta = el('div', 'news-meta');
      if (it.pillar) {
        var pp = el('a', 'news-pillar p-' + it.pillar, pillarName(it.pillar));
        pp.href = '#engine';
        pp.title = 'Macro pillar: ' + pillarName(it.pillar);
        meta.appendChild(pp);
      }
      meta.appendChild(el('span', 'news-src', it.source || 'Source'));
      meta.appendChild(newsWhenEl(it));
      body.appendChild(meta);

      var h = el('h3', 'news-hl');
      var hb = el('button', 'news-hl-btn', it.headline);
      hb.type = 'button';
      hb.setAttribute('data-news-toggle', s.id);
      hb.setAttribute('aria-expanded', open ? 'true' : 'false');
      h.appendChild(hb);
      body.appendChild(h);

      var imp = (it.impact || []).filter(function (x) { return x && x.ccy; });
      if (imp.length) {
        var tags = el('div', 'news-tags news-impact');
        imp.forEach(function (x) { tags.appendChild(biasTag(x)); });
        body.appendChild(tags);
      }

      if (it.summary) body.appendChild(el('p', 'news-sum' + (open ? ' gl-scope' : ''), it.summary));

      if (open) {
        var x = el('div', 'news-open gl-scope');
        var beats = it.beats || {};
        var hasBeats = NEWS_BEATS.some(function (b) { return beats[b[0]]; });
        if (hasBeats) {
          x.appendChild(el('h4', 'section-label', 'Key takeaways'));
          var ol = el('ol', 'news-beats');
          NEWS_BEATS.forEach(function (b) {
            if (!beats[b[0]]) return;
            var li = el('li');
            li.appendChild(el('span', 'lbl', b[1]));
            li.appendChild(el('p', null, beats[b[0]]));
            ol.appendChild(li);
          });
          x.appendChild(ol);
        }
        if (imp.some(function (y) { return y.why; })) {
          x.appendChild(el('h4', 'section-label', 'By currency'));
          var ul = el('ul', 'news-why');
          imp.forEach(function (y) {
            var li = el('li');
            li.appendChild(biasTag(y));
            if (y.why) li.appendChild(el('p', null, y.why));
            ul.appendChild(li);
          });
          x.appendChild(ul);
        }
        if (it.watch) {
          var w = el('div', 'wire-next');
          w.appendChild(el('span', 'callout-lbl', 'What would change it'));
          w.appendChild(el('p', null, it.watch));
          x.appendChild(w);
        }
        var go = safeUrl(it.url);
        if (go) {
          var a2 = extLink('Read the full article on ' + (it.source || new URL(go).hostname) + ' ↗', go);
          a2.className = 'btn news-go';
          x.appendChild(a2);
        }
        if (s.items.length > 1) {
          var arc = el('div', 'thread-arc');
          arc.appendChild(el('h4', 'section-label', 'Earlier on this story'));
          var list = el('ol', 'arc');
          s.items.slice(1).forEach(function (u) {
            var li = el('li');
            li.appendChild(newsWhenEl(u));
            var bd = el('div', 'arc-body');
            var hl = el('p', 'arc-hl');
            var uu = safeUrl(u.url);
            if (uu) hl.appendChild(extLink(u.headline, uu)); else hl.textContent = u.headline;
            bd.appendChild(hl);
            if (u.summary) bd.appendChild(el('p', 'arc-fx', u.summary));
            if (u.source) bd.appendChild(el('p', 'meta', u.source));
            li.appendChild(bd);
            list.appendChild(li);
          });
          arc.appendChild(list);
          x.appendChild(arc);
        }
        body.appendChild(x);
      }

      var tg = el('button', 'news-toggle', open ? 'Close' : 'Key takeaways');
      tg.type = 'button';
      tg.setAttribute('data-news-toggle', s.id);
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.appendChild(tg);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  /* ---------------- inline glossary ----------------
     data/glossary.json (Hercules) → known terms in rendered prose get a dotted
     underline; hover (desktop) or tap (touch) shows the definition. Each
     .gl-scope (a chapter, card, wire thread, calendar detail) wraps only the
     FIRST occurrence of each term. Skips links, buttons, headings, figures
     and labels. A MutationObserver picks up every re-render, so render code
     only has to mark its container with .gl-scope. All-caps-style
     abbreviations (2+ capitals: CPI, BoE, OAT) match case-sensitively so
     ordinary words ("oat", "cot") stay plain; everything else matches any case. */
  var gloss = { re: null, map: {}, list: [], byId: {}, loaded: false, pop: null, pinned: null, queued: false };
  var GL_SKIP = 'a, button, summary, h1, h2, time, script, style, .gl, .mono, .fig, .chip, .kicker, ' +
    '.section-label, .callout-lbl, .lbl, .narr-lbl, .drawer-lbl, .tag, .badge, .ev-ccy, .sr-only, ' +
    '.bias-pill, .meet-lbl, .rate-val, .bank-short, .bank-name, .seg';

  function initGlossary() {
    fetchJSON('data/glossary.json').then(function (d) {
      // ?learn-demo previews full explainers before the feed carries any.
      return /[?&]learn-demo\b/.test(location.search) ? mergeLearnDemo(d) : d;
    }).then(function (d) {
      var vars = [];
      (d.terms || []).forEach(function (t, i) {
        if (!t || !t.term || !t.definition) return;
        t.id = slugId(t.id || t.term);
        gloss.byId[t.id] = i;
        gloss.list[i] = t;
        [t.term].concat(t.aliases || []).forEach(function (v) {
          if (!v) return;
          gloss.map[v.toLowerCase()] = { i: i, v: v, exact: (v.match(/[A-Z]/g) || []).length >= 2 };
          vars.push(v);
        });
      });
      gloss.loaded = true;
      renderLearn();
      if (!vars.length) return;
      vars.sort(function (a, b) { return b.length - a.length; });
      var alt = vars.map(function (v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); }).join('|');
      // (prefix)(term) — a capture instead of lookbehind, for older Safari.
      gloss.re = new RegExp('(^|[^A-Za-z\\-])(' + alt + ')(?![A-Za-z])', 'gi');
      glossifyAll();
      if (window.MutationObserver) {
        new MutationObserver(function () {
          if (gloss.queued) return;
          gloss.queued = true;
          requestAnimationFrame(function () { gloss.queued = false; glossifyAll(); });
        }).observe(document.body, { childList: true, subtree: true });
      }
    }).catch(function () { /* glossary is optional */ });
    initGlossPop();
  }

  function glossifyAll() {
    if (!gloss.re) return;
    Array.prototype.forEach.call(document.querySelectorAll('.gl-scope:not([data-gl])'), glossify);
  }

  function glossify(scope) {
    scope.setAttribute('data-gl', '1');
    var used = {}, nodes = [];
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        return p && !p.closest(GL_SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var text = node.nodeValue, re = gloss.re, m, last = 0, frag = null;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var hit = gloss.map[m[2].toLowerCase().replace(/\s+/g, ' ')];
        if (!hit || used[hit.i] || (hit.exact && m[2].replace(/\s+/g, ' ') !== hit.v)) continue;
        used[hit.i] = true;
        frag = frag || document.createDocumentFragment();
        var start = m.index + m[1].length;
        frag.appendChild(document.createTextNode(text.slice(last, start)));
        var g = el('span', 'gl', m[2]);
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('data-gl-i', hit.i);
        g.setAttribute('aria-label', m[2] + ': ' + gloss.list[hit.i].definition);
        frag.appendChild(g);
        last = start + m[2].length;
      }
      if (!frag) return;
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* One shared popover: a tooltip by the term on hover devices, a bottom
     sheet on touch. Fixed-position on <body>, so pinned scenes and cards
     with overflow:hidden never clip it. */
  function initGlossPop() {
    var hover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var pop = el('div', 'gl-pop');
    pop.setAttribute('role', 'tooltip');
    pop.id = 'gl-pop';
    pop.hidden = true;
    pop.appendChild(el('b', 'gl-term'));
    pop.appendChild(el('p', 'gl-def'));
    var more = el('a', 'gl-more', 'Learn more \u2192');   // only for terms that carry a full explainer
    more.hidden = true;
    pop.appendChild(more);
    var x = el('button', 'gl-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close definition');
    pop.appendChild(x);
    document.body.appendChild(pop);
    gloss.pop = pop;

    function show(g, sheet) {
      var t = gloss.list[+g.getAttribute('data-gl-i')];
      if (!t) return;
      pop.querySelector('.gl-term').textContent = t.term;
      pop.querySelector('.gl-def').textContent = t.definition;
      var full = hasDetail(t);
      more.hidden = !full;
      if (full) more.href = '#learn/' + encodeURIComponent(t.id);
      pop.className = 'gl-pop' + (sheet ? ' sheet' : '') + (full ? ' has-more' : '');
      pop.hidden = false;
      g.setAttribute('aria-describedby', 'gl-pop');
      if (sheet) { pop.style.left = pop.style.top = ''; return; }
      var r = g.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
      var top = r.top - h - 10;
      pop.classList.toggle('below', top < 70);
      if (top < 70) top = r.bottom + 10;
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }
    function hide() {
      pop.hidden = true;
      if (gloss.pinned) gloss.pinned.removeAttribute('aria-describedby');
      gloss.pinned = null;
    }
    if (hover) {
      // A tooltip with a "Learn more" link has to be reachable: it stays for a
      // beat after the pointer leaves the term, and while the pointer is on it.
      var hideT = null;
      document.addEventListener('mouseover', function (e) {
        var g = e.target.closest && e.target.closest('.gl');
        if (g && !gloss.pinned) { clearTimeout(hideT); show(g, false); }
      });
      document.addEventListener('mouseout', function (e) {
        var g = e.target.closest && e.target.closest('.gl');
        if (!g || gloss.pinned) return;
        if (pop.classList.contains('has-more')) {
          clearTimeout(hideT);
          hideT = setTimeout(function () { if (!gloss.pinned) pop.hidden = true; }, 220);
        } else {
          pop.hidden = true;
        }
      });
      pop.addEventListener('mouseenter', function () { clearTimeout(hideT); });
      pop.addEventListener('mouseleave', function () { if (!gloss.pinned) pop.hidden = true; });
    }
    document.addEventListener('click', function (e) {
      var g = e.target.closest && e.target.closest('.gl');
      if (g) {
        e.preventDefault();
        if (gloss.pinned === g) { hide(); return; }
        gloss.pinned = g;
        show(g, !hover);
        return;
      }
      if (e.target === x || !pop.contains(e.target)) hide();
    });
    document.addEventListener('keydown', function (e) {
      var g = e.target.closest && e.target.closest('.gl');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); gloss.pinned = g; show(g, !hover); }
      if (e.key === 'Escape') hide();
    });
    document.addEventListener('focusin', function (e) {
      if (e.target.classList && e.target.classList.contains('gl') && hover) show(e.target, false);
    });
    window.addEventListener('scroll', function () { if (!pop.hidden && !pop.classList.contains('sheet')) hide(); }, { passive: true });
    window.addEventListener('hashchange', hide);
  }

  /* ---------------- explain layer: toggle, full explainers, Learn library ----------------
     Layer 1 is the dotted-underline popover above (1–2 lines). Layer 2 is a
     full explainer page, #learn/<term-id>, for terms whose glossary entry
     carries an optional `detail` object (see DESIGN.md). Layer 3 is the
     library, #learn. The read itself never grows: all of it sits behind a tap. */
  function slugId(v) {
    return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function hasDetail(t) {
    var d = t && t.detail;
    return !!(d && typeof d === 'object' && (d.measures || d.why_moves_fx || d.surprise_looks_like));
  }

  function mergeLearnDemo(d) {
    return fetchJSON('assets/glossary-demo.json').then(function (demo) {
      var by = {};
      (demo.terms || []).forEach(function (x) { if (x && x.term) by[x.term.toLowerCase()] = x; });
      (d.terms || []).forEach(function (t) {
        var x = t && t.term && by[t.term.toLowerCase()];
        if (!x) return;
        if (x.detail) t.detail = x.detail;
        if (x.kind) t.kind = x.kind;
      });
      return d;
    }).catch(function () { return d; });
  }

  /* Next / last release for a term's explainer, straight from calendar.json so
     the numbers are never hard-coded in prose. `detail.calendar` is
     {id_prefix: "us-cpi"} or {match: "CPI", ccy: "USD"}. */
  function learnLive(spec) {
    if (!spec || !cal.data || !cal.data.events) return null;
    var evs = cal.data.events.filter(function (e) {
      if (!e) return false;
      if (spec.id_prefix) return (e.id || '').indexOf(spec.id_prefix) === 0;
      if (spec.match) {
        return (e.title || '').toLowerCase().indexOf(String(spec.match).toLowerCase()) >= 0 &&
               (!spec.ccy || e.ccy === spec.ccy);
      }
      return false;
    });
    function key(e) { return new Date(e.ts || (e.date + 'T00:00:00Z')).getTime(); }
    evs = evs.filter(function (e) { return isFinite(key(e)); }).sort(function (a, b) { return key(a) - key(b); });
    var now = Date.now(), next = null, last = null;
    evs.forEach(function (e) {
      if (e.actual != null && e.actual !== '' && key(e) <= now) last = e;
      else if (!next && key(e) > now - 3600000) next = e;
    });
    return (next || last) ? { next: next, last: last } : null;
  }

  function renderLearn() {
    var root = $('#learn-body');
    var h = (location.hash || '').slice(1).split('/');
    if (!root || h[0] !== 'learn') return;
    var id = '';
    try { id = decodeURIComponent(h[1] || ''); } catch (e) { id = h[1] || ''; }
    root.textContent = '';
    var terms = gloss.list.filter(Boolean);
    if (!terms.length) {
      root.appendChild(el('p', 'meta', gloss.loaded ? 'No terms published yet.' : 'Loading…'));
      return;
    }
    if (id && gloss.byId[id] != null) renderLearnTerm(root, gloss.list[gloss.byId[id]]);
    else renderLearnLibrary(root, terms);
  }

  function renderLearnLibrary(root, terms) {
    var head = el('div', 'view-head');
    head.appendChild(el('h1', 'view-title', 'Learn'));
    var full = terms.filter(hasDetail).length;
    root.appendChild(head);

    var search = el('input', 'learn-search');
    search.type = 'search';
    search.placeholder = 'Search terms';
    search.setAttribute('aria-label', 'Search terms');
    root.appendChild(search);
    var out = el('div', 'learn-groups');
    root.appendChild(out);

    function paint() {
      var q = search.value.trim().toLowerCase();
      out.textContent = '';
      var groups = [], idx = {};
      terms.forEach(function (t) {
        if (q) {
          var hay = [t.term, t.definition].concat(t.aliases || []).join(' ').toLowerCase();
          if (hay.indexOf(q) < 0) return;
        }
        var k = t.kind || 'Terms';
        if (idx[k] == null) { idx[k] = groups.length; groups.push({ name: k, items: [] }); }
        groups[idx[k]].items.push(t);
      });
      if (!groups.length) { out.appendChild(el('p', 'meta', 'Nothing matches that.')); return; }
      groups.forEach(function (g) {
        var sec = el('section', 'learn-group');
        sec.appendChild(el('h2', 'section-label', g.name));
        var ul = el('ul', 'learn-list');
        g.items.forEach(function (t) {
          var li = el('li', 'learn-row');
          var name;
          if (hasDetail(t)) {
            name = el('a', 'learn-term', t.term);
            name.href = '#learn/' + encodeURIComponent(t.id);
          } else {
            name = el('span', 'learn-term', t.term);
          }
          li.appendChild(name);
          li.appendChild(el('p', 'learn-def', t.definition));
          if (hasDetail(t)) {
            var more = el('a', 'learn-tag', 'Full explainer →');
            more.href = '#learn/' + encodeURIComponent(t.id);
            li.appendChild(more);
          }
          ul.appendChild(li);
        });
        sec.appendChild(ul);
        out.appendChild(sec);
      });
    }
    search.addEventListener('input', paint);
    paint();
  }

  function renderLearnTerm(root, t) {
    var back = el('a', 'more learn-back', '← All terms');
    back.href = '#learn';
    root.appendChild(back);
    var head = el('div', 'view-head');
    head.appendChild(el('p', 'kicker', t.kind || 'Term'));
    head.appendChild(el('h1', 'view-title', t.term));
    root.appendChild(head);
    root.appendChild(el('p', 'learn-lead', t.definition));
    if (t.aliases && t.aliases.length) root.appendChild(el('p', 'meta', 'Also written: ' + t.aliases.join(', ')));

    var d = t.detail;
    if (!hasDetail(t)) {
      root.appendChild(el('p', 'meta learn-none', 'No full explainer for this one yet.'));
      return;
    }
    var card = el('div', 'card learn-card');
    [['What it measures', 'measures'], ['Why it moves currencies', 'why_moves_fx'],
     ['What a surprise looks like', 'surprise_looks_like']].forEach(function (s) {
      var v = d[s[1]];
      if (!v || (Array.isArray(v) && !v.length)) return;
      var sec = el('section', 'learn-sec');
      sec.appendChild(el('h2', 'section-label', s[0]));
      if (Array.isArray(v)) {
        var ul = el('ul', 'learn-bullets');
        v.forEach(function (x) { ul.appendChild(el('li', null, x)); });
        sec.appendChild(ul);
      } else {
        sec.appendChild(el('p', 'learn-p', v));
      }
      card.appendChild(sec);
    });

    var live = learnLive(d.calendar);
    if (live) {
      var box = el('section', 'learn-live');
      box.appendChild(el('h2', 'section-label', 'Live from the calendar'));
      if (live.next) {
        var n = live.next;
        var when = n.ts ? fmtDateTime(n.ts) : (n.date + ' (time to be confirmed)');
        var bits = [n.title, when];
        if (n.forecast) bits.push('forecast ' + n.forecast);
        if (n.previous) bits.push('previous ' + n.previous);
        box.appendChild(el('p', 'learn-live-row', 'Next: ' + bits.join(' · ')));
      }
      if (live.last) {
        var l = live.last;
        var lb = [l.title, 'actual ' + l.actual];
        if (l.forecast) lb.push('forecast ' + l.forecast);
        if (l.previous) lb.push('previous ' + l.previous);
        box.appendChild(el('p', 'learn-live-row', 'Last: ' + lb.join(' · ')));
      }
      box.appendChild(el('p', 'meta', 'Pulled from the calendar, so it stays current.'));
      card.appendChild(box);
    }
    root.appendChild(card);

    var rel = (d.related_ids || []).filter(function (r) { return gloss.byId[slugId(r)] != null; });
    if (rel.length) {
      var rw = el('div', 'learn-related');
      rw.appendChild(el('span', 'sources-lbl', 'Related'));
      rel.forEach(function (r) {
        var rt = gloss.list[gloss.byId[slugId(r)]];
        var a = el('a', 'chip', rt.term);
        a.href = '#learn/' + encodeURIComponent(rt.id);
        rw.appendChild(a);
      });
      root.appendChild(rw);
    }
    if (d.sources && d.sources.length) root.appendChild(sourceChips(d.sources));
  }

  /* ---------------- focus mode ----------------
     Big event days (FOMC, CPI, payrolls) take over the top of Today in three
     acts, driven by data/focus.json (Hercules) + the wire thread it names:
       preview — story so far → stakes → setup → forks → what to watch, with
                 a countdown to the print;
       live    — the wire thread as a live blog, refreshed every minute;
       recap   — outcome vs expected, pricing, what it does to the thesis.
     Phase comes from the feed, except preview flips to live on this device
     the moment the countdown hits zero (the feed catches up on its next push).
     Event title / time / ccy / chapter join from calendar.json by event_id;
     focus.json may override them. ?focus-demo=preview|live|recap renders
     assets/focus-demo.json with times shifted to now (labelled as a demo). */
  var focus = { data: null, sig: '', wire: [], seen: null, fresh: 0, phase: null,
                demo: null, demoItems: null, timer: 0, title: document.title };
  var FOCUS_ACTS = [['preview', 'Preview'], ['live', 'Live'], ['recap', 'Recap']];

  /* Focus Mode is tabled (Rami, 2026-10-19): it needs a fresh look after the
     redesign. Off = no focus.json polling and no takeover on Today. The code
     stays; ?focus-demo=preview|live|recap still shows it for the redesign. */
  var FOCUS_ON = false;
  function initFocus() {
    var m = /[?&]focus-demo=(preview|live|recap)\b/.exec(location.search);
    if (m) focus.demo = m[1];
    if (!FOCUS_ON && !focus.demo) return;
    pollFocus();
    setInterval(tickFocus, 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      focus.fresh = 0;
      focusTitle();
      pollFocus();
    });
  }

  /* Re-fetch focus.json (and the wire while live). Every minute while an event
     is armed, every five otherwise; paused while the page is hidden. */
  function pollFocus() {
    clearTimeout(focus.timer);
    var next = function () {
      var armed = focus.data && focus.data.active;
      focus.timer = setTimeout(function () { if (!document.hidden) pollFocus(); else next(); },
        armed ? 60000 : 300000);
    };
    if (focus.demo) {
      if (!focus.data) loadDemo();
      return;
    }
    fetch('data/focus.json', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.text() : '{"active":false}';
    }).catch(function () { return null; }).then(function (txt) {
      if (txt == null) return null;   // offline — keep what's on screen
      var changed = txt !== focus.sig;
      focus.sig = txt;
      if (changed) {
        try { focus.data = JSON.parse(txt); } catch (e) { focus.data = null; }
      }
      // While live, pull the wire too (new thread items are the live blog).
      if (focus.data && focus.data.active && focusPhase(focus.data) === 'live') {
        return fetchJSON('data/latest.json').then(renderWire).catch(function () {
          if (changed) renderFocus();
        });
      }
      if (changed) renderFocus();
    }).then(next, next);
  }

  function loadDemo() {
    fetch('assets/focus-demo.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var f = d.focus, now = Date.now();
      var print = now + (focus.demo === 'preview' ? 3 * 3600e3 + 25 * 60e3 : -42 * 60e3);
      f.phase = focus.demo;
      f.ts = new Date(print).toISOString();
      f.demo = true;
      focus.demoItems = focus.demo === 'preview' ? [] : (d.items || []).map(function (it) {
        var c = JSON.parse(JSON.stringify(it));
        c.ts = new Date(print + c.offset_min * 60e3).toISOString();
        return c;
      }).filter(function (it) { return focus.demo === 'recap' || new Date(it.ts) <= now; });
      focus.data = f;
      renderFocus();
    }).catch(function () { /* no demo file */ });
  }

  function focusEvent(f) {
    var evs = (cal.data && cal.data.events) || [];
    for (var i = 0; i < evs.length; i++) if (evs[i].id === f.event_id) return evs[i];
    return {};
  }

  /* Merge the feed with its calendar event. */
  function focusMeta(f) {
    var ev = focusEvent(f);
    var ccy = f.ccy || ev.ccy || [];
    return {
      title: f.title || ev.title || 'Focus event',
      ts: f.ts || ev.ts || null,
      ccy: Array.isArray(ccy) ? ccy : [ccy],
      chapter: f.chapter || ev.chapter || null,
      ev: ev
    };
  }

  function focusPhase(f) {
    var p = f.phase === 'live' || f.phase === 'recap' ? f.phase : 'preview';
    var ts = focusMeta(f).ts;
    if (p === 'preview' && ts && Date.now() >= new Date(ts).getTime()) p = 'live';
    return p;
  }

  /* Thread items for the live blog / recap, newest first. */
  function focusItems(f) {
    if (f.demo) return (focus.demoItems || []).slice().sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
    var tid = f.thread || f.event_id;
    return (focus.wire || []).filter(function (it) { return tid && it.thread === tid; })
      .sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
  }
  function itemKey(it) { return it.ts + '|' + it.headline; }

  function renderFocus() {
    var box = $('#focus'), view = $('#view-today'), badge = $('#focus-badge');
    if (!box) return;
    var f = (FOCUS_ON || focus.demo) ? focus.data : null;
    if (!f || !f.active) {
      box.hidden = true;
      box.textContent = '';
      if (view) view.classList.remove('focus-on');
      if (badge) badge.hidden = true;
      focus.phase = null;
      focusTitle();
      return;
    }
    var phase = focusPhase(f), meta = focusMeta(f), items = focusItems(f);

    // New live updates since the last render (first render seeds silently).
    var keys = items.map(itemKey), freshKeys = {};
    if (focus.seen) keys.forEach(function (k) { if (!focus.seen[k]) freshKeys[k] = true; });
    var nFresh = Object.keys(freshKeys).length;
    if (nFresh && document.hidden) focus.fresh += nFresh;
    focus.seen = {};
    keys.forEach(function (k) { focus.seen[k] = true; });

    // Act change: animate in, and keep the class through the re-renders that
    // follow straight after (wire refresh) so the animation isn't cut.
    if (focus.phase && focus.phase !== phase) focus.flipAt = Date.now();
    focus.phase = phase;
    box.className = 'focus gl-scope phase-' + phase + (Date.now() - (focus.flipAt || 0) < 1500 ? ' flipped' : '');
    box.removeAttribute('data-gl');   // rebuilt below → glossary pass again
    box.textContent = '';
    box.hidden = false;
    if (view) view.classList.add('focus-on');
    if (badge) {
      badge.textContent = phase === 'live' ? 'Live' : phase === 'recap' ? 'Recap' : 'Focus';
      badge.className = 'badge focus-badge ' + phase;
      badge.hidden = false;
    }

    if (f.demo) {
      box.appendChild(el('p', 'focus-demo', 'Demo with sample data — not a real event. Real focus days run from data/focus.json.'));
    }
    box.appendChild(focusHead(f, meta, phase));
    if (phase === 'preview') focusPreview(box, f, meta);
    else if (phase === 'live') focusLive(box, f, meta, items, freshKeys);
    else focusRecap(box, f, meta, items);

    var tail = el('div', 'focus-tail');
    tail.appendChild(el('span', 'kicker', 'Today’s edition'));
    tail.appendChild(el('span', 'meta', 'The rest of the day’s read continues below'));
    box.appendChild(tail);

    focusTitle();
    tickFocus();
    measureScenes();
    queueScroll();
  }

  function focusTitle() {
    var p = focus.phase;
    var pre = p === 'live' ? (focus.fresh ? '(' + focus.fresh + ') ' : '') + '● LIVE · ' : '';
    document.title = pre + focus.title;
  }

  /* Head: act stepper, title, stakes, print time — and the clock for the act. */
  function focusHead(f, meta, phase) {
    var head = el('header', 'focus-head');
    var acts = el('ol', 'focus-acts');
    acts.setAttribute('aria-label', 'Focus mode acts');
    var at = FOCUS_ACTS.map(function (a) { return a[0]; }).indexOf(phase);
    FOCUS_ACTS.forEach(function (a, i) {
      var li = el('li', i < at ? 'done' : i === at ? 'now' : null);
      li.appendChild(el('span', 'mono', String(i + 1)));
      li.appendChild(document.createTextNode(' ' + a[1]));
      if (i === at) li.setAttribute('aria-current', 'step');
      acts.appendChild(li);
    });
    head.appendChild(acts);

    var kick = el('p', 'kicker focus-kicker');
    kick.appendChild(el('span', 'focus-pill ' + phase, phase === 'live' ? 'Live' : phase === 'recap' ? 'Recap' : 'Focus'));
    meta.ccy.forEach(function (c) {
      var a = el('a', 'tag ccy mono', c);
      a.href = '#fx/' + c;
      kick.appendChild(a);
    });
    head.appendChild(kick);
    head.appendChild(el('h1', 'display focus-title', meta.title));
    if (f.stakes) head.appendChild(el('p', 'focus-stakes', f.stakes));

    if (meta.ts) {
      var w = new Date(meta.ts);
      var when = el('p', 'focus-when');
      var ct = w.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
      var mine = fmtClock(w);
      when.appendChild(el('span', null, (phase === 'preview' ? 'Prints ' : 'Printed ') + ct));
      if (tzOpt() || ct.indexOf(mine) < 0) when.appendChild(el('span', 'meta', ' · ' + mine + ' your time'));
      head.appendChild(when);

      if (phase === 'preview') {
        var cd = el('div', 'focus-cd');
        cd.id = 'focus-cd';
        cd.setAttribute('data-focus-ts', w.getTime());   // ticked by tickFocus
        cd.setAttribute('role', 'timer');
        [['d', 'days'], ['h', 'hrs'], ['m', 'min'], ['s', 'sec']].forEach(function (u) {
          var c = el('span', 'cd-cell');
          c.appendChild(el('b', 'mono cd-' + u[0], '--'));
          c.appendChild(el('small', null, u[1]));
          cd.appendChild(c);
        });
        head.appendChild(cd);
      } else {
        var el2 = el('p', 'focus-elapsed mono');
        el2.id = 'focus-elapsed';
        el2.setAttribute('data-focus-ts', w.getTime());
        head.appendChild(el2);
      }
    }
    return head;
  }

  function focusSection(cls, label, sub) {
    var s = el('section', 'focus-sec ' + cls);
    s.setAttribute('data-reveal', '');
    s.appendChild(el('h2', 'section-label', label));
    if (sub) s.appendChild(el('p', 'meta focus-sub', sub));
    return s;
  }

  function beatsList(beats) {
    var ol = el('ol', 'beats');
    beats.forEach(function (b, i) {
      var li = el('li', i === beats.length - 1 ? 'last' : null);
      withFigures(li, b);
      ol.appendChild(li);
    });
    return ol;
  }

  function setupTiles(setup) {
    var g = el('div', 'setup-tiles');
    [['consensus', 'Consensus'], ['previous', 'Previous'], ['priced', 'Priced']].forEach(function (k) {
      if (!setup || !setup[k[0]]) return;
      var t = el('div', 'setup-tile');
      t.appendChild(el('span', 'callout-lbl', k[1]));
      t.appendChild(withFigures(el('p'), setup[k[0]]));
      g.appendChild(t);
    });
    return g;
  }

  /* Forks: conditional branches, never a call. `played` marks the branch the
     print took (recap). */
  function forkCards(forks, played) {
    var g = el('div', 'forks');
    forks.forEach(function (fk, i) {
      var c = el('div', 'fork' + (played == null ? '' : i === played ? ' played' : ' not-played'));
      if (played === i) c.appendChild(el('span', 'fork-flag', 'Played out'));
      var a = el('p', 'fork-if');
      a.appendChild(el('span', 'callout-lbl', 'If'));
      withFigures(a, fk['if'] || '');
      c.appendChild(a);
      var b = el('p', 'fork-then');
      b.appendChild(el('span', 'callout-lbl', 'Then'));
      b.appendChild(document.createTextNode(fk.then || ''));
      c.appendChild(b);
      g.appendChild(c);
    });
    return g;
  }

  function focusPreview(box, f, meta) {
    if ((f.story_so_far || []).length) {
      var s1 = focusSection('sec-story', 'How we got here');
      s1.appendChild(beatsList(f.story_so_far));
      box.appendChild(s1);
    }
    if (f.setup) {
      var s2 = focusSection('sec-setup', 'The setup');
      s2.appendChild(setupTiles(f.setup));
      box.appendChild(s2);
    }
    if ((f.forks || []).length) {
      var s3 = focusSection('sec-forks', 'The forks', 'Conditional branches, not a call — the board is set, you form the bias.');
      s3.appendChild(forkCards(f.forks));
      box.appendChild(s3);
    }
    if ((f.watch || []).length) {
      var s4 = focusSection('sec-watch', 'What to watch');
      var ul = el('ul', 'watch');
      f.watch.forEach(function (w) { ul.appendChild(withFigures(el('li'), w)); });
      s4.appendChild(ul);
      box.appendChild(s4);
    }
    focusLinks(box, f, meta);
  }

  /* The board (setup + forks) stays one tap away while it breaks. */
  function boardBlock(f, open) {
    var d = el('details', 'focus-board');
    if (open) d.open = true;
    d.appendChild(el('summary', null, 'The board — setup & forks'));
    if (f.setup) d.appendChild(setupTiles(f.setup));
    if ((f.forks || []).length) d.appendChild(forkCards(f.forks));
    return d;
  }

  function liveEntry(it, fresh) {
    var li = el('li', 'blog-item' + (fresh ? ' fresh' : ''));
    var t = el('time', 'blog-time mono');
    var w = new Date(it.ts);
    t.dateTime = it.ts;
    t.title = fmtDateTime(it.ts, true);
    t.appendChild(el('b', null, fmtClock(w)));
    t.appendChild(el('small', null, relTime(it.ts)));
    li.appendChild(t);
    var body = el('div', 'blog-body');
    if (fresh) body.appendChild(el('span', 'blog-new', 'New'));
    var h = el('h3', 'blog-hl');
    var hu = safeUrl(it.url);
    if (hu) h.appendChild(extLink(it.headline, hu)); else h.textContent = it.headline;
    body.appendChild(h);
    var parts = fxPart(it);
    if (parts.fx) {
      var fx = el('div', 'fx-callout small');
      fx.appendChild(el('span', 'callout-lbl', 'FX'));
      fx.appendChild(withFigures(el('p'), parts.fx.text));
      body.appendChild(fx);
    }
    parts.rest.forEach(function (p) {
      var para = el('p', 'blog-p');
      if (p.key) para.appendChild(el('span', 'lbl', p.key === 'numbers' ? 'Numbers' : 'Meaning'));
      withFigures(para, p.text);
      body.appendChild(para);
    });
    if ((it.sources || []).length) body.appendChild(sourceChips(it.sources));
    li.appendChild(body);
    return li;
  }

  function focusLive(box, f, meta, items, freshKeys) {
    box.appendChild(boardBlock(f, window.innerWidth >= 760));
    var sec = el('section', 'focus-sec sec-blog');
    var hd = el('div', 'blog-head');
    hd.appendChild(el('h2', 'section-label', 'Live'));
    hd.appendChild(el('span', 'meta', f.demo ? 'Demo updates' : 'Updates appear here as it breaks · refreshes every minute'));
    sec.appendChild(hd);
    if (!items.length) {
      sec.appendChild(el('p', 'blog-empty', 'Waiting for the first update — this page refreshes itself, no need to reload.'));
    } else {
      var ol = el('ol', 'liveblog');
      items.forEach(function (it) { ol.appendChild(liveEntry(it, freshKeys[itemKey(it)])); });
      sec.appendChild(ol);
    }
    var nx = items.length && items[0].next;
    if (nx) {
      var n = el('div', 'wire-next');
      n.appendChild(el('span', 'callout-lbl', 'What’s next'));
      var nt = nx.replace(/^Next:\s*/i, '');
      n.appendChild(el('p', null, nt.charAt(0).toUpperCase() + nt.slice(1)));
      sec.appendChild(n);
    }
    box.appendChild(sec);
    if ((f.watch || []).length) {
      var d = el('details', 'focus-board');
      d.appendChild(el('summary', null, 'What to watch'));
      var ul = el('ul', 'watch');
      f.watch.forEach(function (w) { ul.appendChild(withFigures(el('li'), w)); });
      d.appendChild(ul);
      box.appendChild(d);
    }
  }

  var VERDICTS = { confirms: 'Confirms the thesis', breaks: 'Breaks the thesis', mixed: 'Mixed for the thesis' };

  function focusRecap(box, f, meta, items) {
    var r = f.recap || {};
    if (r.outcome) {
      var o = el('p', 'recap-outcome');
      withFigures(o, r.outcome);
      o.setAttribute('data-reveal', '');
      box.appendChild(o);
    }
    var s1 = focusSection('sec-result', 'Outcome vs expected');
    var tiles = el('div', 'setup-tiles recap-tiles');
    var exp = r.expected || (f.setup && f.setup.consensus);
    [['Actual', r.actual, 'actual'], ['Expected', exp], ['Pricing', r.pricing, 'pricing']].forEach(function (t) {
      if (!t[1]) return;
      var d = el('div', 'setup-tile' + (t[2] ? ' ' + t[2] : ''));
      d.appendChild(el('span', 'callout-lbl', t[0]));
      d.appendChild(withFigures(el('p'), t[1]));
      tiles.appendChild(d);
    });
    if (tiles.childNodes.length) { s1.appendChild(tiles); box.appendChild(s1); }

    var th = r.thesis;
    if (th && (th.verdict || th.note)) {
      var s2 = focusSection('sec-thesis', 'The standing thesis');
      var v = String(th.verdict || '').toLowerCase();
      var card = el('div', 'thesis ' + (VERDICTS[v] ? v : 'mixed'));
      card.appendChild(el('span', 'thesis-verdict', VERDICTS[v] || 'Thesis check'));
      if (th.note) card.appendChild(el('p', null, th.note));
      s2.appendChild(card);
      box.appendChild(s2);
    }
    if ((f.forks || []).length) {
      var played = typeof r.fork === 'number' ? r.fork : null;
      var s3 = focusSection('sec-forks', 'The forks', played == null ? 'The branches set before the print.' : 'Which branch the print took.');
      s3.appendChild(forkCards(f.forks, played));
      box.appendChild(s3);
    }
    if (items.length) {
      var s4 = focusSection('sec-unfold', 'How it unfolded');
      var ol = el('ol', 'arc');
      items.slice().reverse().forEach(function (u) {
        var li = el('li');
        var when = el('time', 'mono', fmtClock(new Date(u.ts)));
        when.dateTime = u.ts;
        when.title = fmtDateTime(u.ts, true);
        li.appendChild(when);
        var b = el('div', 'arc-body');
        b.appendChild(el('p', 'arc-hl', u.headline));
        var pp = fxPart(u);
        if (pp.fx) b.appendChild(el('p', 'arc-fx', 'FX: ' + pp.fx.text));
        li.appendChild(b);
        ol.appendChild(li);
      });
      s4.appendChild(ol);
      box.appendChild(s4);
    }
    if ((f.story_so_far || []).length) {
      var d = el('details', 'focus-board');
      d.appendChild(el('summary', null, 'How we got here'));
      d.appendChild(beatsList(f.story_so_far));
      box.appendChild(d);
    }
    focusLinks(box, f, meta);
  }

  function focusLinks(box, f, meta) {
    var row = el('div', 'focus-links');
    row.setAttribute('data-reveal', '');
    if (meta.chapter && story && (story.chapters || [])[meta.chapter - 1]) {
      var a = el('a', 'btn', 'In the world story: ' + story.chapters[meta.chapter - 1].title + ' →');
      a.href = '#story/' + meta.chapter;
      row.appendChild(a);
    }
    var c = el('a', 'btn ghost', 'On the calendar →');
    c.href = '#calendar';
    row.appendChild(c);
    if ((f.sources || []).length) row.appendChild(sourceChips(f.sources));
    box.appendChild(row);
  }

  /* Every second: countdown / elapsed clock, and the preview → live flip at
     print time. */
  function tickFocus() {
    if (!focus.data || !focus.data.active) return;
    if (focus.phase === 'preview' && focusPhase(focus.data) === 'live') {
      renderFocus();
      pollFocus();          // start pulling the wire right away
      return;
    }
    var now = Date.now();
    var cd = $('#focus-cd');
    if (cd) {
      var ms = Math.max(0, +cd.getAttribute('data-focus-ts') - now);
      var s = Math.floor(ms / 1000);
      var v = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
      Object.keys(v).forEach(function (k) {
        var n = cd.querySelector('.cd-' + k);
        if (n) n.textContent = pad2(v[k]);
      });
      cd.classList.toggle('no-days', v.d === 0);
      cd.classList.toggle('soon', ms < 15 * 60000);
      cd.setAttribute('aria-label', 'Prints in ' + countdown(ms));
    }
    var ep = $('#focus-elapsed');
    if (ep) {
      var mins = Math.max(0, Math.floor((now - +ep.getAttribute('data-focus-ts')) / 60000));
      ep.textContent = mins < 1 ? 'Just printed' : (mins < 60 ? mins + ' min' : Math.floor(mins / 60) + 'h ' + pad2(mins % 60) + 'm') + ' since the print';
    }
  }

})();
