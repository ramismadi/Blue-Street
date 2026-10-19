/* Blue Street — COT positioning calculator. Plain static JS, no build step.

   One source of truth for the numbers behind data/cot.json and the
   Positioning tab. BlueStreetCOT.build() pulls the CFTC's public Commitments
   of Traders data (Socrata API, CORS-enabled, no key) and returns the
   cot.json object. Used by:
     - Claude's weekly job: runs build() in a browser, commits the result as
       data/cot.json (see DESIGN.md → data/cot.json).
     - The site itself, as a safety net: if data/cot.json is missing or more
       than a report behind, the Positioning tab builds live in the reader's
       browser.

   Method (matches the public method forexfundamentals.com publishes, so the
   numbers are comparable; extended with real money + commodities):
     flip       = (long − short) / open interest × 100
     percentile = mid-rank of the current flip vs every weekly flip since
                  2015-01-06 (inclusive of the current week)
     z-scores   = current flip vs the full history, last 520 and last 52 weeks
     zones      = ≥90 crowded long · ≥60 long-side · ≤40 short-side ·
                  ≤10 crowded short · otherwise neutral
     signal     = contrarian engine score from the hedge-fund (leveraged /
                  managed money) zone: crowded long −1, crowded short +1, else 0
   Currencies use the Traders in Financial Futures report (futures only):
   Leveraged Money = hedge funds & CTAs, Asset Manager = real money.
   Commodities use the Disaggregated report (futures only): Managed Money. */

