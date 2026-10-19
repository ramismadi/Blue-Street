#!/usr/bin/env node
/* Blue Street — weekly COT snapshot (Claude's job; runs in GitHub Actions).
   Uses the exact same calculator the site uses (assets/cot.js), writes
   data/cot.json, and exits 0 without touching the file when the CFTC has
   not published a newer report (so the Action only commits real updates).

   Usage: node tools/cot-build.cjs [--force]
   Needs Node 18+ (global fetch). */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'cot.json');
const force = process.argv.includes('--force');

globalThis.window = globalThis;
require(path.join(ROOT, 'assets', 'cot.js'));

function fail(msg) {
  console.error('cot-build: ' + msg);
  process.exit(1);
}

(async () => {
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }

  const d = await window.BlueStreetCOT.build();

  // Sanity checks: a bad pull must never replace a good snapshot.
  const want = window.BlueStreetCOT.MARKETS.length;
  if (!d.report_date) fail('no report date');
  if (!Array.isArray(d.markets) || d.markets.length !== want) fail('expected ' + want + ' markets, got ' + (d.markets || []).length);
  for (const m of d.markets) {
    if (m.as_of !== d.report_date) fail(m.id + ' is as of ' + m.as_of + ', report is ' + d.report_date);
    if (!(m.hf.weeks > 500)) fail(m.id + ' has only ' + m.hf.weeks + ' weeks of history');
    if (!(m.hf.pct >= 0 && m.hf.pct <= 100)) fail(m.id + ' percentile out of range');
    if (!(m.oi > 0)) fail(m.id + ' has no open interest');
  }

  if (!force && prev && prev.report_date === d.report_date) {
    console.log('cot-build: report ' + d.report_date + ' already published, nothing to do');
    return;
  }
  if (prev && prev.report_date > d.report_date) fail('CFTC returned an older report than the snapshot');

  fs.writeFileSync(OUT, JSON.stringify(d, null, 1) + '\n');
  console.log('cot-build: wrote ' + path.relative(ROOT, OUT) + ' for report ' + d.report_date);
  for (const m of d.markets) {
    console.log('  ' + m.id.padEnd(4) + ' ' + m.hf.zone.padEnd(14) + String(m.hf.pct).padStart(5) + ' pct' +
      (m.rm ? '   real money ' + m.rm.zone + ' ' + m.rm.pct : '') + (m.split ? '  SPLIT' : '') + (m.signal ? '  signal ' + m.signal : ''));
  }
})().catch((e) => fail(e && e.stack || String(e)));
