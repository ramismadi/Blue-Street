#!/usr/bin/env node
/* Blue Street — Scoring v2 price-history test (Claude; runs in GitHub Actions).

   The question, in plain terms: when a currency scored higher than the other
   seven, did it go on to do better than them over the next 2, 4 and 8 weeks?

   How: every Friday since 2016, rebuild each measured driver from the data
   that was public on that day, score the eight currencies, then compare the
   scores with how each currency did against the average of all eight over the
   following weeks. Exchange rates: Federal Reserve (via FRED).

   Only drivers with a long official history can be tested: policy rates (Bank
   for International Settlements), two-year yields (each country's official
   source), market mood (VIX), oil (Brent) and inflation against each bank's
   goal (Bank for International Settlements). Growth surprises and hedge-fund
   positioning have only weeks of history in Blue Street's files, so they are
   left out and the report says so.

   Usage: node tools/score-backtest.cjs [--out file.md]
   Needs Node 18+ and the `unzip` command (present on GitHub's runners). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = (i => i > 0 ? process.argv[i + 1] : null)(process.argv.indexOf('--out'));
const START = '2015-06-01', TEST_FROM = '2016-01-01';
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const HAVEN = { JPY: 1, CHF: 1, USD: 0.5, EUR: 0, GBP: -0.25, CAD: -0.5, AUD: -1, NZD: -1 };
const OIL = { CAD: 1, JPY: -1, EUR: -0.5 };
const GOAL = { USD: 2, EUR: 2, GBP: 2, JPY: 2, CHF: 1, CAD: 2, AUD: 2.5, NZD: 2 };
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BlueStreet-backtest/1.0; +https://github.com/ramismadi/Blue-Street)' };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-bt-'));

/* ---------- small helpers ---------- */
async function get(url, binary) {
  for (let i = 0; i < 3; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(url, { headers: UA, signal: ctl.signal, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) { if (i === 2) throw new Error(url.slice(0, 90) + ': ' + e.message); await new Promise(z => setTimeout(z, 3000)); }
    finally { clearTimeout(t); }
  }
}
const p2 = n => String(n).padStart(2, '0');
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoDate(s) {
  s = String(s).trim().replace(/^"|"$/g, ''); let m;
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return m[1] + '-' + m[2] + '-01';
  if ((m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(s))) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  if ((m = /^(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{4})/.exec(s)) && MON[m[2].toLowerCase()]) return m[3] + '-' + p2(MON[m[2].toLowerCase()]) + '-' + p2(m[1]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  return null;
}
const num = v => { const n = parseFloat(String(v).replace(/^"|"$/g, '')); return isFinite(n) ? n : null; };
const rows = (t, sep) => t.split(/\r?\n/).filter(Boolean).map(l => l.split(sep || ','));
function series(pairs) {
  const o = {}; pairs.forEach(([d, v]) => { const k = isoDate(d), n = num(v); if (k && n != null && k >= START) o[k] = n; });
  const keys = Object.keys(o).sort(); return { d: keys, v: keys.map(k => o[k]) };
}
/* Last value on or before a date (binary search). maxAge in days, else null. */
function at(s, date, maxAge) {
  if (!s || !s.d.length) return null;
  let lo = 0, hi = s.d.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.d[m] <= date) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return null;
  if (maxAge && (Date.parse(date) - Date.parse(s.d[k])) / 864e5 > maxAge) return null;
  return s.v[k];
}
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, a.length - 1)); };
function rankOf(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; }
function spearman(a, b) { const ra = rankOf(a), rb = rankOf(b), ma = mean(ra), mb = mean(rb); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : null; }

const { boe2y } = require('./xlsx.cjs');