(function (root) {
  'use strict';

  var API = 'https://publicreporting.cftc.gov/resource/';
  var TFF = 'gpe5-46if';      // Traders in Financial Futures, futures only
  var DISAGG = '72hh-3qpy';   // Disaggregated, futures only
  var SINCE = '2015-01-01';
  var HISTORY_WEEKS = 26;

  var MARKETS = [
    { id: 'USD', ref: 'the dollar', name: 'US dollar',         kind: 'fx', code: '098662', contract: 'ICE US Dollar Index', long_means: 'dollar up against a basket of majors' },
    { id: 'EUR', ref: 'the euro', name: 'Euro',              kind: 'fx', code: '099741', contract: 'CME Euro FX',         long_means: 'euro up against the dollar' },
    { id: 'GBP', ref: 'the pound', name: 'British pound',     kind: 'fx', code: '096742', contract: 'CME British Pound',   long_means: 'pound up against the dollar' },
    { id: 'JPY', ref: 'the yen', name: 'Japanese yen',      kind: 'fx', code: '097741', contract: 'CME Japanese Yen',    long_means: 'yen up against the dollar' },
    { id: 'CHF', ref: 'the franc', name: 'Swiss franc',       kind: 'fx', code: '092741', contract: 'CME Swiss Franc',     long_means: 'franc up against the dollar' },
    { id: 'CAD', ref: 'the Canadian dollar', name: 'Canadian dollar',   kind: 'fx', code: '090741', contract: 'CME Canadian Dollar', long_means: 'Canadian dollar up against the US dollar' },
    { id: 'AUD', ref: 'the Aussie', name: 'Australian dollar', kind: 'fx', code: '232741', contract: 'CME Australian Dollar', long_means: 'Aussie up against the US dollar' },
    { id: 'NZD', ref: 'the kiwi', name: 'New Zealand dollar', kind: 'fx', code: '112741', contract: 'CME NZ Dollar',      long_means: 'kiwi up against the US dollar' },
    { id: 'XAU', ref: 'gold', name: 'Gold',              kind: 'commodity', code: '088691', contract: 'COMEX Gold',     long_means: 'gold price up' },
    { id: 'XAG', ref: 'silver', name: 'Silver',            kind: 'commodity', code: '084691', contract: 'COMEX Silver',   long_means: 'silver price up' },
    { id: 'WTI', ref: 'oil', name: 'WTI crude oil',     kind: 'commodity', code: '067651', contract: 'NYMEX WTI',      long_means: 'oil price up' },
    { id: 'HG', ref: 'copper',  name: 'Copper',            kind: 'commodity', code: '085692', contract: 'COMEX Copper',   long_means: 'copper price up' }
  ];

  var GROUPS = {
    hf: { fx: 'Hedge funds & CTAs (Leveraged Money)', commodity: 'Hedge funds & CTAs (Managed Money)' },
    rm: { fx: 'Real money (Asset Managers)' }
  };

  function query(dataset, select, codes) {
    var where = "report_date_as_yyyy_mm_dd>='" + SINCE + "' AND cftc_contract_market_code in(" +
      codes.map(function (c) { return "'" + c + "'"; }).join(',') + ')';
    var q = '$select=' + select + '&$where=' + where +
      '&$order=report_date_as_yyyy_mm_dd&$limit=50000';
    return fetch(API + dataset + '.json?' + encodeURI(q).replace(/'/g, '%27'))
      .then(function (r) {
        if (!r.ok) throw new Error('CFTC HTTP ' + r.status);
        return r.json();
      });
  }

  function mean(a) { return a.reduce(function (p, q) { return p + q; }, 0) / a.length; }
  function zOf(cur, a) {
    if (a.length < 2) return null;
    var m = mean(a);
    var sd = Math.sqrt(a.reduce(function (p, q) { return p + (q - m) * (q - m); }, 0) / a.length);
    return sd ? round((cur - m) / sd, 2) : null;
  }
  function round(x, n) { var f = Math.pow(10, n); return Math.round(x * f) / f; }

  function zone(pct) {
    if (pct >= 90) return 'crowded long';
    if (pct >= 60) return 'long-side';
    if (pct <= 10) return 'crowded short';
    if (pct <= 40) return 'short-side';
    return 'neutral';
  }
  function side(z) {
    return /long/.test(z) ? 1 : /short/.test(z) ? -1 : 0;
  }

  /* weeks: [{d, l, s, oi}] oldest → newest */
  function stats(weeks) {
    var flips = weeks.map(function (w) { return (w.l - w.s) / w.oi * 100; });
    var nets = weeks.map(function (w) { return w.l - w.s; });
    var n = flips.length, cur = flips[n - 1], net = nets[n - 1];
    var below = 0, equal = 0;
    flips.forEach(function (f) { if (f < cur) below++; else if (f === cur) equal++; });
    var pct = round((below + equal / 2) / n * 100, 1);
    var last12 = nets.slice(-12);
    var lo = Math.min.apply(null, last12), hi = Math.max.apply(null, last12);
    var last = weeks[n - 1];
    return {
      net: net,
      long: last.l,
      short: last.s,
      flip: round(cur, 2),
      pct: pct,
      zone: zone(pct),
      z: { all: zOf(cur, flips), y10: zOf(cur, flips.slice(-520)), y1: zOf(cur, flips.slice(-52)) },
      range12: hi === lo ? 50 : Math.round((net - lo) / (hi - lo) * 100),
      chg1: n > 1 ? net - nets[n - 2] : null,
      chg4: n > 4 ? net - nets[n - 5] : null,
      weeks: n,
      since: weeks[0].d
    };
  }

  function fmtInt(x) {
    return (x < 0 ? '−' : '') + Math.abs(x).toLocaleString('en-US');
  }
  function ordinal(p) {
    var r = Math.round(p), s = ['th', 'st', 'nd', 'rd'], v = r % 100;
    return r + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function pctText(p) {
    if (p < 0.5) return 'the lowest reading since 2015';
    if (p > 99.5) return 'the highest reading since 2015';
    return ordinal(p) + ' percentile';
  }

  /* "net long, but light for them" — the absolute side and where it sits in
     its own history are different things, and the sentence says both. */
  function stance(g) {
    var dir = g.net >= 0 ? 'net long' : 'net short';
    var s = side(g.zone), sign = g.net >= 0 ? 1 : -1;
    var rel = g.zone === 'neutral' ? 'mid-range for them'
      : g.zone === 'crowded long' ? (sign > 0 ? 'a crowded long by their own history' : 'yet the most long-leaning they get — crowded long by their own history')
      : g.zone === 'crowded short' ? (sign < 0 ? 'a crowded short by their own history' : 'but the lightest they get — crowded short by their own history')
      : s === sign ? 'heavier than usual'
      : (s > 0 ? 'but less short than usual' : 'but lighter than usual');
    return dir + ', ' + rel + ' (' + pctText(g.pct) + ')';
  }

  /* What the last four weeks did to the net position, in trader terms. */
  function flow(g) {
    var c = g.chg4;
    if (c == null || c === 0) return '';
    var was = g.net - c, amt = fmtInt(Math.abs(c));
    if (was >= 0 && g.net >= 0) return c > 0 ? 'added ' + amt + ' contracts to their net long' : 'cut their net long by ' + amt + ' contracts';
    if (was < 0 && g.net < 0) return c < 0 ? 'added ' + amt + ' contracts to their net short' : 'cut their net short by ' + amt + ' contracts';
    return c > 0 ? 'flipped from net short to net long' : 'flipped from net long to net short';
  }

  function summarize(m) {
    var hf = m.hf;
    var s = 'Hedge funds are ' + stance(hf).replace(/^(net (?:long|short))/, '$1 ' + m.ref) + '.';
    var f = flow(hf);
    if (f) s += ' Over four weeks they ' + f + '.';
    if (hf.range12 === 0 || hf.range12 === 100) {
      s += ' That is the ' + (hf.range12 === 0 ? 'lowest' : 'highest') + ' net position in 12 weeks.';
    }
    if (m.rm) {
      s += ' Real money is ' + stance(m.rm) + (m.split ? ' — leaning the other way from the hedge funds.' : '.');
    }
    return s;
  }

  function build() {
    var fxM = MARKETS.filter(function (m) { return m.kind === 'fx'; });
    var cmM = MARKETS.filter(function (m) { return m.kind === 'commodity'; });
    var tffSel = 'report_date_as_yyyy_mm_dd,cftc_contract_market_code,open_interest_all,' +
      'lev_money_positions_long,lev_money_positions_short,asset_mgr_positions_long,asset_mgr_positions_short';
    var disSel = 'report_date_as_yyyy_mm_dd,cftc_contract_market_code,open_interest_all,' +
      'm_money_positions_long_all,m_money_positions_short_all';
    return Promise.all([
      query(TFF, tffSel, fxM.map(function (m) { return m.code; })),
      query(DISAGG, disSel, cmM.map(function (m) { return m.code; }))
    ]).then(function (res) {
      var tff = res[0], dis = res[1];
      var reportDate = null;
      var markets = MARKETS.map(function (def) {
        var rows = (def.kind === 'fx' ? tff : dis).filter(function (r) {
          return r.cftc_contract_market_code === def.code && +r.open_interest_all > 0;
        });
        if (!rows.length) return null;
        var hfW = rows.map(function (r) {
          return def.kind === 'fx'
            ? { d: r.report_date_as_yyyy_mm_dd.slice(0, 10), l: +r.lev_money_positions_long, s: +r.lev_money_positions_short, oi: +r.open_interest_all }
            : { d: r.report_date_as_yyyy_mm_dd.slice(0, 10), l: +r.m_money_positions_long_all, s: +r.m_money_positions_short_all, oi: +r.open_interest_all };
        });
        var rmW = def.kind === 'fx' ? rows.map(function (r) {
          return { d: r.report_date_as_yyyy_mm_dd.slice(0, 10), l: +r.asset_mgr_positions_long, s: +r.asset_mgr_positions_short, oi: +r.open_interest_all };
        }) : null;
        var m = {
          id: def.id, name: def.name, ref: def.ref, kind: def.kind,
          report: def.kind === 'fx' ? 'TFF' : 'Disaggregated',
          contract: def.contract, code: def.code, long_means: def.long_means,
          as_of: hfW[hfW.length - 1].d,
          oi: hfW[hfW.length - 1].oi,
          hf: stats(hfW),
          hf_label: GROUPS.hf[def.kind]
        };
        if (rmW) { m.rm = stats(rmW); m.rm_label = GROUPS.rm.fx; }
        var hs = side(m.hf.zone), rs = m.rm ? side(m.rm.zone) : 0;
        m.split = !!(m.rm && hs && rs && hs !== rs);
        m.signal = m.hf.zone === 'crowded long' ? -1 : m.hf.zone === 'crowded short' ? 1 : 0;
        m.history = hfW.slice(-HISTORY_WEEKS).map(function (w, i, arr) {
          var o = { d: w.d, hf: w.l - w.s, oi: w.oi };
          if (rmW) {
            var rw = rmW[rmW.length - arr.length + i];
            o.rm = rw.l - rw.s;
          }
          return o;
        });
        m.summary = summarize(m);
        if (!reportDate || m.as_of > reportDate) reportDate = m.as_of;
        return m;
      }).filter(Boolean);
      return {
        updated: new Date().toISOString(),
        report_date: reportDate,
        method: 'flip = (long − short) / open interest × 100; percentile = mid-rank vs all weekly history since Jan 2015; ' +
          'zones ≥90 crowded long, ≥60 long-side, ≤40 short-side, ≤10 crowded short; ' +
          'signal (hedge funds): crowded long −1, crowded short +1, else 0',
        sources: [
          { label: 'CFTC Traders in Financial Futures (futures only)', url: 'https://publicreporting.cftc.gov/Commitments-of-Traders/TFF-Futures-Only/gpe5-46if' },
          { label: 'CFTC Disaggregated (futures only)', url: 'https://publicreporting.cftc.gov/Commitments-of-Traders/Disaggregated-Futures-Only/72hh-3qpy' }
        ],
        markets: markets
      };
    });
  }

  /* Tuesday positions are published the following Friday 3:30 PM ET, so the
     next report is due ~10 days after report_date. True once a newer report
     should exist (with a few hours' grace for publication). */
  function isStale(reportDate, now) {
    if (!reportDate) return true;
    var due = new Date(reportDate + 'T00:00:00Z').getTime() + (10 * 24 + 22) * 3600 * 1000; // Fri ~22:00 UTC
    return (now || new Date()).getTime() > due + 6 * 3600 * 1000;
  }

  root.BlueStreetCOT = { build: build, isStale: isStale, MARKETS: MARKETS };
})(typeof window !== 'undefined' ? window : this);
