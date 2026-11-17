#!/usr/bin/env node
/* Blue Street — two-year government yields (Claude's job; runs in GitHub Actions).
   Writes data/rates.json: for each currency with an official daily source, the latest 2-year
   yield and its change over a week, a month and three months, each with the
   name of the source it came from. Official sources only.

   A currency whose sources all fail is left out (the site copes with gaps);
   the file is only replaced when at least MIN_OK currencies came through, so
   a bad pull never wipes a good snapshot.

   Usage: node tools/rates-build.cjs [--dry]     (--dry prints, writes nothing)
   Needs Node 18+ (global fetch). */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(path.resolve(__dirname, '..'), 'data', 'rates.json');
const DRY = process.argv.includes('--dry');
const MIN_OK = 4;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BlueStreet-rates/1.0; +https://github.com/ramismadi/Blue-Street)' };

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal, redirect: 'follow' });
    const text = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + text.slice(0, 120).replace(/\s+/g, ' '));
    return text;
  } finally { clearTimeout(t); }
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = n => String(n).padStart(2, '0');
/* Any of 2026-11-13, 2026/11/13, 13-Nov-2026, 13/11/2026 → 2026-11-13 */
function isoDate(s) {
  s = String(s).trim().replace(/^"|"$/g, '');
  let m;
  if ((m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(s))) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  if ((m = /^(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{4})/.exec(s)) && MON[m[2].toLowerCase()]) return m[3] + '-' + p2(MON[m[2].toLowerCase()]) + '-' + p2(m[1]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  return null;
}
const num = v => { const n = parseFloat(String(v).replace(/^"|"$/g, '')); return isFinite(n) ? n : null; };
const rows = (text, sep) => text.split(/\r?\n/).map(l => l.split(sep || ','));
function series(pairs) {
  const seen = {};
  pairs.forEach(([d, v]) => { const k = isoDate(d), n = num(v); if (k && n != null) seen[k] = n; });
  return Object.keys(seen).sort().map(k => [k, seen[k]]);
}

/* ---- sources: each returns [[YYYY-MM-DD, percent], ...] oldest first ---- */
const SRC = {
  fred: id => async () => series(rows(await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id)).slice(1)),
  ecb: async () => {
    const r = rows(await get('https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?lastNObservations=120&format=csvdata'));
    const d = r[0].indexOf('TIME_PERIOD'), v = r[0].indexOf('OBS_VALUE');
    if (d < 0 || v < 0) throw new Error('unexpected header ' + r[0].slice(0, 6).join(','));
    return series(r.slice(1).map(x => [x[d], x[v]]));
  },
  boc: async () => {
    const j = JSON.parse(await get('https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json?recent=120'));
    return series(j.observations.map(o => [o.d, (o['BD.CDN.2YR.DQ.YLD'] || {}).v]));
  },
  mof: async () => {
    const pick = text => {
      const r = rows(text), h = r.findIndex(x => /^date$/i.test((x[0] || '').trim()));
      const c = h < 0 ? -1 : r[h].findIndex(x => /^2Y$/i.test(x.trim()));
      if (c < 0) throw new Error('no 2Y column: ' + text.slice(0, 120).replace(/\s+/g, ' '));
      return r.slice(h + 1).map(x => [x[0], x[c]]);
    };
    const base = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
    const all = pick(await get(base + 'historical/jgbcme_all.csv'));
    let cur = [];
    try { cur = pick(await get(base + 'jgbcme.csv')); } catch (e) { console.log('  (mof current month: ' + e.message + ')'); }
    return series(all.slice(-200).concat(cur));
  },
  rba: async () => {
    const r = rows(await get('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv'));
    const h = r.find(x => /^series id$/i.test((x[0] || '').trim()));
    const c = h ? h.findIndex(x => x.trim() === 'FCMYGBAG2D') : -1;
    if (c < 0) throw new Error('no FCMYGBAG2D column');
    return series(r.map(x => [x[0], x[c]])).slice(-200);
  }
};
/* GBP, CHF and NZD have no official daily 2-year series in a simple public
   form that answered from GitHub's servers when this was built (2026-11-16):
   the Swiss National Bank's daily cube stopped updating in mid-2025 and the
   market-data fallback refuses automated requests. They are left out until a
   source is found; add them here and the site picks them up. */
const PLAN = {
  USD: [['US Treasury 2-year, constant maturity (Federal Reserve, via FRED)', SRC.fred('DGS2')]],
  EUR: [['Euro-area AAA government 2-year spot rate (ECB)', SRC.ecb]],
  JPY: [['Japanese government bond 2-year yield (Ministry of Finance)', SRC.mof]],
  CAD: [['Government of Canada 2-year benchmark yield (Bank of Canada)', SRC.boc]],
  AUD: [['Australian government 2-year yield (Reserve Bank of Australia)', SRC.rba]]
};

function summarise(s) {
  const last = s[s.length - 1], lastT = Date.parse(last[0]);
  const ago = days => {
    const cut = new Date(lastT - days * 864e5).toISOString().slice(0, 10);
    let hit = null;
    for (const p of s) { if (p[0] <= cut) hit = p; else break; }
    return hit && (Date.parse(cut) - Date.parse(hit[0])) <= 10 * 864e5 ? +(last[1] - hit[1]).toFixed(2) : null;
  };
  return { y2: +last[1].toFixed(2), chg_1w: ago(7), chg_1m: ago(30), chg_3m: ago(91), as_of: last[0] };
}

(async () => {
  const yields = {}, today = Date.now();
  for (const ccy of Object.keys(PLAN)) {
    for (const [label, fn] of PLAN[ccy]) {
      try {
        const s = await fn();
        if (s.length < 20) throw new Error('only ' + s.length + ' observations');
        const sum = summarise(s);
        if (!(sum.y2 > -2 && sum.y2 < 15)) throw new Error('yield out of range: ' + sum.y2);
        const age = Math.round((today - Date.parse(sum.as_of)) / 864e5);
        if (age > 9) throw new Error('stale: latest is ' + sum.as_of);
        yields[ccy] = Object.assign(sum, { source: label });
        console.log(ccy + ' ok  ' + sum.y2 + '%  1w ' + sum.chg_1w + '  1m ' + sum.chg_1m + '  3m ' + sum.chg_3m + '  (' + sum.as_of + ', ' + label + ')');
        break;
      } catch (e) {
        console.log(ccy + ' FAILED ' + label + ': ' + (e && e.message || e));
      }
    }
  }
  const ok = Object.keys(yields);
  console.log('rates-build: ' + ok.length + ' of ' + Object.keys(PLAN).length + ' currencies');
  if (ok.length < MIN_OK) { console.error('rates-build: too few sources answered; keeping the existing file'); process.exit(1); }
  const asOf = ok.map(k => yields[k].as_of).sort().pop();
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
  if (prev && JSON.stringify(prev.yields) === JSON.stringify(yields)) { console.log('rates-build: nothing new'); return; }
  const doc = { updated: new Date().toISOString(), as_of: asOf, yields: yields };
  if (DRY) { console.log(JSON.stringify(doc, null, 1)); return; }
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log('rates-build: wrote data/rates.json as of ' + asOf);
})().catch(e => { console.error('rates-build: ' + (e && e.stack || e)); process.exit(1); });
