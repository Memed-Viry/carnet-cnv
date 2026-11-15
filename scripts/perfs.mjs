// Mise à jour quotidienne des performances extraNat, records du club et notifications
import { get, dom, txt, sec, fmt, today, readApp, getConst, setConst, saveApp, catOf, qualLevels, EVL } from './lib.mjs';
const X = 'https://ffn.extranat.fr/webffn/';
const EXTRA = { '2087923': ['180485'] };          // comptes extraNat en double
const code = s => { s = s.toLowerCase().replace(/[.\s]/g, ''); return s.startsWith('nl') || s.startsWith('nagelibre') ? 'NL' : s.startsWith('dos') ? 'D' : s.startsWith('bra') ? 'B' : s.startsWith('pap') ? 'P' : '4N'; };

async function perfsOfIuf(iuf) {
  const rows = [];
  for (const pool of [25, 50]) {
    const h = await get(`${X}nat_recherche.php?idact=nat&idrch_id=${iuf}&idopt=prf&idbas=${pool}`); if (!h) return null;
    const d = dom(h);
    for (const tr of d.querySelectorAll('tr')) {
      const th = tr.querySelector('th[scope=row]'); const tds = [...tr.children].filter(e => e.tagName === 'TD');
      if (!th || tds.length < 8) continue;
      const m = txt(th).match(/^(\d+)\s+(.+)$/); if (!m) continue;
      const ev = m[1] + code(m[2]); if (!EVL[ev]) continue;
      const t = sec(txt(tds[0])); const dt = txt(tds[4]).split('/'); if (!(t > 0) || dt.length !== 3) continue;
      let lap = 0, sp = [];
      const tip = tds[0].querySelector('[data-tippy-content]');
      if (tip) { const s = dom('<div>' + tip.getAttribute('data-tippy-content') + '</div>');
        const L = [...s.querySelectorAll('tr')].map(r => [...r.querySelectorAll('td')].map(txt)).filter(c => c.length > 1).map(c => [parseInt(c[0]), sec(c[1])]);
        if (L.length > 1 && Math.abs(L[L.length - 1][1] - t) < 0.005) { lap = L[1][0] - L[0][0]; sp = L.slice(0, -1).map(x => x[1]); } }
      const city = txt(tds[3].querySelector('p') || tds[3]);
      const lk = tr.querySelector('a[href*="idcpt="]'); const cpt = lk ? (lk.getAttribute('href').match(/idcpt=(\d+)/) || [])[1] || '' : '';
      rows.push({ p: [pool, ev, t, `${dt[2]}-${dt[1]}-${dt[0]}`, parseInt(txt(tds[2])) || 0, txt(tds[5]).replace(/[\[\]]/g, ''), city, /mtr/i.test(txt(tds[8] || null)) ? 1 : 0, lap, sp, cpt], club: txt(tds[7]) });
    }
  }
  return rows;
}

let html = readApp();
const DATA = getConst(html, 'DATA'), G = getConst(html, 'G'), Y = getConst(html, 'REF_YEAR');
let REC; try { REC = getConst(html, 'CLUB_REC'); } catch (e) { REC = null; }
const key = p => [p[1], p[0], p[2], p[3]].join('|');
const msgs = []; let added = 0, failed = 0, touched = 0;
let COMPS; try { COMPS = getConst(html, 'COMPS') || {}; } catch (e) { COMPS = null; }

