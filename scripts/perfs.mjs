// Mise à jour quotidienne des performances extraNat, records du club et notifications
import { get, dom, txt, sec, fmt, today, readApp, getConst, setConst, saveApp, catOf, qualLevels, EVL, notify, TOPIC_CLUB, topicOf } from './lib.mjs';
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
      rows.push({ p: [pool, ev, t, `${dt[2]}-${dt[1]}-${dt[0]}`, parseInt(txt(tds[2])) || 0, txt(tds[5]).replace(/[\[\]]/g, ''), city, /mtr/i.test(txt(tds[8] || null)) ? 1 : 0, lap, sp], club: txt(tds[7]) });
    }
  }
  return rows;
}

let html = readApp();
const DATA = getConst(html, 'DATA'), G = getConst(html, 'G'), Y = getConst(html, 'REF_YEAR');
let REC; try { REC = getConst(html, 'CLUB_REC'); } catch (e) { REC = null; }
const key = p => [p[1], p[0], p[2], p[3]].join('|');
const msgs = []; let added = 0, failed = 0;

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
    for (const r of rows) {
      const k = key(r.p); if (have.has(k)) continue;
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
    if (isPb && recent) msgs.push([topicOf(sw.iuf), `Record perso ! ${EVL[p[1]]} ${p[0]} m`, `${name} : ${fmt(p[2])} (ancien ${fmt(Math.min(...prev))}, −${(Math.min(...prev) - p[2]).toFixed(2)} s) · ${p[6]}`, 'trophy']);
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
          if (recent) { const abs = p[2] < all; const t = `${abs ? 'Record du club' : 'Record du club ' + c.label} : ${EVL[p[1]]} ${p[0]} m`;
            const m = `${name} : ${fmt(p[2])}${inCat ? ` (ancien ${fmt(inCat[4])})` : ''}`;
            msgs.push([TOPIC_CLUB, t, m, 'trophy,tada']); msgs.push([topicOf(sw.iuf), t, m, 'trophy,tada']); }
        }
      }
    }
  }
  sw.p.sort((a, b) => a[3] < b[3] ? 1 : -1);
  const after = qualLevels(sw, G, Y);
  for (const [ev, lv] of Object.entries(after)) if (before[ev] !== lv && !(before[ev] === 'N1')) {
    const t = `Qualifié${sw.sexe === 'F' ? 'e' : ''} ${lv} ${Y} : ${EVL[ev]}`;
    msgs.push([topicOf(sw.iuf), t, `${name} décroche une qualification ${lv} aux France ${Y} sur le ${EVL[ev]}.`, 'medal']);
    msgs.push([TOPIC_CLUB, t, `${name} décroche une qualification ${lv} sur le ${EVL[ev]}.`, 'medal']);
  }
  console.log(name, '+', fresh.length);
}

console.log('nouvelles performances :', added, '· échecs :', failed);
if (failed > (+process.env.LIMIT || DATA.sw.length) / 2) { console.log('extraNat inaccessible : rien n’est publié'); process.exit(1); }
if (process.env.DRY) { msgs.forEach(m => console.log('[notif]', m.join(' | '))); process.exit(0); }
if (added) {
  DATA.maj = today(); html = setConst(html, 'DATA', DATA);
  if (REC) { REC.maj = today(); html = setConst(html, 'CLUB_REC', REC); }
  saveApp(html);
  // résumé club si plusieurs records perso
  const pbs = msgs.filter(m => m[1].startsWith('Record perso'));
  if (pbs.length) msgs.push([TOPIC_CLUB, `${pbs.length} record${pbs.length > 1 ? 's' : ''} perso dans le club`, pbs.slice(0, 8).map(m => m[2].split(' · ')[0].replace(':', ' –') + ' ' + m[1].replace('Record perso ! ', '(') + ')').join('\n'), 'swimmer']);
  for (const m of msgs) await notify(...m);
}
