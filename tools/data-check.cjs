#!/usr/bin/env node
/* Blue Street — data check (Claude's job; runs in GitHub Actions on every push
   that touches data/). Two questions:
   1. Is every data file valid, with the parts the site needs?
   2. Do the words readers see read as plain words? (Rami: plain-text
      explanations or nothing at all.) Desk shorthand in a reader-facing field
      is reported with the file and field so it can be rewritten.
   Exit code 1 on a broken file; shorthand is listed as warnings (the site
   already hides it) unless --strict is passed.
   Usage: node tools/data-check.cjs [--strict] */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(path.resolve(__dirname, '..'), 'data');
const STRICT = process.argv.includes('--strict');
const errors = [], warns = [];
const read = name => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8')); }
  catch (e) { errors.push(name + '.json: ' + (e.code === 'ENOENT' ? 'missing' : 'not valid JSON (' + e.message.slice(0, 80) + ')')); return null; }
};
const need = (ok, msg) => { if (!ok) errors.push(msg); };

/* Same idea as the site's own filter: short enough, not a wall of digits, no
   desk symbols or jargon. */
function slop(t) {
  t = String(t || '');
  if (!t) return '';
  if (/[~→|]|\(\w+:|\+\d+bp/.test(t)) return 'desk symbols';
  const m = /\b(bid|offered|\d+Y|bps?|[ymq]\/[ymq]|FOMC|NFP|OIS|TFF|DXY|fcst|hawks?|doves?|crowded|stretched|next test)\b/.exec(t);
  if (m) return 'the term "' + m[0] + '"';
  if ((t.match(/\d/g) || []).length > Math.max(18, t.length / 12)) return 'too many figures';
  return '';
}
/* The site hides a bank or currency line that contains a semicolon. */
const hidden = (where, t) => { if (/;/.test(String(t || ''))) warns.push(where + ': has a semicolon, so the site hides this line — "' + String(t).slice(0, 70) + '"'); };
const words = (where, t) => { const why = slop(t); if (why) warns.push(where + ': ' + why + ' — "' + String(t).slice(0, 90) + '"'); };
/* News stays up for days, so a bare "today" or "on Monday" goes stale. Write the date. */
const DAYS = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const STALE = new RegExp('\\b(today|tonight|tomorrow|yesterday|this (?:morning|afternoon|evening|week)|(?:on|this|next|last) ' + DAYS + '(?!,? (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \\d))\\b', 'i');
const dayWords = (where, t) => { const m = STALE.exec(String(t || '')); if (m) warns.push(where + ': "' + m[1] + '" goes stale, write the date — "' + String(t).slice(0, 80) + '"'); };

const REQUIRED = ['banks', 'calendar', 'cot', 'engine', 'glossary', 'learn', 'marks', 'news', 'pillars', 'score-v2', 'story', 'words'];
const d = {};
REQUIRED.forEach(n => { d[n] = read(n); });
['rates', 'policy', 'surprises', 'markets', 'latest', 'focus'].forEach(n => { if (fs.existsSync(path.join(DIR, n + '.json'))) d[n] = read(n); });

if (d.story) {
  need(/^\d{4}-\d\d-\d\d$/.test(d.story.date || ''), 'story.json: no edition date');
  need(Array.isArray(d.story.chapters) && d.story.chapters.length >= 8, 'story.json: fewer than 8 chapters');
  words('story.headline', d.story.headline);
  (d.story.chapters || []).forEach(c => { words('story "' + c.title + '" teaser', c.teaser); });
}
if (d.words) {
  const w = d.words;
  words('words.story.headline', (w.story || {}).headline);
  const hl = String((w.story || {}).headline || '');
  if ((hl.match(/[.!?](\s|$)/g) || []).length > 2) warns.push('words.story.headline: more than two sentences');
  Object.entries(((w.engine || {}).reads) || {}).forEach(([k, v]) => words('words.engine.' + k, v));
  Object.entries(((w.banks || {}).banks) || {}).forEach(([k, b]) => ['summary', 'priced', 'why', 'watch'].forEach(f => { words('words.banks.' + k + '.' + f, b[f]); hidden('words.banks.' + k + '.' + f, b[f]); }));
  Object.entries(((w.currencies || {}).currencies) || {}).forEach(([k, c]) => {
    words('words.currencies.' + k + '.summary', c.summary);
    Object.entries(c.notes || {}).forEach(([p, v]) => words('words.currencies.' + k + '.' + p, v));
  });
}
/* A currency summary must match its place on the board (Rami, 2026-11-16). */
if (d.words && d['score-v2'] && d['score-v2'].currencies) {
  const sc = {}; Object.entries(d['score-v2'].currencies).forEach(([c, x]) => { sc[c] = +x.points || 0; });
  const order = Object.keys(sc).sort((a, b) => sc[b] - sc[a]);
  const rank = c => { const s = sc[c]; return { best: order.findIndex(k => sc[k] === s) + 1, worst: order.length - order.slice().reverse().findIndex(k => sc[k] === s) }; };
  Object.entries((((d.words.currencies || {}).currencies) || {})).forEach(([c, v]) => {
    if (sc[c] == null) return; const t = String(v.summary || ''), r = rank(c);
    let want = null;
    if (/near the top|top of the board|tops the board|leads the board|high on the board/i.test(t)) want = r.best <= 3 ? null : 'the top';
    else if (/near the bottom|bottom of the board|low on the board|sits low|ranks low/i.test(t)) want = r.worst >= 6 ? null : 'the bottom';
    else if (/middle of the board|mid-board|in the middle/i.test(t)) want = (r.worst >= 3 && r.best <= 6) ? null : 'the middle';
    if (want) warns.push('words.currencies.' + c + '.summary: says ' + want + ' but ' + c + ' ranks ' + (r.best === r.worst ? r.best : r.best + '–' + r.worst) + ' of ' + order.length + ' on the board');
  });
}
if (d['score-v2']) need(d['score-v2'].currencies && Object.keys(d['score-v2'].currencies).length === 8, 'score-v2.json: expected 8 currencies');
if (d.engine) need(Array.isArray(d.engine.rows) && d.engine.rows.length === 7, 'engine.json: expected 7 rows');
if (d.marks) ['fiscal', 'tot'].forEach(k => Object.entries(d.marks[k] || {}).forEach(([c, m]) => {
  need([-1, 0, 1].includes(m.mark), 'marks.json: ' + k + '.' + c + ' must be -1, 0 or 1');
  words('marks.json ' + k + '.' + c, m.why);
}));
if (d.banks) need(Array.isArray(d.banks.banks) && d.banks.banks.length === 8, 'banks.json: expected 8 banks');
if (d.calendar) need(Array.isArray(d.calendar.events) && d.calendar.events.length > 0, 'calendar.json: no events');
if (d.cot) need(Array.isArray(d.cot.markets) && d.cot.markets.length >= 8, 'cot.json: fewer than 8 markets');
if (d.news) {
  need(Array.isArray(d.news.items), 'news.json: no items list');
  const seen = new Set();
  (d.news.items || []).forEach(it => {
    need(it.id && it.headline && (it.ts || it.date), 'news.json: an item is missing id, headline or time');
    if (seen.has(it.id)) errors.push('news.json: duplicate id ' + it.id);
    seen.add(it.id);
    need(!it.url || /^https?:\/\//.test(it.url), 'news.json: bad link on ' + it.id);
    words('news ' + it.id + ' summary', it.summary); dayWords('news ' + it.id + ' summary', it.summary);
    Object.entries(it.beats || {}).forEach(([k, v]) => { words('news ' + it.id + ' ' + k, v); dayWords('news ' + it.id + ' ' + k, v); });
    dayWords('news ' + it.id + ' watch', it.watch);
    (it.impact || []).forEach(x => words('news ' + it.id + ' ' + x.ccy, x.why));
  });
  Object.entries(d.news.narratives || {}).forEach(([k, v]) => words('news narrative ' + k, v.text));
}
if (d.learn) {
  const ids = new Set((d.learn.lessons || []).map(l => l.id));
  (d.learn.paths || []).forEach(p => (p.lessons || []).forEach(id => need(ids.has(id), 'learn.json: path "' + p.title + '" lists a missing lesson ' + id)));
  (d.learn.lessons || []).forEach(l => { words('learn ' + l.id + ' lead', l.lead); (l.sections || []).forEach(s => words('learn ' + l.id + ' / ' + s.h, s.p)); });
}
if (d.glossary) (d.glossary.terms || []).forEach(t => need(t.term && t.definition, 'glossary.json: a term is missing its name or definition'));

warns.forEach(w => console.log('plain-words: ' + w));
errors.forEach(e => console.error('BROKEN: ' + e));
console.log('data-check: ' + errors.length + ' broken, ' + warns.length + ' plain-words warnings');
process.exit(errors.length || (STRICT && warns.length) ? 1 : 0);
