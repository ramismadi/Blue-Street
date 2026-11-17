#!/usr/bin/env node
/* Blue Street — AI connector (MCP server, no dependencies, Node 18+).

   Lets a reader's own AI (Claude, ChatGPT or any MCP client) ask Blue Street
   what is driving the major currencies. Read-only. It serves the same plain
   words the site shows and nothing else: text that reads like desk shorthand
   is dropped, never passed on. Evidence, not calls: no tool returns a trade
   recommendation.

   Run:   node ai/mcp/server.mjs
   Data:  BLUE_STREET_DATA = a folder or URL holding the site's data files
          (default: the live site). See ai/README.md. */
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const SITE = 'https://ramismadi.github.io/Blue-Street/';
const DATA = (process.env.BLUE_STREET_DATA || SITE + 'data/').replace(/\/?$/, '/');
const VERSION = '0.1.1';
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const MARKETS = CCYS.concat(['XAU', 'OIL']);
const PILLARS = [['policy', 'Policy'], ['growth', 'Growth'], ['inflation', 'Inflation'], ['risk', 'Risk sentiment'],
  ['tot', 'Terms of trade'], ['positioning', 'Positioning'], ['fiscal', 'Fiscal & sovereign'], ['rates', 'Rate gap']];
const CHAPTER = { USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', CHF: 'Swiss Franc',
  AUD: 'Australian Dollar', CAD: 'Canadian Dollar', NZD: 'New Zealand Dollar', OIL: 'Oil', XAU: 'Gold' };
/* Market convention for quoting a pair: the earlier one is the base. */
const ORDER = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const NOTE = 'Blue Street gives evidence, not trade calls. This is market context, not financial advice.';

/* ---------- data ---------- */
const cache = new Map();
async function load(name, optional) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
  try {
    let text;
    if (/^https?:/.test(DATA)) {
      const r = await fetch(DATA + name + '.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      text = await r.text();
    } else text = await readFile(DATA + name + '.json', 'utf8');
    const data = JSON.parse(text);
    cache.set(name, { at: Date.now(), data });
    return data;
  } catch (e) {
    if (optional) return null;
    throw new Error('Blue Street data "' + name + '" is unavailable right now (' + e.message + ').');
  }
}