/* ---------- sources ---------- */
const fredS = async id => series(rows(await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + START)).slice(1));
const SRC = {
  y2: {
    USD: async () => fredS('DGS2'),
    EUR: async () => { const r = rows(await get('https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?startPeriod=' + START + '&format=csvdata')); const d = r[0].indexOf('TIME_PERIOD'), v = r[0].indexOf('OBS_VALUE'); return series(r.slice(1).map(x => [x[d], x[v]])); },
    JPY: async () => { const r = rows(await get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv')); const h = r.findIndex(x => /^date$/i.test((x[0] || '').trim())); const c = r[h].findIndex(x => /^2Y$/i.test(x.trim())); let cur = []; try { const q = rows(await get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv')); const qh = q.findIndex(x => /^date$/i.test((x[0] || '').trim())); const qc = q[qh].findIndex(x => /^2Y$/i.test(x.trim())); cur = q.slice(qh + 1).map(x => [x[0], x[qc]]); } catch (e) { /* month file optional */ } return series(r.slice(h + 1).map(x => [x[0], x[c]]).concat(cur)); },
    CAD: async () => { const j = JSON.parse(await get('https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json?start_date=' + START)); return series(j.observations.map(o => [o.d, (o['BD.CDN.2YR.DQ.YLD'] || {}).v])); },
    AUD: async () => { const r = rows(await get('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv')); const h = r.find(x => /^series id$/i.test((x[0] || '').trim())); const c = h.findIndex(x => x.trim() === 'FCMYGBAG2D'); return series(r.map(x => [x[0], x[c]])); },
    CHF: async () => { const r = rows(await get('https://data.snb.ch/api/cube/rendeiduebd/data/csv/en?fromDate=' + START), ';'); return series(r.filter(x => x[1] === '"CHF"' && x[2] === '"2J"').map(x => [x[0], x[3]])); },
    GBP: async () => {
      const arc = path.join(TMP, 'boe-arc.zip'), lat = path.join(TMP, 'boe-lat.zip');
      fs.writeFileSync(arc, await get('https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip', true));
      fs.writeFileSync(lat, await get('https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip', true));
      const d = fs.mkdtempSync(path.join(TMP, 'boe-'));
      execFileSync('unzip', ['-q', '-o', arc, 'GLC Nominal daily data_2016 to 2024.xlsx', 'GLC Nominal daily data_2025 to present.xlsx', '-d', d]);
      execFileSync('unzip', ['-q', '-o', lat, 'GLC Nominal daily data current month.xlsx', '-d', d]);
      let all = [];
      for (const f of fs.readdirSync(d)) all = all.concat(boe2y(path.join(d, f)));
      return series(all);
    }
    /* NZD: no official daily source answers automated requests (the Reserve
       Bank of New Zealand's site refuses them), so its rate direction is untested. */
  },
  policy: async () => {
    const t = await get('https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.US+XM+GB+JP+CH+CA+AU+NZ?startPeriod=' + START + '&format=csv');
    const r = rows(t), h = r[0], a = h.indexOf('REF_AREA'), d = h.indexOf('TIME_PERIOD'), v = h.indexOf('OBS_VALUE');
    const map = { US: 'USD', XM: 'EUR', GB: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD' }, by = {};
    /* The title column holds commas inside quotes, so read the last fields from the right. */
    r.slice(1).forEach(x => { const area = x[a], ccy = map[area]; if (!ccy) return; const n = x.length, dd = x[n - (h.length - d)], vv = x[n - (h.length - v)]; (by[ccy] = by[ccy] || []).push([dd, vv]); });
    const out = {}; Object.keys(by).forEach(c => { out[c] = series(by[c]); }); return out;
  },
  cpi: async () => {
    const t = await get('https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LONG_CPI/1.0/M+Q.US+XM+GB+JP+CH+CA+AU+NZ.771?startPeriod=2014-01&format=csv');
    const r = rows(t), h = r[0], a = h.indexOf('REF_AREA'), d = h.indexOf('TIME_PERIOD'), v = h.indexOf('OBS_VALUE');
    const map = { US: 'USD', XM: 'EUR', GB: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD' }, by = {};
    r.slice(1).forEach(x => { const ccy = map[x[a]]; if (!ccy) return; const n = x.length; let p = x[n - (h.length - d)]; const val = x[n - (h.length - v)]; const q = /^(\d{4})-Q(\d)$/.exec(p); if (q) p = q[1] + '-' + p2(q[2] * 3); (by[ccy] = by[ccy] || []).push([p, val]); });
    /* Point in time: a month's figure is treated as public 45 days after the month ends. */
    const out = {}; Object.keys(by).forEach(c => { const s = series(by[c].map(([p, val]) => [addDays(isoDate(p), 31 + 45), val])); out[c] = s; }); return out;
  },
  fx: async () => {
    const ids = { EUR: ['DEXUSEU', 1], GBP: ['DEXUSUK', 1], AUD: ['DEXUSAL', 1], NZD: ['DEXUSNZ', 1], JPY: ['DEXJPUS', -1], CHF: ['DEXSZUS', -1], CAD: ['DEXCAUS', -1] };
    const out = {};
    for (const c of Object.keys(ids)) { const s = await fredS(ids[c][0]); out[c] = { d: s.d, v: s.v.map(x => ids[c][1] > 0 ? x : 1 / x) }; }
    return out;   // US dollars per unit of each currency
  }
};

/* ---------- the drivers, as score-build.cjs computes them ---------- */
function drivers(date, D) {
  const out = {};
  const pol = {}; CCYS.forEach(c => { const v = at(D.policy[c], date, 40); if (v != null) pol[c] = v; });
  const polMed = Object.keys(pol).length >= 6 ? median(Object.values(pol)) : null;
  const ch = {}; CCYS.forEach(c => { const s = D.y2[c]; if (!s) return; const a = at(s, date, 7), b = at(s, addDays(date, -30), 10); if (a != null && b != null) ch[c] = a - b; });
  const chMed = Object.keys(ch).length >= 4 ? median(Object.values(ch)) : null;
  const lvl = {}; CCYS.forEach(c => { const v = at(D.y2[c], date, 7); if (v != null) lvl[c] = v; });
  const lvlMed = Object.keys(lvl).length >= 5 ? median(Object.values(lvl)) : null;
  let mood = null;
  { const i = D.vix.d.findIndex(x => x > date) - 1, k = i < -1 ? D.vix.d.length - 1 : i; if (k > 260) { const yr = D.vix.v.slice(k - 251, k + 1), last = D.vix.v[k], m = median(yr), s = Math.sqrt(yr.reduce((a, v) => a + (v - m) ** 2, 0) / yr.length) || 1; mood = clamp((last - m) / s, -1.5, 1.5) / 1.5; } }
  let oil = null; { const a = at(D.brent, date, 7), b = at(D.brent, addDays(date, -30), 7); if (a && b) oil = clamp((a / b - 1) / 0.10, -1, 1); }
  const gap = {}; CCYS.forEach(c => { const v = at(D.cpi[c], date, 200); if (v != null) gap[c] = v - GOAL[c]; });
  const gapMed = Object.keys(gap).length >= 6 ? median(Object.values(gap)) : null;
  CCYS.forEach(c => {
    const P = {};
    if (polMed != null && pol[c] != null) P.rate_level = clamp((pol[c] - polMed) / 1.5, -1, 1);
    if (chMed != null && ch[c] != null) P.rate_move = clamp((ch[c] - chMed) / 0.25, -1, 1);
    if (lvlMed != null && lvl[c] != null) P.yield_level = clamp((lvl[c] - lvlMed) / 1.5, -1, 1);
    if (mood != null) P.risk = 2 * mood * HAVEN[c];
    if (oil != null && OIL[c]) P.oil = 2 * oil * OIL[c]; else if (oil != null) P.oil = 0;
    if (gapMed != null && gap[c] != null) P.inflation = clamp((gap[c] - gapMed) / 1.5, -1, 1) * 2;
    out[c] = P;
  });
  return out;
}
/* Today's weights (score-build.cjs), limited to what can be tested. Rates = level + move as one driver. */
const COMBOS = {
  'Score v2 as first built (rates, mood, oil)': { rates: 30, risk: 15, oil: 10 },
  'Score v2 now (rate levels, inflation, oil)': { ratesL: 30, inflation: 10, oil: 10 }
};
function comboScore(P, w) {
  let s = 0, tot = 0;
  const rates = P.rate_level != null ? P.rate_level + (P.rate_move != null ? P.rate_move : 0) : null;
  const lv = [P.rate_level, P.yield_level].filter(v => v != null);
  const parts = { rates, risk: P.risk, oil: P.oil, inflation: P.inflation, ratesL: lv.length ? 2 * mean(lv) : null };
  Object.keys(w).forEach(k => { if (parts[k] != null) { s += w[k] * clamp(parts[k], -2, 2) / 2; tot += w[k]; } });
  return tot ? s / tot * 100 : null;
}

(async () => {
  const D = { y2: {} }, notes = [];
  const t0 = Date.now();
  for (const c of Object.keys(SRC.y2)) { try { D.y2[c] = await SRC.y2[c](); console.log('y2 ' + c + ': ' + D.y2[c].d.length + ' days, ' + D.y2[c].d[0] + ' to ' + D.y2[c].d.slice(-1)[0]); } catch (e) { notes.push('Two-year yield for ' + c + ' unavailable: ' + e.message); console.log('y2 ' + c + ' FAILED ' + e.message); } }
  D.policy = await SRC.policy(); CCYS.forEach(c => console.log('policy ' + c + ': ' + ((D.policy[c] || { d: [] }).d.length) + ' days, last ' + (D.policy[c] ? D.policy[c].d.slice(-1)[0] + ' ' + D.policy[c].v.slice(-1)[0] : '-')));
  D.cpi = await SRC.cpi(); CCYS.forEach(c => console.log('cpi ' + c + ': ' + ((D.cpi[c] || { d: [] }).d.length) + ' points, last usable ' + (D.cpi[c] ? D.cpi[c].d.slice(-1)[0] + ' ' + D.cpi[c].v.slice(-1)[0] : '-')));
  D.vix = await fredS('VIXCLS'); D.brent = await fredS('DCOILBRENTEU');
  D.fx = await SRC.fx(); console.log('fx through ' + D.fx.EUR.d.slice(-1)[0] + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + 's fetching)');

  /* Fridays */
  const lastFx = D.fx.EUR.d.slice(-1)[0], fridays = [];
  for (let d = TEST_FROM; d <= lastFx; d = addDays(d, 1)) if (new Date(d).getUTCDay() === 5) fridays.push(d);
  const px = (c, d) => c === 'USD' ? 1 : at(D.fx[c], d, 6);
  const rel = (d0, d1) => { const r = {}; let ok = true; CCYS.forEach(c => { const a = px(c, d0), b = px(c, d1); if (a == null || b == null) ok = false; else r[c] = Math.log(b / a); }); if (!ok) return null; const m = mean(Object.values(r)); CCYS.forEach(c => { r[c] -= m; }); return r; };

  const H = { '2 weeks': 14, '4 weeks': 28, '8 weeks': 56 };
  const SIGNALS = ['rate_level', 'rate_move', 'yield_level', 'risk', 'oil', 'inflation'].concat(Object.keys(COMBOS));
  const res = {}; SIGNALS.forEach(s => { res[s] = {}; Object.keys(H).forEach(h => { res[s][h] = { ic: [], spread: [], hit: [], dates: [] }; }); });
  const snap = [];
  for (const f of fridays) {
    const P = drivers(f, D);
    const sig = {};
    SIGNALS.forEach(s => { sig[s] = {}; CCYS.forEach(c => { const v = COMBOS[s] ? comboScore(P[c], COMBOS[s]) : P[c][s]; if (v != null) sig[s][c] = v; }); });
    snap.push([f, sig['Score v2 now (rate levels, inflation, oil)']]);
    for (const [hn, hd] of Object.entries(H)) {
      if (addDays(f, hd) > lastFx) continue;
      const r = rel(f, addDays(f, hd)); if (!r) continue;
      SIGNALS.forEach(s => {
        const cs = Object.keys(sig[s]); if (cs.length < 6) return;
        const a = cs.map(c => sig[s][c]); if (sd(a) < 1e-9) return;
        const ic = spearman(a, cs.map(c => r[c])); if (ic == null) return;
        const order = cs.slice().sort((x, y) => sig[s][y] - sig[s][x]);
        const spread = (r[order[0]] + r[order[1]] - r[order[order.length - 1]] - r[order[order.length - 2]]) / 2;
        const o = res[s][hn]; o.ic.push(ic); o.spread.push(spread); o.hit.push(spread > 0 ? 1 : 0); o.dates.push(f);
      });
    }
  }

  /* ---------- report ---------- */
  const pct = v => (v * 100).toFixed(1) + '%';
  const L = [];
  L.push('# Scoring v2 — price-history test', '');
  L.push('Run ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC. Weekly, every Friday from ' + TEST_FROM + ' to ' + lastFx + ' (' + fridays.length + ' weeks). Exchange rates: Federal Reserve H.10 via FRED.', '');
  L.push('**How to read it.** "Rank match" is how well the score order matched the order of what came next (+1 perfect, 0 no link, −1 backwards). In currency markets a steady +0.05 to +0.10 is useful. "Top two vs bottom two" is the average gain of the two highest-scored currencies over the two lowest, per period. "Right" is how often that gap was positive. "Strength of evidence" divides the average by its wobble, using only non-overlapping periods; about 2 or more means it is unlikely to be luck.', '');
  const NAMES = { rate_level: 'Policy rate vs the others', rate_move: 'Two-year yield, 1-month move vs the others', yield_level: 'Two-year yield level vs the others', risk: 'Market mood (VIX) x safe haven', oil: 'Oil, 1-month move x exporter/importer', inflation: 'Inflation vs goal, vs the others' };
  for (const hn of Object.keys(H)) {
    L.push('## Over the next ' + hn, '', '| Signal | Rank match | Top two vs bottom two | Right | Strength of evidence | Weeks |', '|---|---|---|---|---|---|');
    const step = Math.round(H[hn] / 7);
    SIGNALS.forEach(s => {
      const o = res[s][hn]; if (!o.ic.length) { L.push('| ' + (NAMES[s] || s) + ' | — | — | — | — | 0 |'); return; }
      const nonov = o.spread.filter((_, i) => i % step === 0), t = mean(nonov) / (sd(nonov) / Math.sqrt(nonov.length));
      L.push('| ' + (NAMES[s] || s) + ' | ' + mean(o.ic).toFixed(3) + ' | ' + pct(mean(o.spread)) + ' | ' + pct(mean(o.hit)) + ' | ' + t.toFixed(1) + ' | ' + o.ic.length + ' |');
    });
    L.push('');
  }
  L.push('## Steady over time? (4 weeks ahead, rank match by period)', '', '| Signal | 2016–2019 | 2020–2022 | 2023–now |', '|---|---|---|---|');
  SIGNALS.forEach(s => {
    const o = res[s]['4 weeks'], per = [['2016', '2019-12-31'], ['2020', '2022-12-31'], ['2023', '2099']].map(([a, b]) => { const v = o.ic.filter((_, i) => o.dates[i] >= a && o.dates[i] <= b); return v.length ? mean(v).toFixed(3) : '—'; });
    L.push('| ' + (NAMES[s] || s) + ' | ' + per.join(' | ') + ' |');
  });
  L.push('', '## Not tested', '', '- Growth surprises (beats vs misses) and hedge-fund positioning: Blue Street only has weeks of history for them.', '- Fiscal health and terms of trade beyond oil: no measured feed yet.', '- New Zealand two-year yield: no official daily source answers automated requests, so its rate move is left out.');
  notes.forEach(n => L.push('- ' + n));
  L.push('', '## Latest scores from this test (rate levels, inflation, oil)', '');
  snap.slice(-3).forEach(([d, s]) => L.push('- ' + d + ': ' + CCYS.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0)).map(c => c + ' ' + Math.round(s[c] || 0)).join(', ')));
  const text = L.join('\n') + '\n';
  console.log('\n' + text);
  if (OUT) fs.writeFileSync(OUT, text);
})().catch(e => { console.error('score-backtest: ' + (e && e.stack || e)); process.exit(1); });
