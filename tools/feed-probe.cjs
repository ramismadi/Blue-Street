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
  ['CHF 2y SNB rendeiduebd', 'https://data.snb.ch/api/cube/rendeiduebd/data/csv/en?fromDate=2026-09-01'],
  ['CHF SNB rendeiduebd dims', 'https://data.snb.ch/api/cube/rendeiduebd/dimensions/en'],
  ['GBP BoE IADB IUDSNPY', 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Oct/2026&Dateto=now&SeriesCodes=IUDSNPY,IUDMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N'],
  ['GBP BoE latest yield curve zip', 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip', 'zip'],
  ['NZD RBNZ hb2-daily-close', 'https://www.rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/series/b/b2/hb2-daily-close.xlsx', 'zip'],
  ['NZD RBNZ hb2-daily', 'https://www.rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/series/b/b2/hb2-daily.xlsx', 'zip'],
  ['FX FRED DEXUSEU', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXUSEU'],
  ['FX FRED DEXUSNZ', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXUSNZ'],
  ['Policy BIS CBPOL', 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.US+XM+GB+JP+CH+CA+AU+NZ?startPeriod=2026-10-01&format=csv'],
  ['CPI OECD y/y', 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/USA+EA20+GBR+JPN+CHE+CAN+AUS+NZL.M.N.CPI.PA._T.N.GY?startPeriod=2026-01&format=csvfilewithlabels'],
  ['BCI OECD', 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,4.1/USA+EA20+GBR+JPN+CHE+CAN+AUS+NZL.M.BCICP...AA...H?startPeriod=2026-01&format=csvfilewithlabels'],
  ['ToT RBA I2 commodity prices', 'https://www.rba.gov.au/statistics/tables/csv/i2-data.csv'],
  ['ToT ANZ NZ commodity index page', 'https://www.anz.co.nz/about-us/economic-markets-research/commodity-price-index/'],
  ['ToT FRED IMF all commodities', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=PALLFNFINDEXM']
];
(async () => {
  for (const [name, url, kind] of PROBES) {
    try {
      const r = await get(url);
      console.log('\n=== ' + name + ' — HTTP ' + r.status + ' ' + r.type + ' ' + r.buf.length + ' bytes');
      if (kind === 'zip' && r.status === 200) {
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
