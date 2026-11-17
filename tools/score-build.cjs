#!/usr/bin/env node
/* Blue Street — Scoring v2, shadow run (Claude's job; runs in GitHub Actions).

   Writes data/score-v2.json. NOT shown on the site yet: Rami approved the
   approach on 2026-11-16 on the condition that it runs beside the current
   score and is checked against price history before it replaces anything.

   The idea, in plain terms:
   - Measured, not judged: each driver reads from numbers where a feed exists.
   - Relative: a currency is always compared with the other seven.
   - Level and direction: where it stands, and which way it is moving.
   - Weighted: interest rates carry the most weight (weights below sum to 100).
   Each driver gives a value from -2 (weighs heavily) to +2 (supports strongly).
   The score is the weighted sum, on a scale of -100 to +100.

   Where no feed exists yet (inflation, fiscal, and terms of trade for most
   currencies) the driver falls back to the current hand-judged mark, and is
   flagged `measured: false` so it is clear what still rests on judgment.

   Usage: node tools/score-build.cjs [--dry] [--offline]
   --offline skips the two market series fetched from FRED (VIX, Brent). */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(path.resolve(__dirname, '..'), 'data');
const OUT = path.join(DIR, 'score-v2.json');
const DRY = process.argv.includes('--dry'), OFFLINE = process.argv.includes('--offline');
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const NAME = { USD: 'the dollar', EUR: 'the euro', GBP: 'the pound', JPY: 'the yen', CHF: 'the franc', CAD: 'the Canadian dollar', AUD: 'the Australian dollar', NZD: 'the New Zealand dollar' };
const WEIGHTS = { rates: 30, growth: 15, risk: 15, inflation: 10, tot: 10, positioning: 10, fiscal: 10 };
/* How each currency tends to behave when markets turn nervous (+ gains, - loses). */
const HAVEN = { JPY: 1, CHF: 1, USD: 0.5, EUR: 0, GBP: -0.25, CAD: -0.5, AUD: -1, NZD: -1 };
/* How each currency tends to respond to dearer oil (+ exporter, - importer). */
const OIL = { CAD: 1, JPY: -1, EUR: -0.5 };

const load = n => { try { return JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8')); } catch (e) { return null; } };
/* A policy rate as a number. A range ("3.75-4.00%") uses its upper end; the
   dash in a range is not a minus sign. */
function rateNum(r) {
  const t = String(r || '').trim(), m = t.match(/\d+(\.\d+)?/g);
  if (!m) return null;
  return m.length === 1 && /^[-−]/.test(t) ? -parseFloat(m[0]) : parseFloat(m[m.length - 1]);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = v => Math.round(v * 100) / 100;
const pts = v => Math.abs(v).toFixed(2).replace(/\.?0+$/, '');

async function fred(id) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 40000);
  try {
    const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlueStreet-score/1.0)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.text()).split(/\r?\n/).slice(1).map(l => l.split(',')).filter(x => x.length > 1 && isFinite(parseFloat(x[1]))).map(x => [x[0], parseFloat(x[1])]);
  } finally { clearTimeout(t); }
}

