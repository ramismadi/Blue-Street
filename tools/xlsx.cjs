/* Blue Street — read one sheet of an .xlsx file (Claude's tools).
   No packages: it uses the `unzip` command, which GitHub's runners have.
   Used for the Bank of England's yield-curve files. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/* Rows of { column letter: value } from the named sheet. */
function sheet(file, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-xlsx-'));
  try {
    execFileSync('unzip', ['-q', '-o', file, 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/worksheets/*', '-d', dir], { maxBuffer: 1 << 30 });
    const wb = fs.readFileSync(path.join(dir, 'xl/workbook.xml'), 'utf8');
    const rels = fs.readFileSync(path.join(dir, 'xl/_rels/workbook.xml.rels'), 'utf8');
    const sh = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].find(m => m[1].trim() === name);
    if (!sh) throw new Error('no sheet "' + name + '" in ' + path.basename(file));
    const rel = [...rels.matchAll(/<Relationship [^>]*>/g)].map(m => m[0]).find(r => r.includes('Id="' + sh[2] + '"'));
    const target = rel.match(/Target="([^"]*)"/)[1].replace(/^\/?xl\//, '');
    let sst = [];
    try { sst = [...fs.readFileSync(path.join(dir, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, '')); } catch (e) { /* no text cells */ }
    const xml = fs.readFileSync(path.join(dir, 'xl', target), 'utf8');
    const out = [];
    for (const r of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = {};
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = c[3] && (c[3].match(/<v>([^<]*)<\/v>/) || [])[1];
        if (v != null) cells[c[1]] = /t="s"/.test(c[2]) ? sst[+v] : v;
      }
      out.push(cells);
    }
    return out;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const excelDate = n => new Date(Date.UTC(1899, 11, 30) + Math.round(+n) * 864e5).toISOString().slice(0, 10);

/* Bank of England nominal spot curve ("4. spot curve"): [[YYYY-MM-DD, 2-year %], ...]. */
function boe2y(file) {
  const r = sheet(file, '4. spot curve');
  const head = r.find(x => /years/i.test(String(x.A || '')));
  if (!head) throw new Error('no maturity row in ' + path.basename(file));
  const col = Object.keys(head).find(k => k !== 'A' && Math.abs(+head[k] - 2) < 1e-6);
  if (!col) throw new Error('no 2-year column in ' + path.basename(file));
  return r.filter(x => /^\d{5}(\.\d+)?$/.test(String(x.A || '')) && isFinite(parseFloat(x[col])))
    .map(x => [excelDate(x.A), parseFloat(x[col])]);
}

/* Extract named members of a .zip to a temporary folder; returns their paths. */
function unzipTo(zipFile, members) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-zip-'));
  execFileSync('unzip', ['-q', '-o', zipFile].concat(members, ['-d', dir]));
  return members.map(m => path.join(dir, m));
}

module.exports = { sheet, boe2y, unzipTo, excelDate };
