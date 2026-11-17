#!/usr/bin/env node
/* Blue Street — data surprises (Claude's job; runs in GitHub Actions).

   Writes data/surprises.json: for each currency, its latest data releases
   and whether each beat, missed or matched the forecast. The score's growth
   driver and the "Data surprises" dots on each currency page read it.
   Replaces Hercules' hand-kept data/momentum.json (Rami, 2026-11-17).

   How a release is judged, in order:
   1. Both the result and the forecast hold a number: compare them, using the
      calendar's `better` ("higher" or "lower" is good for the currency).
      A gap under 0.05, or under 1% of the forecast for big numbers, counts as in line.
   2. Otherwise, the calendar's `outcome` line starts with "Beat", "Miss" or
      "In line".
   Only medium and high importance releases with a `better` direction count.
   Speeches and auctions without a forecast are left out.

   The calendar only keeps a few weeks, so the file keeps its own last six
   per currency and adds new ones as they print.

   Usage: node tools/surprise-build.cjs [--dry] */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(path.resolve(__dirname, '..'), 'data');
const OUT = path.join(DIR, 'surprises.json');
const DRY = process.argv.includes('--dry');
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const WINDOW = 6;

const load = f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
/* The first number in a calendar value: "+0.3% m/m (BFS official)" → 0.3, "−1.2K" → -1.2. */
function firstNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/[−–]/g, '-').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function judge(e) {
  const better = String(e.better || '').toLowerCase();
  if (better !== 'higher' && better !== 'lower') return null;
  const a = firstNum(e.actual), f = firstNum(e.forecast);
  if (a != null && f != null) {
    const tol = Math.max(0.049, Math.abs(f) / 100), d = a - f;
    if (Math.abs(d) < tol) return 'inline';
    return (d > 0) === (better === 'higher') ? 'beat' : 'miss';
  }
  const o = String(e.outcome || '').trim().toLowerCase();
  if (/^beat/.test(o)) return 'beat';
  if (/^miss/.test(o)) return 'miss';
  if (/^(in line|in-line|inline|as expected|matched)/.test(o)) return 'inline';
  return null;
}
const short = v => v == null ? null : String(v).split(/[(;]/)[0].trim().slice(0, 24) || null;

const cal = load('calendar.json');
if (!cal || !Array.isArray(cal.events)) { console.error('surprise-build: data/calendar.json missing or malformed'); process.exit(1); }
const prev = load('surprises.json');
/* First run: start from Hercules' hand-kept list so older releases carry over. */
const seed = prev || load('momentum.json');
const kept = {};
CCYS.forEach(c => { kept[c] = {}; ((((seed || {}).currencies || {})[c] || {}).recent || []).forEach(r => {
  kept[c][r.id] = { id: r.id, date: r.date, title: r.title, result: r.result, actual: prev ? r.actual : short(r.actual), forecast: prev ? r.forecast : short(r.forecast) };
}); });

let added = 0;
cal.events.forEach(e => {
  const c = String(e.ccy || '').toUpperCase();
  if (!kept[c] || !e.actual) return;
  if (!/^(medium|high)$/i.test(String(e.impact || ''))) return;
  const result = judge(e);
  if (!result) return;
  const date = String(e.ts || e.date || '').slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return;
  const row = { id: e.id || (c + '-' + date + '-' + e.title), date, title: e.title || '', result, actual: short(e.actual), forecast: short(e.forecast) };
  if (!kept[c][row.id]) added++;
  kept[c][row.id] = row;
});

const currencies = {};
CCYS.forEach(c => {
  currencies[c] = { recent: Object.values(kept[c]).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)).slice(0, WINDOW) };
});
const doc = {
  _about: 'Data surprises, built by tools/surprise-build.cjs from data/calendar.json (Claude). Newest first, last ' + WINDOW + ' medium or high importance releases per currency.',
  updated: new Date().toISOString(), window: WINDOW, currencies
};
const summary = CCYS.map(c => c + ' ' + currencies[c].recent.map(r => r.result[0]).join('')).join('  ');
console.log('surprise-build: ' + added + ' new; ' + summary);
if (prev && JSON.stringify(prev.currencies) === JSON.stringify(currencies)) { console.log('surprise-build: nothing new'); process.exit(0); }
if (DRY) { console.log(JSON.stringify(doc, null, 1).slice(0, 1500)); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log('surprise-build: wrote data/surprises.json');
