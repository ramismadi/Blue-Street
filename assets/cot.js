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
     zones      = ≥90 very bullish · ≥60 bullish · ≤40 bearish ·
                  ≤10 very bearish · otherwise neutral (a lean on the
                  currency, measured against the group's own history)
     signal     = contrarian engine score from the hedge-fund (leveraged /
                  managed money) zone: very bullish −1, very bearish +1, else 0
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
    if (pct >= 90) return 'very bullish';
    if (pct >= 60) return 'bullish';
    if (pct <= 10) return 'very bearish';
    if (pct <= 40) return 'bearish';
    return 'neutral';
  }
  function side(z) {
    return /bullish/.test(z) ? 1 : /bearish/.test(z) ? -1 : 0;
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

  /* Plain words (Rami, 2026-10-19): what a group is betting, from its net
     position (flip = net as a share of open interest). "For" = betting the
     market rises, "against" = betting it falls. */
  function stanceOf(g) {
    var f = g.flip, a = Math.abs(f);
    if (a < 2) return { word: 'evenly split', sign: 0 };
    return { word: (a < 8 ? 'leaning' : a < 20 ? 'betting' : 'strongly') + (f > 0 ? ' for' : ' against'), sign: f > 0 ? 1 : -1 };
  }
  function stanceSentence(g, who, ref) {
    var st = stanceOf(g);
    if (!st.sign) return who + ' are evenly split on ' + ref + '.';
    return who + ' are ' + phrase(st) + ' ' + ref + '.';
  }
  function phrase(st) { return st.word.replace(/^strongly/, 'strongly betting'); }

  /* What the last four weeks did, in words. */
  function flow(g, oi, ref) {
    var c = g.chg4;
    if (c == null) return '';
    var share = oi ? Math.abs(c) / oi * 100 : 0, was = g.net - c;
    if (share < 0.2) return 'Little has changed over the past month.';
    if (was >= 0 && g.net < 0) return 'Over the past month they flipped from betting for ' + ref + ' to betting against it.';
    if (was < 0 && g.net >= 0) return 'Over the past month they flipped from betting against ' + ref + ' to betting for it.';
    var long = g.net >= 0, more = long ? c > 0 : c < 0;
    return 'Over the past month they ' + (share >= 10 ? 'sharply ' : share < 2 ? 'slightly ' : '') + (more ? 'added to' : 'cut') +
      ' their bet ' + (long ? 'on ' : 'against ') + ref + '.';
  }

  /* Is the hedge-fund bet near its extreme since 2015? */
  function extremity(g, ref) {
    if (g.pct < 0.5) return 'Their bet on ' + ref + ' rising is the weakest since 2015.';
    if (g.pct <= 10) return 'Their bet on ' + ref + ' rising is among the weakest since 2015.';
    if (g.pct > 99.5) return 'Their bet on ' + ref + ' rising is the strongest since 2015.';
    if (g.pct >= 90) return 'Their bet on ' + ref + ' rising is among the strongest since 2015.';
    return '';
  }

  function disagree(m) {
    if (!m.rm) return false;
    // Both clearly committed (8%+ of open interest) and on opposite sides.
    var h = m.hf.flip, r = m.rm.flip;
    return Math.abs(h) >= 8 && Math.abs(r) >= 8 && (h > 0) !== (r > 0);
  }

  function summarize(m) {
    var s = stanceSentence(m.hf, 'Hedge funds', m.ref);
    var x = extremity(m.hf, m.ref);
    if (x) s += ' ' + x;
    var f = flow(m.hf, m.oi, m.ref);
    if (f) s += ' ' + f;
    if (m.split) s += ' Real money disagrees: it is ' + phrase(stanceOf(m.rm)) + ' ' + m.ref + '.';
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
        m.split = disagree(m);
        m.signal = m.hf.zone === 'very bullish' ? -1 : m.hf.zone === 'very bearish' ? 1 : 0;
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
          'positive flip = net long (betting the market rises); split = hedge funds and real money on opposite sides; ' +
          'zones (for the engine signal): ≥90 very bullish, ≥60 bullish, ≤40 bearish, ≤10 very bearish, otherwise neutral; ' +
          'signal (hedge funds): very bullish −1, very bearish +1, else 0',
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

  root.BlueStreetCOT = { build: build, isStale: isStale, MARKETS: MARKETS, summarize: summarize, zone: zone, disagree: disagree };
})(typeof window !== 'undefined' ? window : this);
