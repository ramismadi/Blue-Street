#!/usr/bin/env node
/* Blue Street — one-off source check for Scoring v2 (Claude). Tries each
   candidate source from GitHub's servers and prints what came back.
   Temporary: removed once the sources are wired into the builders. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BlueStreet-probe/1.0; +https://github.com/ramismadi/Blue-Street)' };
async function get(url, bin) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal, redirect: 'follow' });
    const b = Buffer.from(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type'), buf: b };
  } finally { clearTimeout(t); }
}
const PROBES = [
  ['NZD DMO', 'https://debtmanagement.treasury.govt.nz/government-securities/nzgbs'],
  ['BIS CPI areas', 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LONG_CPI/1.0/M+Q.US+XM+GB+JP+CH+CA+AU+NZ.771?startPeriod=2026-01&format=csv', 'areas'],
  ['BCI FRED GB', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02GBM460S'],
  ['BCI FRED JP', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02JPM460S'],
  ['BCI FRED CA', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02CAM460S'],
  ['BCI FRED AU', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02AUM460S'],
  ['BCI FRED NZ', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02NZQ460S'],
  ['BCI FRED CH', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02CHM460S'],
  ['BCI FRED EA', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02EZM460S'],
  ['BCI FRED DE', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02DEM460S'],
  ['GBP spot sheet', 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip', 'inner']
];
(async () => {
  for (const [name, url, kind] of PROBES) {
    try {
      const r = await get(url);
      console.log('\n=== ' + name + ' — HTTP ' + r.status + ' ' + r.type + ' ' + r.buf.length + ' bytes');
      if (kind === 'inner' && r.status === 200) {
        fs.writeFileSync('/tmp/p.zip', r.buf); execFileSync('rm', ['-rf', '/tmp/x']); execFileSync('unzip', ['-q', '-o', '/tmp/p.zip', '-d', '/tmp/x']);
        execFileSync('unzip', ['-q', '-o', '/tmp/x/GLC Nominal daily data current month.xlsx', '-d', '/tmp/y']);
        console.log(execFileSync('ls', ['/tmp/y/xl/worksheets']).toString());
        console.log(fs.readFileSync('/tmp/y/xl/workbook.xml', 'utf8').slice(0, 1500));
        const ss = fs.readFileSync('/tmp/y/xl/sharedStrings.xml', 'utf8'); console.log(ss.slice(0, 1200));
        const sst = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
        console.log(fs.readFileSync('/tmp/y/xl/workbook.xml', 'utf8').match(/<sheet [^>]*>/g).join('\n'));
        const s = fs.readFileSync('/tmp/y/xl/worksheets/sheet4.xml', 'utf8');
        const all = [...s.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)];
        all.slice(0, 8).concat(all.slice(-2)).forEach(r => console.log([...r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>(?:<f>[^<]*<\/f>)?<v>([^<]*)<\/v>/g)].slice(0, 12).map(c => c[1] + '=' + (/t="s"/.test(c[2]) ? sst[+c[3]] : c[3])).join(' | ')));
      } else if (kind === 'areas' && r.status === 200) {
        const t = r.buf.toString('utf8').split(/\r?\n/).slice(1).filter(Boolean); const last = {};
        t.forEach(l => { const x = l.split(','); last[x[0] + ' ' + x[1]] = x[9] + ' ' + x[10]; }); console.log(last);
      } else if (kind === 'zip' && r.status === 200) {
        fs.writeFileSync('/tmp/p.zip', r.buf);
        console.log(execFileSync('unzip', ['-l', '/tmp/p.zip']).toString().split('\n').slice(0, 25).join('\n'));
      } else {
        const t = r.buf.toString('utf8'), lines = t.split(/\r?\n/).filter(Boolean);
        console.log(lines.slice(0, 6).join('\n').slice(0, 1500));
        console.log('...'); console.log(lines.slice(-4).join('\n').slice(0, 1200));
      }
    } catch (e) { console.log('\n=== ' + name + ' — FAILED ' + (e && e.message)); }
  }
})();
