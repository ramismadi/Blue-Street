#!/usr/bin/env node
/* Blue Street — central bank rates (Claude's job; runs in GitHub Actions).

   Writes data/policy.json: each central bank's headline rate, when it last
   moved and by how much, from the bank's own published data. The site and
   the score read it over the `rate` and `last_move` in Hercules'
   data/banks.json, which keeps meeting dates and market odds (Rami, 2026-11-17).

   Sources (official, free, answer automated requests):
   - USD: Federal Reserve target range, upper and lower (FRED DFEDTARU / DFEDTARL)
   - EUR: ECB deposit facility rate (ECB data portal)
   - GBP: Bank Rate (Bank of England database, IUDBEDR)
   - CAD: target for the overnight rate (Bank of Canada Valet, V39079)
   - AUD: cash rate target (Reserve Bank of Australia, table F1.1)
   - JPY, CHF, NZD: Bank for International Settlements policy-rate series,
     which runs about a week behind.
   When a meeting has ended that a series doesn't cover yet (the official
   series land a day after a decision, the BIS ones about a week), the rate is
   marked `pending` and the site keeps the rate in banks.json until it catches up.

   Usage: node tools/policy-build.cjs [--dry] */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(path.resolve(__dirname, '..'), 'data');
const OUT = path.join(DIR, 'policy.json');
const DRY = process.argv.includes('--dry');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BlueStreet-policy/1.0; +https://github.com/ramismadi/Blue-Street)' };
const START = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);
const p2 = n => String(n).padStart(2, '0');
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal, redirect: 'follow' });
    const text = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return text;
  } finally { clearTimeout(t); }
}
function iso(s) {
  s = String(s).trim().replace(/^"|"$/g, ''); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{4})/.exec(s)) && MON[m[2].toLowerCase()]) return m[3] + '-' + p2(MON[m[2].toLowerCase()]) + '-' + p2(m[1]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  return null;
}
const rows = (t, sep) => t.split(/\r?\n/).filter(Boolean).map(l => l.split(sep || ','));
function series(pairs) {
  const o = {};
  pairs.forEach(([d, v]) => { const k = iso(d), n = parseFloat(String(v).replace(/^"|"$/g, '')); if (k && isFinite(n) && k >= START) o[k] = n; });
  return Object.keys(o).sort().map(k => [k, o[k]]);
}
const fred = async id => series(rows(await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + START)).slice(1));

let bis = null;
async function bisSeries(area) {
  if (!bis) {
    const t = await get('https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.JP+CH+NZ+AU?startPeriod=' + START + '&format=csv');
    const r = rows(t), h = r[0], a = h.indexOf('REF_AREA'), d = h.indexOf('TIME_PERIOD'), v = h.indexOf('OBS_VALUE');
    bis = {};
    r.slice(1).forEach(x => { const n = x.length; (bis[x[a]] = bis[x[a]] || []).push([x[n - (h.length - d)], x[n - (h.length - v)]]); });
  }
  return series(bis[area] || []);
}

