// Records de France Maîtres par catégorie (extraNat) -> const RF d'index.html
import { get, sec, today, readApp, getConst, setConst, saveApp } from './lib.mjs';
const CATS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 140]; // RFC1 (25-29 ans) ... RFC16
const SW = { 'NL': 'NL', 'Dos': 'D', 'Bra.': 'B', 'Pap.': 'P', '4 N.': '4N' };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export function parse(html) {
  const out = [];
  let sx = null;
  for (const tr of html.replace(/data-tippy-content="[^"]*"/g, '').split(/<tr\b/).slice(1)) {
      const hd = tr.match(/fa-(venus|mars) mr-3"><\/i>\s*(Dames|Messieurs)/); if (hd) { sx = hd[1] === 'venus' ? 'F' : 'M'; continue; }
      if (!sx) continue;
      const lab = tr.match(/whitespace-nowrap">([^<]+)<\/th>/); if (!lab) continue;
      const m = lab[1].trim().match(/^(\d+) (.+)$/); if (!m || !SW[m[2]]) continue;
      const ev = m[1] + SW[m[2]];
      const t0 = tr.match(/font-bold text-gray-900[^>]*>([\s\S]*?)<\/td>/); if (!t0) continue;
      const tm = strip(t0[1]);
      const t = sec(tm); if (!(t > 0)) continue;
      const rest = tr.slice(tr.indexOf(t0[0]) + t0[0].length);
      const cells = [...rest.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => strip(x[1]));
      const name = (cells[0] || '').replace(/\s*\(.*$/, '').trim(), yr = ((cells[0] || '').match(/\((\d{4})\//) || [])[1];
      const d = (cells[2] || '').match(/(\d\d)\/(\d\d)\/(\d{4})/);
      out.push({ sx, ev, t, name, yr: yr ? +yr : null, club: cells[1] || '', date: d ? `${d[3]}-${d[2]}-${d[1]}` : '' });
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = {}; let n = 0, fail = 0;
  for (const pool of [25, 50]) for (let k = 0; k < CATS.length; k++) {
    const html = await get(`https://ffn.extranat.fr/webffn/mtr_records.php?idact=mtr&idbas=${pool}&idzon=&idniv=2&idcat=${CATS[k]}`);
    if (!html) { fail++; continue; }
    for (const x of parse(html)) { r[`${x.sx}|${pool}|${k}|${x.ev}`] = [x.t, x.name, x.club, x.date]; n++; }
    console.log(pool, 'C' + (k + 1), n);
  }
  if (n < 500 || fail > 4) { console.log('trop peu de records, rien publié', n, fail); process.exit(0); }
  let app = readApp(); const old = getConst(app, 'RF');
  if (JSON.stringify(old.r) === JSON.stringify(r)) { console.log('inchangé'); process.exit(0); }
  app = setConst(app, 'RF', { maj: today(), r }); saveApp(app); console.log('RF publié', n);
}