for (const sw of DATA.sw.slice(0, +process.env.LIMIT || undefined)) {
  if (!/^\d+$/.test(sw.iuf)) {   // nageur sans fiche extraNat : on la cherche par le nom
    const r = await get(`${X}_recherche.php?go=ind&idrch=${encodeURIComponent(sw.nom)}`);
    try { const L = JSON.parse(r || '[]').filter(x => x.iuf && x.ind && new RegExp(`\\(${sw.annee}\\)`).test(x.ind) && x.ind.toUpperCase().includes(sw.prenom.toUpperCase().split(' ')[0]));
      if (L.length === 1) { console.log('fiche trouvée', sw.nom, L[0].iuf); sw.iuf = L[0].iuf; } else continue; } catch (e) { continue; }
  }
  const before = qualLevels(sw, G, Y);
  const have = new Set(sw.p.map(key)); const fresh = [];
  for (const iuf of [sw.iuf, ...(EXTRA[sw.iuf] || [])]) {
    const rows = await perfsOfIuf(iuf); if (!rows) { failed++; continue; }
    if (process.env.DRY) console.log(sw.nom, iuf, 'lignes extraNat', rows.length, 'dont passages', rows.filter(r => r.p[9].length).length, JSON.stringify(rows[0] && rows[0].p));
    for (const r of rows) {
      const k = key(r.p);
      if (have.has(k)) { const ex = sw.p.find(p => key(p) === k); if (ex && r.p[10] && ex[10] !== r.p[10]) { ex[10] = r.p[10]; touched++; } continue; }
      const y = +r.p[3].slice(0, 4);
      if (y < 2016) {             // avant 2016 : seulement si meilleur que tout ce qu'on a
        const bs = sw.p.filter(p => p[1] === r.p[1] && +p[0] === +r.p[0]).map(p => p[2]);
        if (bs.length && Math.min(...bs) <= r.p[2]) continue;
      }
      have.add(k); fresh.push(r);
    }
  }
  if (!fresh.length) continue;
  const name = `${sw.prenom} ${sw.nom}`;
  for (const r of fresh.sort((a, b) => a.p[3] < b.p[3] ? -1 : 1)) {
    const p = r.p; const prev = sw.p.filter(x => x[1] === p[1] && +x[0] === +p[0]).map(x => x[2]);
    const isPb = prev.length && p[2] < Math.min(...prev);
    sw.p.unshift(p); added++;
    const recent = (Date.now() - new Date(p[3]).getTime()) < 21 * 864e5;
    // record du club Maîtres
    if (REC && /VIRY/i.test(r.club)) {
      const c = catOf(sw.annee, +p[3].slice(0, 4));
      if (c) {
        const cur = REC.r.filter(x => x[0] === sw.sexe && x[1] === +p[0] && x[2] === p[1]);
        const inCat = cur.find(x => x[3] === c.label); const all = cur.length ? Math.min(...cur.map(x => x[4])) : Infinity;
        const city = p[6].toLowerCase().replace(/(^|[\s\-'])\S/g, s => s.toUpperCase());
        if (!inCat || p[2] < inCat[4]) {
          const row = [sw.sexe, +p[0], p[1], c.label, p[2], sw.iuf, p[3], city];
          if (inCat) REC.r[REC.r.indexOf(inCat)] = row; else REC.r.push(row);
          REC.sw[sw.iuf] = [`${sw.nom} ${sw.prenom}`, sw.annee];
        }
      }
    }
  }
  sw.p.sort((a, b) => a[3] < b[3] ? 1 : -1);
  const after = qualLevels(sw, G, Y);
  console.log(name, '+', fresh.length);
}

let titled = 0;
if (COMPS) {
  const need = new Map(); for (const sw of DATA.sw) for (const p of sw.p) if (p[10] && !(p[10] in COMPS) && (!need.has(p[10]) || need.get(p[10]) < p[3])) need.set(p[10], p[3]);
  const todo = [...need.entries()].sort((a, b) => a[1] < b[1] ? 1 : -1).slice(0, +process.env.MAX_TITLES || 300);
  for (const [id] of todo) {
    const h = await get(`${X}resultats.php?idact=nat&idcpt=${id}`); if (!h) continue;
    const t = txt(dom(h).body); const m = t.match(/Titre original : (.+?) Type de compétition/) || t.match(/Les Résultats .*?([^.]{5,120}?) \(FRA\)/);
    COMPS[id] = m ? m[1].trim() : ''; titled++;
  }
  console.log('titres de compétitions ajoutés :', titled, '· restants :', need.size - titled);
}
console.log('nouvelles performances :', added, '· idcpt complétés :', touched, '· échecs :', failed);
if (failed > (+process.env.LIMIT || DATA.sw.length) / 2) { console.log('extraNat inaccessible : rien n’est publié'); process.exit(1); }
if (process.env.DRY) process.exit(0);
if (added || touched || titled) {
  if (added) DATA.maj = today(); html = setConst(html, 'DATA', DATA);
  if (COMPS && titled) html = setConst(html, 'COMPS', COMPS);
  if (REC) { REC.maj = today(); html = setConst(html, 'CLUB_REC', REC); }
  saveApp(html);
}