const SRC = {
  USD: { label: 'Federal Reserve target range (FRED)', fn: async () => { const up = await fred('DFEDTARU'), lo = await fred('DFEDTARL'); const l = lo[lo.length - 1]; return { s: up, display: l[1].toFixed(2) + '–' + up[up.length - 1][1].toFixed(2) + '%' }; } },
  EUR: { label: 'ECB deposit facility rate (ECB data portal)', fn: async () => { const r = rows(await get('https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?startPeriod=' + START + '&format=csvdata')); const d = r[0].indexOf('TIME_PERIOD'), v = r[0].indexOf('OBS_VALUE'); return { s: series(r.slice(1).map(x => [x[d], x[v]])) }; } },
  GBP: { label: 'Bank Rate (Bank of England)', fn: async () => { const from = new Date(Date.parse(START)); const f = p2(from.getUTCDate()) + '/' + Object.keys(MON)[from.getUTCMonth()].replace(/^./, c => c.toUpperCase()) + '/' + from.getUTCFullYear(); const r = rows(await get('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=' + f + '&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N')); return { s: series(r.slice(1).map(x => [x[0], x[1]])) }; } },
  CAD: { label: 'Bank of Canada target for the overnight rate (Valet)', fn: async () => { const j = JSON.parse(await get('https://www.bankofcanada.ca/valet/observations/V39079/json?start_date=' + START)); return { s: series(j.observations.map(o => [o.d, (o.V39079 || {}).v])) }; } },
  AUD: { label: 'RBA cash rate target (table F1.1)', fn: async () => {
    const r = rows((await get('https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv')).replace(/^\uFEFF/, '').replace(/"/g, ''));
    const h = r.find(x => /^series id$/i.test((x[0] || '').trim())) || [];
    const c = h.findIndex(x => /^FIRMMCRT/i.test(x.trim()));
    const s = c > 0 ? series(r.map(x => [x[0], x[c]])) : [];
    if (s.length >= 5) return { s };
    console.log('AUD: RBA table F1.1 unreadable (column ' + c + ', ' + r.length + ' rows); using the BIS series');
    return { s: await bisSeries('AU'), label: 'RBA cash rate target (BIS, about a week behind)' };
  } },
  JPY: { label: 'Bank of Japan policy rate (BIS, about a week behind)', lag: true, fn: async () => ({ s: await bisSeries('JP') }) },
  CHF: { label: 'SNB policy rate (BIS, about a week behind)', lag: true, fn: async () => ({ s: await bisSeries('CH') }) },
  NZD: { label: 'RBNZ official cash rate (BIS, about a week behind)', lag: true, fn: async () => ({ s: await bisSeries('NZ') }) }
};

(async () => {
  let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
  let banks = null; try { banks = JSON.parse(fs.readFileSync(path.join(DIR, 'banks.json'), 'utf8')); } catch (e) { /* optional */ }
  const meet = {}; ((banks && banks.banks) || []).forEach(b => { meet[b.ccy] = b; });
  const today = new Date().toISOString().slice(0, 10);
  const rates = {};
  for (const c of Object.keys(SRC)) {
    try {
      const { s, display, label } = await SRC[c].fn();
      if (s.length < 5) throw new Error('only ' + s.length + ' readings');
      const [asOf, rate] = s[s.length - 1];
      if (!(rate > -2 && rate < 20)) throw new Error('rate out of range: ' + rate);
      if ((Date.parse(today) - Date.parse(asOf)) / 864e5 > (SRC[c].lag || label ? 21 : 10)) throw new Error('stale: latest is ' + asOf);
      let lm = null;
      for (let i = s.length - 1; i > 0; i--) if (Math.abs(s[i][1] - s[i - 1][1]) > 1e-9) { lm = { date: s[i][0], bp: Math.round((s[i][1] - s[i - 1][1]) * 100) }; break; }
      const row = { rate, display: display || rate.toFixed(2) + '%', as_of: asOf, last_move: lm, source: label || SRC[c].label };
      /* A meeting has ended since the series' last reading (decision day itself
         included): wait for the series to catch up. */
      const end = meet[c] && meet[c].next_meeting && meet[c].next_meeting.end;
      if (end && end > asOf && end <= today) row.pending = true;
      rates[c] = row;
      console.log(c + ' ' + row.display + (lm ? '  last move ' + lm.date + ' ' + (lm.bp > 0 ? '+' : '') + lm.bp + 'bp' : '') + '  (' + asOf + (row.pending ? ', pending' : '') + ', ' + row.source + ')');
    } catch (e) {
      console.log(c + ' FAILED: ' + (e && e.message || e));
      if (prev && prev.rates && prev.rates[c]) rates[c] = prev.rates[c];   // keep the last good reading
    }
  }
  if (Object.keys(rates).length < 6) { console.error('policy-build: fewer than 6 banks answered; not writing'); process.exit(DRY ? 0 : 1); }
  if (prev && JSON.stringify(prev.rates) === JSON.stringify(rates)) { console.log('policy-build: nothing new'); return; }
  const doc = { _about: 'Central bank headline rates from each bank\'s own data (Claude; tools/policy-build.cjs). Read over banks.json rate and last_move.', updated: new Date().toISOString(), rates };
  if (DRY) return;
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log('policy-build: wrote data/policy.json');
})().catch(e => { console.error('policy-build: ' + (e && e.stack || e)); process.exit(1); });