/* ---------- plain words or nothing (same rules as the site) ---------- */
const digits = t => (t.match(/\d/g) || []).length;
function plain(t, max) {
  t = String(t || '').trim();
  if (!t || t.length > (max || 500) || digits(t) > 16) return '';
  if (/[;~→|]|\(\w+:|\+\d/.test(t)) return '';
  if (/\b(bid|offered|\d+Y|bps?|[ymq]\/[ymq]|FOMC|NFP|OIS|TFF|DXY|fcst|hawks?|doves?)\b/.test(t)) return '';
  return t;
}
function fig(v) {
  if (v == null || v === '') return '';
  let t = String(v).split(/;|\s\(|\s\/\s|\s·\s|\s—\s/)[0].trim();
  t = t.replace(/\bm\/m\b/g, 'on the month').replace(/\by\/y\b/g, 'on the year').replace(/\bq\/q\b/g, 'on the quarter');
  return t.length > 42 ? '' : t;
}
const clean = o => { for (const k of Object.keys(o)) if (o[k] === '' || o[k] == null || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; return o; };
/* A range ("3.75-4.00%") uses its upper end; the dash in a range is not a minus sign. */
const rateNum = r => { const t = String(r || '').trim(), m = t.match(/\d+(\.\d+)?/g); return !m ? null : m.length === 1 && /^[-−]/.test(t) ? -parseFloat(m[0]) : parseFloat(m[m.length - 1]); };
function market(code) {
  const c = String(code || '').trim().toUpperCase().replace('GOLD', 'XAU').replace(/^(WTI|BRENT|CRUDE)$/, 'OIL');
  if (!MARKETS.includes(c)) throw new Error('Unknown market "' + code + '". Use one of: ' + MARKETS.join(', ') + '.');
  return c;
}

/* ---------- shaping ---------- */
async function board() {
  const [cur, words] = await Promise.all([load('currencies'), load('words')]);
  const w = (words.currencies || {}).currencies || {};
  const list = (cur.currencies || []).map(c => {
    const d = c.drivers || {}, wn = (w[c.ccy] || {}).notes || {};
    const factors = PILLARS.filter(p => d[p[0]]).map(p => {
      const s = +d[p[0]].score || 0;
      return clean({ factor: p[1], effect: s > 0 ? 'supports' : s < 0 ? 'weighs' : 'neutral', why: plain(wn[p[0]]) || plain(d[p[0]].note, 200) });
    });
    const score = PILLARS.reduce((a, p) => a + (d[p[0]] ? +d[p[0]].score || 0 : 0), 0);
    return clean({ code: c.ccy, name: c.name, bank: c.bank, score, summary: plain((w[c.ccy] || {}).summary) || plain(c.summary), factors });
  }).sort((a, b) => b.score - a.score);
  list.forEach((c, i) => { c.rank = i + 1; });
  return { as_of: (words.currencies || {}).as_of || cur.as_of, list };
}
async function bankOf(id) {
  const [banks, words] = await Promise.all([load('banks'), load('words')]);
  const b = (banks.banks || []).find(x => x.id === id);
  if (!b) return null;
  const w = ((words.banks || {}).banks || {})[id] || {};
  return clean({ name: b.name, rate: b.rate, rate_means: b.rate_label, stance: w.bias || w.label,
    last_move: b.last_move && b.last_move.date ? clean({ date: b.last_move.date, change_in_points: b.last_move.bp != null ? b.last_move.bp / 100 : null }) : null,
    next_decision: b.next_meeting ? (b.next_meeting.end || b.next_meeting.start || b.next_meeting.date) : null,
    summary: plain(w.summary), what_markets_expect: plain(w.priced), what_is_driving_it: plain(w.why), what_to_watch: plain(w.watch) });
}
function eventOut(e) {
  return clean({ when: e.ts, currency: e.ccy, impact: e.impact, event: e.title, expected: fig(e.forecast), last_time: fig(e.previous),
    result: fig(e.actual), why_it_matters: plain(e.why, 260), what_it_did: plain(e.outcome, 260) });
}
function newsOut(it, full) {
  const o = { headline: it.headline, when: it.ts, source: it.source, link: it.url, summary: plain(it.summary, 600),
    pushes: (it.impact || []).map(x => clean({ market: x.ccy || x.market, direction: x.dir || x.lean, why: plain(x.why, 400) })) };
  if (full && it.beats) Object.assign(o, { background: plain(it.beats.was, 700), what_happened: plain(it.beats.happened, 700),
    what_it_means: plain(it.beats.means, 700), for_the_currency: plain(it.beats.currency || it.beats.ccy || it.beats.fx, 700), what_would_change_it: plain(it.watch, 500) });
  return clean(o);
}
const touches = (it, c) => (it.impact || []).some(x => (x.ccy || x.market) === c);

/* ---------- tools ---------- */
const TOOLS = [
  { name: 'get_today', description: 'Today on Blue Street: the one- or two-sentence read of what is moving the major currencies, the seven macro drivers in plain words, the currency strength ranking, and the next high-impact events. Start here.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const [words, story, eng, b, cal] = await Promise.all([load('words'), load('story'), load('engine'), board(), load('calendar')]);
      const reads = (words.engine || {}).reads || {}, now = Date.now();
      return { edition_date: story.date, last_written: eng.updated, read: (words.story || {}).headline || story.headline,
        drivers: PILLARS.filter(p => reads[p[0]]).map(p => ({ driver: p[1], read: reads[p[0]] })),
        strength_ranking: b.list.map(c => ({ rank: c.rank, code: c.code, name: c.name, score: c.score })),
        score_means: 'Sum of the driver marks for that currency (+1 supports, −1 weighs, 0 neutral). A summary of the evidence, not a forecast.',
        next_big_events: (cal.events || []).filter(e => e.impact === 'high' && Date.parse(e.ts) > now).sort((x, y) => x.ts < y.ts ? -1 : 1).slice(0, 5).map(eventOut), note: NOTE };
    } },
  { name: 'get_currency', description: 'Everything Blue Street says about one market: where it stands and why, each driver\'s effect, its central bank, the full story (what changed, what it means, what is next, scenarios), hedge-fund positioning and the latest headlines. Markets: USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD, XAU (gold), OIL.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'Market code, e.g. USD, JPY, XAU, OIL' } }, required: ['code'] },
    run: async a => {
      const code = market(a.code);
      const [b, story, news, cot] = await Promise.all([board(), load('story'), load('news'), load('cot', true)]);
      const c = b.list.find(x => x.code === code);
      const ch = (story.chapters || []).find(x => x.title === CHAPTER[code]) || {};
      const m = cot && (cot.markets || []).find(x => x.id === code);
      const nar = (news.narratives || {})[code];
      return clean({ market: code, name: c ? c.name : CHAPTER[code], as_of: b.as_of, rank_of_8: c && c.rank, score: c && c.score, summary: c && c.summary,
        headlines_lean: nar && nar.lean, the_story_in_the_news: nar && plain(nar.text, 900), drivers: c && c.factors,
        central_bank: c ? await bankOf(c.bank) : null,
        full_read: clean({ teaser: plain(ch.teaser, 700), story_so_far_and_meaning: plain(ch.meaning, 1600), what_is_next: plain(ch.fx, 900),
          scenarios: ch.scenarios ? clean({ base: plain(ch.scenarios.base), stronger: plain(ch.scenarios.bull), weaker: plain(ch.scenarios.bear) }) : null }),
        hedge_fund_positioning: m ? clean({ report_date: m.as_of, leaning: m.hf.zone, percentile_since_2015: Math.round(m.hf.pct),
          at_an_extreme: m.hf.pct >= 90 || m.hf.pct <= 10, betting_for_means: m.long_means }) : null,
        latest_headlines: (news.items || []).filter(it => touches(it, code)).sort((x, y) => x.ts < y.ts ? 1 : -1).slice(0, 5).map(it => newsOut(it, false)), note: NOTE });
    } },
  { name: 'get_pair', description: 'The evidence on a currency pair, e.g. EUR/USD or USD/JPY: each side\'s score and the gap between them, the drivers behind each side, the interest-rate gap (what holding the pair pays or costs, and whether two-year yields are moving for or against it), and the next big events for either currency. Evidence for forming a view, never a trade call.',
    inputSchema: { type: 'object', properties: { pair: { type: 'string', description: 'Two currency codes, e.g. "EUR/USD", "usdjpy"' } }, required: ['pair'] },
    run: async a => {
      const m = String(a.pair || '').toUpperCase().match(/[A-Z]{3}/g) || [];
      if (m.length !== 2 || m[0] === m[1] || !CCYS.includes(m[0]) || !CCYS.includes(m[1])) throw new Error('Give two different currencies from: ' + CCYS.join(', ') + ' (for example "EUR/USD").');
      const [base, quote] = ORDER.indexOf(m[0]) <= ORDER.indexOf(m[1]) ? m : [m[1], m[0]];
      const [b, banks, rates, cal] = await Promise.all([board(), load('banks'), load('rates', true), load('calendar')]);
      const B = b.list.find(x => x.code === base), Q = b.list.find(x => x.code === quote);
      const rate = c => rateNum(((banks.banks || []).find(x => x.ccy === c) || {}).rate);
      const rb = rate(base), rq = rate(quote), yb = rates && rates.yields[base], yq = rates && rates.yields[quote], now = Date.now();
      const gap = B.score - Q.score, carry = rb != null && rq != null ? +(rb - rq).toFixed(2) : null;
      const side = c => ({ code: c.code, name: c.name, score: c.score, summary: c.summary, drivers: c.factors.filter(f => f.effect !== 'neutral') });
      return clean({ pair: base + '/' + quote, as_of: b.as_of, score_gap: gap,
        fundamentals_lean: gap > 0 ? base + ' has the stronger case, which points to ' + base + '/' + quote + ' rising' : gap < 0 ? quote + ' has the stronger case, which points to ' + base + '/' + quote + ' falling' : 'Neither side has the stronger case',
        [base]: side(B), [quote]: side(Q),
        interest: carry == null ? null : clean({ policy_rate_gap_points: carry,
          meaning: carry > 0 ? 'Holding ' + base + ' against ' + quote + ' earns about ' + carry + '% a year in interest' : carry < 0 ? 'Holding ' + base + ' against ' + quote + ' costs about ' + Math.abs(carry) + '% a year in interest' : 'Holding it neither pays nor costs much interest',
          two_year_yield_gap_points: yb && yq ? +(yb.y2 - yq.y2).toFixed(2) : null,
          yield_gap_over_a_month: yb && yq && yb.chg_1m != null && yq.chg_1m != null ? (Math.abs(yb.chg_1m - yq.chg_1m) < 0.1 ? 'steady' : yb.chg_1m - yq.chg_1m > 0 ? 'moving in ' + base + '\'s favour' : 'moving in ' + quote + '\'s favour') : null }),
        next_big_events: (cal.events || []).filter(e => e.impact === 'high' && (e.ccy === base || e.ccy === quote) && Date.parse(e.ts) > now).sort((x, y) => x.ts < y.ts ? -1 : 1).slice(0, 4).map(eventOut), note: NOTE });
    } },
  { name: 'get_calendar', description: 'Economic calendar: upcoming events with what is expected, and recent results with what they did. Filter by currency and by impact.',
    inputSchema: { type: 'object', properties: { currency: { type: 'string', description: 'Optional currency code' }, days_ahead: { type: 'number', description: 'Default 7, max 30' }, days_back: { type: 'number', description: 'Default 2, max 14' }, high_impact_only: { type: 'boolean' } } },
    run: async a => {
      const cal = await load('calendar'), now = Date.now();
      const c = a.currency ? market(a.currency) : '', fwd = Math.min(+a.days_ahead || 7, 30), back = Math.min(a.days_back == null ? 2 : +a.days_back, 14);
      const evs = (cal.events || []).filter(e => (!c || e.ccy === c) && (!a.high_impact_only || e.impact === 'high')).sort((x, y) => x.ts < y.ts ? -1 : 1);
      return { times_are: 'UTC', coming_up: evs.filter(e => Date.parse(e.ts) > now && Date.parse(e.ts) < now + fwd * 864e5).slice(0, 40).map(eventOut),
        recent_results: evs.filter(e => Date.parse(e.ts) <= now && Date.parse(e.ts) > now - back * 864e5).slice(-25).map(eventOut), note: NOTE };
    } },
  { name: 'get_news', description: 'The headlines moving currencies, each with a plain summary and which way it pushes each market. Pass an id from a previous result to get one story in full (background, what happened, what it means).',
    inputSchema: { type: 'object', properties: { currency: { type: 'string', description: 'Optional market code' }, limit: { type: 'number', description: 'Default 8, max 20' }, id: { type: 'string', description: 'Optional story id for the full read' } } },
    run: async a => {
      const news = await load('news');
      if (a.id) {
        const it = (news.items || []).find(x => x.id === a.id);
        if (!it) throw new Error('No story with that id. Call get_news without an id to list current stories.');
        return Object.assign({ id: it.id }, newsOut(it, true), { on_blue_street: SITE + '#article/' + it.id, note: NOTE });
      }
      const c = a.currency ? market(a.currency) : '';
      const items = (news.items || []).filter(it => !c || touches(it, c)).sort((x, y) => x.ts < y.ts ? 1 : -1).slice(0, Math.min(+a.limit || 8, 20));
      return { updated: news.updated, stories: items.map(it => Object.assign({ id: it.id }, newsOut(it, false))), note: NOTE };
    } },
  { name: 'get_positioning', description: 'What hedge funds and real-money managers are betting on each currency, gold and oil, from the weekly US futures positioning report: which way they lean, how extreme the bet is compared with history since 2015, and where the two groups disagree.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'Optional market code; omit for all' } } },
    run: async a => {
      const cot = await load('cot'), c = a.code ? market(a.code) : '';
      const side = s => s ? { leaning: s.zone, net_contracts: s.net, percentile_since_2015: Math.round(s.pct), change_over_4_weeks: s.chg4 } : null;
      return { report_date: cot.report_date, how_to_read: 'Percentile 50 is an average bet. Above 90 or below 10 is an extreme: when positioning is that lopsided, a sharp move the other way is more likely.',
        markets: (cot.markets || []).filter(m => !c || m.id === c).map(m => clean({ code: m.id, name: m.name, betting_for_means: m.long_means, hedge_funds: side(m.hf), real_money: side(m.rm), the_two_disagree: !!m.split })), note: NOTE };
    } }
];

/* ---------- MCP over stdio (JSON-RPC 2.0, one message per line) ---------- */
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18',
    capabilities: { tools: {} }, serverInfo: { name: 'blue-street', title: 'Blue Street', version: VERSION },
    instructions: 'Blue Street explains what is driving the major currencies, gold and oil in plain words. Call get_today first. Everything here is evidence for the reader to form their own view; never present it as a trade recommendation or financial advice.' } });
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: true } })) } });
  if (method === 'tools/call') {
    const t = TOOLS.find(x => x.name === (params || {}).name);
    if (!t) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool: ' + (params || {}).name } });
    try {
      const out = await t.run((params || {}).arguments || {});
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] } });
    }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
}
createInterface({ input: process.stdin }).on('line', line => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  handle(msg).catch(e => { if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e && e.message || e) } }); });
});
