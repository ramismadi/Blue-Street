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
  ['NZD rbnz no-www', 'https://rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/series/b/b2/hb2-daily-close.xlsx', 'zip'],
  ['NZD rbnz page', 'https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/wholesale-interest-rates'],
  ['NZD FRED OECD NZ long rate', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01NZM156N'],
  ['NZD FRED OECD NZ 3m', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=IR3TIB01NZM156N'],
  ['GBP IADB IUDSNZC', 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Nov/2026&Dateto=now&SeriesCodes=IUDSNZC&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N'],
  ['GBP IADB IUDSOIA', 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Nov/2026&Dateto=now&SeriesCodes=IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N'],
  ['GBP BoE nominal archive zip', 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip', 'zip'],
  ['GBP latest zip inner sheets', 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip', 'inner'],
  ['CPI FRED US', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPALTT01USM659N'],
  ['CPI FRED GB', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPALTT01GBM659N'],
  ['CPI FRED CH', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPALTT01CHM659N'],
  ['CPI FRED NZ q', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPALTT01NZQ659N'],
  ['CPI FRED EA HICP', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CP0000EZ19M086NEST'],
  ['BCI FRED US', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP02USM460S'],
  ['BCI FRED DE', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BSCICP03EZM665S'],
  ['CPI OECD plain', 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/USA.M.N.CPI.PA._T.N.GY?startPeriod=2026-01&format=csvfile'],
  ['CPI OECD all', 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/.M.N.CPI.PA._T.N.GY?startPeriod=2026-06&format=csvfile'],
  ['BCI OECD all', 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,4.1/.M.BCICP......?startPeriod=2026-06&format=csvfile'],
  ['IMF dairy FRED', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=PDAIRYUSDM'],
  ['ECB HICP all EA', 'https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?lastNObservations=3&format=csvdata'],
  ['BIS CPI', 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LONG_CPI/1.0/M.US+XM+GB+JP+CH+CA+AU+NZ.771?startPeriod=2026-01&format=csv']
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
        for (const f of fs.readdirSync('/tmp/y/xl/worksheets').filter(f => f.endsWith('.xml'))) { const s = fs.readFileSync('/tmp/y/xl/worksheets/' + f, 'utf8'); console.log('-- ' + f + ' ' + s.length); console.log(s.slice(0, 2500)); }
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