(async () => {
  const banks = load('banks'), rates = load('rates'), mom = load('momentum'), cot = load('cot'), cur = load('currencies');
  if (!banks || !cur) { console.error('score-build: banks.json and currencies.json are required'); process.exit(1); }
  const v1 = {}; (cur.currencies || []).forEach(c => { v1[c.ccy] = c.drivers || {}; });
  const mark = (c, k) => (v1[c] && v1[c][k] ? +v1[c][k].score || 0 : 0);

  let vix = null, brent = null;
  if (!OFFLINE) {
    try { vix = await fred('VIXCLS'); } catch (e) { console.log('score-build: VIX unavailable (' + e.message + ')'); }
    try { brent = await fred('DCOILBRENTEU'); } catch (e) { console.log('score-build: Brent unavailable (' + e.message + ')'); }
  }

  /* --- rates: level of the policy rate against the middle of the eight, plus
         the one-month move in the two-year yield against the middle. --- */
  const pol = {};
  (banks.banks || []).forEach(b => { const v = rateNum(b.rate); if (v != null) pol[b.ccy] = v; });
  const polMed = median(CCYS.filter(c => pol[c] != null).map(c => pol[c]));
  const y = (rates && rates.yields) || {};
  const moves = CCYS.filter(c => y[c] && typeof y[c].chg_1m === 'number').map(c => y[c].chg_1m);
  const moveMed = moves.length >= 4 ? median(moves) : null;

  /* --- risk mood from the VIX: its latest level against its own past year. --- */
  let mood = null, moodWhy = '';
  if (vix && vix.length > 260) {
    const yr = vix.slice(-252).map(x => x[1]), last = vix[vix.length - 1][1], med = median(yr);
    const sd = Math.sqrt(yr.reduce((a, v) => a + (v - med) * (v - med), 0) / yr.length) || 1;
    mood = clamp((last - med) / sd, -1.5, 1.5) / 1.5;       // +1 = very nervous, -1 = very calm
    moodWhy = mood > 0.33 ? 'Markets are more nervous than usual' : mood < -0.33 ? 'Markets are calmer than usual' : 'Market mood is close to normal';
  }
  /* --- oil: Brent's change over about a month. --- */
  let oil = null;
  if (brent && brent.length > 30) { const a = brent[brent.length - 1][1], b = brent[brent.length - 22][1]; oil = clamp((a / b - 1) / 0.10, -1, 1); }

  const out = {};
  CCYS.forEach(c => {
    const P = {};
    // rates
    if (pol[c] != null) {
      const gap = pol[c] - polMed, level = clamp(gap / 1.5, -1, 1);
      let dir = null, why = 'Its policy rate is ' + (Math.abs(gap) < 0.13 ? 'in the middle of the eight' : pts(gap) + ' points ' + (gap > 0 ? 'above' : 'below') + ' the middle of the eight');
      if (moveMed != null && y[c] && typeof y[c].chg_1m === 'number') {
        const rel = y[c].chg_1m - moveMed; dir = clamp(rel / 0.25, -1, 1);
        why += Math.abs(rel) < 0.08 ? ', and its two-year yield has moved in line with the others over the past month.' : ', and its two-year yield has ' + (rel > 0 ? 'risen faster' : 'fallen behind') + ' the others over the past month.';
      } else { dir = mark(c, 'policy') * 0.5; why += '. The direction still rests on a judged mark, because no yield feed covers it yet.'; }
      P.rates = { value: r2(level + dir), measured: !!(y[c] && moveMed != null), why };
    }
    // growth: beats against misses in the latest releases
    const rec = (((mom || {}).currencies || {})[c] || {}).recent || [];
    if (rec.length >= 3) {
      const b = rec.filter(x => x.result === 'beat').length, m = rec.filter(x => x.result === 'miss').length;
      P.growth = { value: r2(2 * (b - m) / rec.length), measured: true, why: 'Of its last ' + rec.length + ' data releases, ' + b + ' beat forecasts and ' + m + ' missed.' };
    } else P.growth = { value: mark(c, 'growth'), measured: false, why: 'Too few scored releases yet, so this rests on a judged mark.' };
    // risk mood
    if (mood != null) P.risk = { value: r2(2 * mood * HAVEN[c]), measured: true, why: moodWhy + (HAVEN[c] === 0 || Math.abs(mood) <= 0.33 ? ', which does little for ' + NAME[c] + '.' : ', which tends to ' + (mood * HAVEN[c] > 0 ? 'help ' : 'hurt ') + NAME[c] + '.') };
    else P.risk = { value: mark(c, 'risk'), measured: false, why: 'No market-mood reading this run, so this rests on a judged mark.' };
    // terms of trade
    if (oil != null && OIL[c]) P.tot = { value: r2(2 * oil * OIL[c]), measured: true, why: 'Oil has ' + (Math.abs(oil) < 0.2 ? 'barely moved' : oil > 0 ? 'risen' : 'fallen') + ' over the past month, and ' + NAME[c] + (OIL[c] > 0 ? ' belongs to an oil exporter.' : ' belongs to an oil importer.') };
    else P.tot = { value: mark(c, 'tot'), measured: false, why: 'No measured feed for what this country sells and buys yet, so this rests on a judged mark.' };
    // positioning: counts against the bet only at an extreme
    const m = cot && (cot.markets || []).find(x => x.id === c);
    if (m && m.hf && isFinite(m.hf.pct)) {
      const p = m.hf.pct;
      P.positioning = p >= 90 ? { value: -2, measured: true, why: 'Hedge funds are betting on it more heavily than at almost any time since 2015, which leaves few buyers left.' }
        : p <= 10 ? { value: 2, measured: true, why: 'Hedge funds are betting against it more heavily than at almost any time since 2015, which leaves few sellers left.' }
        : { value: r2((p - 50) / 50 * 0.5), measured: true, why: 'Hedge fund bets are not at an extreme, so this counts for little.' };
    } else P.positioning = { value: mark(c, 'positioning'), measured: false, why: 'No positioning reading, so this rests on a judged mark.' };
    // inflation and fiscal: judged until feeds exist
    P.inflation = { value: mark(c, 'inflation'), measured: false, why: 'Rests on a judged mark until an inflation feed exists.' };
    P.fiscal = { value: mark(c, 'fiscal'), measured: false, why: 'Rests on a judged mark. Fiscal health is hard to read from one number.' };

    let score = 0, measuredW = 0;
    Object.keys(WEIGHTS).forEach(k => { const p = P[k] || { value: 0, measured: false }; score += WEIGHTS[k] * clamp(p.value, -2, 2) / 2; if (p.measured) measuredW += WEIGHTS[k]; });
    out[c] = { score: Math.round(score), measured_share: measuredW, v1_score: Object.keys(v1[c] || {}).reduce((a, k) => a + (+v1[c][k].score || 0), 0), drivers: P };
  });

  const asOf = cur.as_of ? String(cur.as_of).slice(0, 10) : new Date().toISOString().slice(0, 10);
  let prev = load('score-v2');
  const history = ((prev && prev.history) || []).filter(h => h.date !== asOf);
  history.push({ date: asOf, scores: Object.fromEntries(CCYS.map(c => [c, out[c].score])) });
  const doc = {
    _about: 'Scoring v2, shadow run. Not shown on the site. Compare with the live score before trusting it; thresholds are first guesses and have not been tested against price history.',
    updated: new Date().toISOString(), as_of: asOf, scale: '-100 to +100', weights: WEIGHTS,
    inputs: { vix: !!vix, brent: !!brent, yields: Object.keys(y) },
    ranking: CCYS.slice().sort((a, b) => out[b].score - out[a].score),
    currencies: out, history: history.slice(-180)
  };
  console.log(CCYS.slice().sort((a, b) => out[b].score - out[a].score).map(c => c + ' ' + out[c].score + ' (now ' + out[c].v1_score + ', ' + out[c].measured_share + '% measured)').join('\n'));
  if (DRY) return;
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log('score-build: wrote data/score-v2.json as of ' + asOf);
})().catch(e => { console.error('score-build: ' + (e && e.stack || e)); process.exit(1); });
