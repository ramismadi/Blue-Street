#!/usr/bin/env node
/* Blue Street — Scoring v2, shadow run (Claude's job; runs in GitHub Actions).

   Writes data/score-v2.json. NOT shown on the site yet: Rami approved the
   approach on 2026-11-16 on the condition that it runs beside the current
   score and is checked against price history before it replaces anything.

   The idea, in plain terms:
   - Measured, not judged: each driver reads from numbers where a feed exists.
   - Relative: a currency is always compared with the other seven.
   - Weighted, and only what held up: the price-history test of 2026-11-17
     (tools/score-backtest.cjs, 2016 to 2026) found a small, steady edge in
     interest-rate levels, inflation against each bank's goal and oil, and
     none in market mood or the one-month move in yields. So (Rami, 2026-11-17)
     rate levels, inflation and terms of trade count; market mood is kept as a
     plain line of context with no weight; the one-month yield move is
     mentioned in the rates line but not counted.
   - Growth surprises, positioning and fiscal health still count at their
     old weights, flagged untested, until they have enough history to test.
   Each driver gives a value from -2 (weighs heavily) to +2 (supports strongly).
   The score is the weighted average, on a scale of -100 to +100. `tested_score`
   uses only the drivers that passed the test.

   Where no feed exists the driver uses a judged mark from data/marks.json
   (fiscal health for all eight; trade prices where no price feed exists),
   flagged `measured: false`. The editions keep those marks up to date.

   Since 2026-11-17 this is the score on the site (Rami). `points` turns each
   counted driver into its share of a score from -10 to +10, so the parts add
   up to the total the site shows.

   Usage: node tools/score-build.cjs [--dry] [--offline]
   --offline skips the market series fetched online (VIX, Brent, inflation,
   Australian commodity prices). */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(path.resolve(__dirname, '..'), 'data');
const OUT = path.join(DIR, 'score-v2.json');
const DRY = process.argv.includes('--dry'), OFFLINE = process.argv.includes('--offline');
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const NAME = { USD: 'the dollar', EUR: 'the euro', GBP: 'the pound', JPY: 'the yen', CHF: 'the franc', CAD: 'the Canadian dollar', AUD: 'the Australian dollar', NZD: 'the New Zealand dollar' };
const NAME_FULL = { USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', JPY: 'Japanese yen', CHF: 'Swiss franc', CAD: 'Canadian dollar', AUD: 'Australian dollar', NZD: 'New Zealand dollar' };
const BANK_ID = { USD: 'fed', EUR: 'ecb', GBP: 'boe', JPY: 'boj', CHF: 'snb', CAD: 'boc', AUD: 'rba', NZD: 'rbnz' };
const BANK = { USD: 'the Fed', EUR: 'the European Central Bank', GBP: 'the Bank of England', JPY: 'the Bank of Japan', CHF: 'the Swiss National Bank', CAD: 'the Bank of Canada', AUD: 'the Reserve Bank of Australia', NZD: 'the Reserve Bank of New Zealand' };
/* Weights. risk is 0: shown as context, not counted (failed the price test). */
const WEIGHTS = { rates: 30, inflation: 10, tot: 10, growth: 15, positioning: 10, fiscal: 10, risk: 0 };
const TESTED = { rates: true, inflation: true, tot: true };
/* Each bank's inflation goal, in percent (the middle where it is a range). */
const GOAL = { USD: 2, EUR: 2, GBP: 2, JPY: 2, CHF: 1, CAD: 2, AUD: 2.5, NZD: 2 };
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

async function text(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 40000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlueStreet-score/1.0)' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
/* Latest inflation rate (year on year) for each of the eight, from the Bank for
   International Settlements. Australia is quarterly; the rest monthly. */
async function bisCpi() {
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 7);
  const lines = (await text('https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LONG_CPI/1.0/M+Q.US+XM+GB+JP+CH+CA+AU+NZ.771?startPeriod=' + from + '&format=csv')).split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(','), a = h.indexOf('REF_AREA'), d = h.indexOf('TIME_PERIOD'), v = h.indexOf('OBS_VALUE');
  const map = { US: 'USD', XM: 'EUR', GB: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD' }, out = {};
  lines.slice(1).forEach(l => {
    const x = l.split(','), n = x.length, ccy = map[x[a]], per = x[n - (h.length - d)], val = parseFloat(x[n - (h.length - v)]);
    if (!ccy || !isFinite(val)) return;
    const key = per.replace(/-Q(\d)$/, (m, q) => '-' + String(q * 3).padStart(2, '0'));
    if (!out[ccy] || key > out[ccy].period) out[ccy] = { period: key, rate: val };
  });
  return out;
}
/* The Reserve Bank of Australia's commodity price index (SDR terms, monthly):
   Australia's export prices, without the Australian dollar's own moves. */
async function rbaCommodities() {
  const r = (await text('https://www.rba.gov.au/statistics/tables/csv/i2-data.csv')).split(/\r?\n/).map(l => l.split(','));
  const head = r.find(x => /^title$/i.test((x[0] || '').trim()));
  const c = head ? head.findIndex(x => /^Commodity prices . SDR$/.test(x.trim())) : -1;
  if (c < 0) throw new Error('no SDR column');
  return r.filter(x => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test((x[0] || '').trim()) && isFinite(parseFloat(x[c]))).map(x => parseFloat(x[c]));
}

(async () => {
  const banks = load('banks'), rates = load('rates'), mom = load('surprises') || load('momentum'), cot = load('cot'), cur = load('currencies'), marks = load('marks') || {};
  const policy = load('policy');
  if (!banks) { console.error('score-build: banks.json is required'); process.exit(1); }
  const v1 = {}; ((cur && cur.currencies) || []).forEach(c => { v1[c.ccy] = c.drivers || {}; });
  const mark = (c, k) => { const m = ((marks[k] || {})[c]) || {}; return isFinite(+m.mark) ? +m.mark : 0; };
  const markWhy = (c, k, dflt) => ((marks[k] || {})[c] || {}).why || dflt;

  let vix = null, brent = null, cpi = null, ausCom = null;
  if (!OFFLINE) {
    try { vix = await fred('VIXCLS'); } catch (e) { console.log('score-build: VIX unavailable (' + e.message + ')'); }
    try { brent = await fred('DCOILBRENTEU'); } catch (e) { console.log('score-build: Brent unavailable (' + e.message + ')'); }
    try { cpi = await bisCpi(); } catch (e) { console.log('score-build: inflation unavailable (' + e.message + ')'); }
    try { ausCom = await rbaCommodities(); } catch (e) { console.log('score-build: Australian commodity prices unavailable (' + e.message + ')'); }
  }

  /* --- rates: where its interest rates sit against the middle of the eight:
         the central bank's policy rate and, where a feed exists, the two-year
         government yield (the franc's comes from the monthly Swiss figures).
         The one-month move in the yield is described but not counted. --- */
  const pol = {};
  (banks.banks || []).forEach(b => { const v = rateNum(b.rate); if (v != null) pol[b.ccy] = v; });
  if (policy && policy.rates) CCYS.forEach(c => { const r = policy.rates[c]; if (r && typeof r.rate === 'number' && !r.pending) pol[c] = r.rate; });
  const polMed = median(CCYS.filter(c => pol[c] != null).map(c => pol[c]));
  const y = (rates && rates.yields) || {}, ym = (rates && rates.monthly) || {};
  const y2 = {}; CCYS.forEach(c => { const v = (y[c] || ym[c] || {}).y2; if (typeof v === 'number') y2[c] = v; });
  const y2Med = Object.keys(y2).length >= 5 ? median(Object.values(y2)) : null;
  const moves = CCYS.filter(c => y[c] && typeof y[c].chg_1m === 'number').map(c => y[c].chg_1m);
  const moveMed = moves.length >= 4 ? median(moves) : null;

  /* --- inflation against each bank's goal, compared with the others. --- */
  const gap = {}; if (cpi) CCYS.forEach(c => { if (cpi[c]) gap[c] = cpi[c].rate - GOAL[c]; });
  const gapMed = Object.keys(gap).length >= 6 ? median(Object.values(gap)) : null;

  /* --- risk mood from the VIX: its latest level against its own past year. --- */
  let mood = null, moodWhy = '';
  if (vix && vix.length > 260) {
    const yr = vix.slice(-252).map(x => x[1]), last = vix[vix.length - 1][1], med = median(yr);
    const sd = Math.sqrt(yr.reduce((a, v) => a + (v - med) * (v - med), 0) / yr.length) || 1;
    mood = clamp((last - med) / sd, -1.5, 1.5) / 1.5;       // +1 = very nervous, -1 = very calm
    moodWhy = mood > 0.33 ? 'Markets are more nervous than usual' : mood < -0.33 ? 'Markets are calmer than usual' : 'Market mood is close to normal';
  }
  /* --- oil: Brent's change over about a month. Australia: its export prices over three months. --- */
  let oil = null;
  if (brent && brent.length > 30) { const a = brent[brent.length - 1][1], b = brent[brent.length - 22][1]; oil = clamp((a / b - 1) / 0.10, -1, 1); }
  let aus = null;
  if (ausCom && ausCom.length > 4) { const a = ausCom[ausCom.length - 1], b = ausCom[ausCom.length - 4]; aus = clamp((a / b - 1) / 0.10, -1, 1); }

  const out = {};
  CCYS.forEach(c => {
    const P = {};
    // rates
    if (pol[c] != null) {
      const g = pol[c] - polMed, parts = [clamp(g / 1.5, -1, 1)];
      let why = 'Its central bank rate is ' + (Math.abs(g) < 0.13 ? 'in the middle of the eight' : pts(g) + ' points ' + (g > 0 ? 'above' : 'below') + ' the middle of the eight');
      if (y2Med != null && y2[c] != null) {
        const gy = y2[c] - y2Med; parts.push(clamp(gy / 1.5, -1, 1));
        why += Math.abs(gy) < 0.13 ? ', and its two-year bond yield is close to the middle too.' : ', and its two-year bond yield is ' + pts(gy) + ' points ' + (gy > 0 ? 'above' : 'below') + ' the middle.';
      } else why += '. No two-year yield feed covers it yet.';
      if (moveMed != null && y[c] && typeof y[c].chg_1m === 'number') {
        const rel = y[c].chg_1m - moveMed;
        if (Math.abs(rel) >= 0.08) why += ' Over the past month that yield has ' + (rel > 0 ? 'risen faster than' : 'fallen behind') + ' the others.';
      }
      P.rates = { value: r2(2 * parts.reduce((a, v) => a + v, 0) / parts.length), measured: true, why };
    }
    // inflation
    if (gapMed != null && gap[c] != null) {
      const rel = gap[c] - gapMed, rate = cpi[c].rate;
      P.inflation = { value: r2(2 * clamp(rel / 1.5, -1, 1)), measured: true,
        why: 'Prices are rising about ' + rate.toFixed(1) + '% a year against ' + BANK[c] + "'s goal of " + GOAL[c] + '%, ' + (Math.abs(rel) < 0.3 ? 'about as far from goal as most of the others.' : rel > 0 ? 'hotter than in most of the others, which keeps pressure on rates.' : 'cooler than in most of the others, which eases pressure on rates.') };
    } else P.inflation = { value: 0, measured: false, why: 'No inflation reading this run, so this counts as neutral.' };
    // growth: beats against misses in the latest releases (not yet tested)
    const rec = (((mom || {}).currencies || {})[c] || {}).recent || [];
    if (rec.length >= 3) {
      const b = rec.filter(x => x.result === 'beat').length, m = rec.filter(x => x.result === 'miss').length;
      P.growth = { value: r2(2 * (b - m) / rec.length), measured: true, why: 'Of its last ' + rec.length + ' data releases, ' + b + ' beat forecasts and ' + m + ' missed.' };
    } else P.growth = { value: 0, measured: false, why: 'Too few recent data releases to judge, so this counts as neutral.' };
    // risk mood: context only, not counted
    if (mood != null) P.risk = { value: r2(2 * mood * HAVEN[c]), measured: true, why: moodWhy + (HAVEN[c] === 0 || Math.abs(mood) <= 0.33 ? ', which does little for ' + NAME[c] + '.' : ', which usually ' + (mood * HAVEN[c] > 0 ? 'helps ' : 'hurts ') + NAME[c] + ' at first.') };
    // terms of trade
    if (oil != null && OIL[c]) P.tot = { value: r2(2 * oil * OIL[c]), measured: true, why: 'Oil has ' + (Math.abs(oil) < 0.2 ? 'barely moved' : oil > 0 ? 'risen' : 'fallen') + ' over the past month, and ' + NAME[c] + (OIL[c] > 0 ? ' belongs to an oil exporter.' : ' belongs to an oil importer.') };
    else if (aus != null && c === 'AUD') P.tot = { value: r2(2 * aus), measured: true, why: 'The prices Australia gets for its exports have ' + (Math.abs(aus) < 0.2 ? 'barely moved' : aus > 0 ? 'risen' : 'fallen') + ' over the past three months.' };
    else P.tot = { value: 2 * mark(c, 'tot'), measured: false, why: markWhy(c, 'tot', 'No price feed for what this country sells and buys, so this counts as neutral.') };
    // positioning: counts against the bet only at an extreme (not yet tested)
    const m = cot && (cot.markets || []).find(x => x.id === c);
    if (m && m.hf && isFinite(m.hf.pct)) {
      const p = m.hf.pct;
      P.positioning = p >= 90 ? { value: -2, measured: true, why: 'Hedge funds are betting on it more heavily than at almost any time since 2015, which leaves few buyers left.' }
        : p <= 10 ? { value: 2, measured: true, why: 'Hedge funds are betting against it more heavily than at almost any time since 2015, which leaves few sellers left.' }
        : { value: r2((p - 50) / 50 * 0.5), measured: true, why: 'Hedge fund bets are not at an extreme, so this counts for little.' };
    } else P.positioning = { value: 0, measured: false, why: 'No positioning reading this week, so this counts as neutral.' };
    // fiscal: a judged mark (no single number captures it)
    P.fiscal = { value: 2 * mark(c, 'fiscal'), measured: false, why: markWhy(c, 'fiscal', 'Public finances are not a factor right now.') };

    Object.keys(P).forEach(k => { P[k].counted = (WEIGHTS[k] || 0) > 0; P[k].tested = !!TESTED[k]; });
    const avg = keys => { let s = 0, w = 0; keys.forEach(k => { const p = P[k]; if (!p || !WEIGHTS[k]) return; s += WEIGHTS[k] * clamp(p.value, -2, 2) / 2; w += WEIGHTS[k]; }); return w ? Math.round(s / w * 100) : 0; };
    const counted = Object.keys(WEIGHTS).filter(k => WEIGHTS[k] > 0);
    let measuredW = 0, totalW = 0; counted.forEach(k => { totalW += WEIGHTS[k]; if (P[k] && P[k].measured) measuredW += WEIGHTS[k]; });
    /* Points: each counted driver's share of a -10..+10 score, to one decimal;
       a share under a quarter point shows as 0 ("not moving it"). */
    let sumPts = 0;
    Object.keys(P).forEach(k => {
      const w = WEIGHTS[k] || 0; let v = w ? Math.round(100 * w * clamp(P[k].value, -2, 2) / 2 / totalW) / 10 : 0;
      if (Math.abs(v) < 0.25) v = 0; P[k].points = v; sumPts += v;
    });
    out[c] = { points: Math.round(sumPts * 10) / 10, score: avg(counted), tested_score: avg(Object.keys(TESTED)), measured_share: Math.round(measuredW / totalW * 100),
      v1_score: Object.keys(v1[c] || {}).reduce((a, k) => a + (+v1[c][k].score || 0), 0), drivers: P };
  });

  const asOf = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  let prev = load('score-v2');
  const history = ((prev && prev.history) || []).filter(h => h.date !== asOf);
  history.push({ date: asOf, points: Object.fromEntries(CCYS.map(c => [c, out[c].points])), scores: Object.fromEntries(CCYS.map(c => [c, out[c].score])), tested: Object.fromEntries(CCYS.map(c => [c, out[c].tested_score])), v1: Object.fromEntries(CCYS.map(c => [c, out[c].v1_score])) });
  const doc = {
    _about: 'Blue Street currency score (since 2026-11-17 the score on the site). Rate levels, inflation and terms of trade passed a price-history test (2016-2026) with a small, steady edge; market mood failed and is shown with no weight; growth, positioning and fiscal are not yet tested. Evidence, not a forecast.',
    updated: new Date().toISOString(), as_of: asOf, scale: 'score -100 to +100; points -10 to +10 (what the site shows)', weights: WEIGHTS,
    names: NAME_FULL, banks: BANK_ID,
    tested: Object.keys(TESTED),
    inputs: { vix: !!vix, brent: !!brent, inflation: cpi ? Object.keys(cpi) : [], aus_export_prices: !!ausCom, yields: Object.keys(y), yields_monthly: Object.keys(ym) },
    ranking: CCYS.slice().sort((a, b) => out[b].points - out[a].points || out[b].score - out[a].score),
    currencies: out, history: history.slice(-180)
  };
  console.log(CCYS.slice().sort((a, b) => out[b].score - out[a].score).map(c => c + ' ' + out[c].score + ' (tested part ' + out[c].tested_score + ', live score now ' + out[c].v1_score + ', ' + out[c].measured_share + '% measured)').join('\n'));
  if (DRY) return;
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log('score-build: wrote data/score-v2.json as of ' + asOf);
})().catch(e => { console.error('score-build: ' + (e && e.stack || e)); process.exit(1); });
