// Résultats en direct (liveffn) les jours de compétition des nageurs suivis
import { get, dom, txt, sec, fmt, today, readApp, getConst, setConst, saveApp, notify, topicOf, TOPIC_CLUB, EVL } from './lib.mjs';
const L = 'https://www.liveffn.com/cgi-bin/';
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
const LAB2EV = l => { const m = l.match(/^(\d+) (Nage Libre|Dos|Brasse|Papillon|4 Nages)/); return m ? m[1] + ({ 'Nage Libre': 'NL', 'Dos': 'D', 'Brasse': 'B', 'Papillon': 'P', '4 Nages': '4N' })[m[2]] : null; };

let html = readApp();
const DATA = getConst(html, 'DATA'), WK = getConst(html, 'WEEKEND');
let LIVE; try { LIVE = getConst(html, 'LIVE'); } catch (e) { LIVE = { maj: '', comps: [], r: {} }; }
const d = today();
const ids = process.env.TEST_COMPS ? process.env.TEST_COMPS.split(',') : (WK.comps || []).filter(c => c.d1 <= d && c.d2 >= d).map(c => c.id);
if (!ids.length) { console.log('aucune compétition des nageurs suivis aujourd’hui'); process.exit(0); }
const RK = {}; DATA.sw.forEach(s => RK[norm(s.nom + s.prenom) + s.annee] = s);
const clubs = ['VIRY', ...new Set(DATA.sw.filter(s => s.ext && s.club).map(s => s.club))];
const best = (s, ev, pool) => { const L2 = s.p.filter(p => p[1] === ev && +p[0] === +pool).map(p => p[2]); return L2.length ? Math.min(...L2) : null; };

const keep = LIVE.comps && LIVE.comps.length && LIVE.comps.every(c => ids.includes(c.id)) ? LIVE : { maj: '', comps: [], r: {} };
const out = { maj: new Date().toISOString(), comps: [], r: {} };
const seen = new Set(); for (const [iuf, L2] of Object.entries(keep.r || {})) for (const x of L2) seen.add(iuf + '|' + x.c + '|' + x.lab + '|' + x.t);
const notes = [];
for (const id of ids) {
  const wc = (WK.comps || []).find(c => c.id === id) || { id, t: 'Compétition ' + id, b: 25 };
  const root = await get(`${L}resultats.php?competition=${id}&langue=fra&go=detail&action=structure`, { gap: 1000 }); if (!root) continue;
  const R = dom(root);
  const sts = [...new Set([...R.querySelectorAll('a[href*="structure="]')].filter(a => clubs.some(c => txt(a).toUpperCase().includes(c.toUpperCase())) || /structure=354(\D|$)/.test(a.getAttribute('href'))).map(a => a.getAttribute('href').match(/structure=(\d+)/)[1]))];
  const ci = out.comps.length; out.comps.push({ id, t: wc.t, l: wc.l || '', b: wc.b || 25 });
  for (const st of sts) {
    const h = await get(`${L}resultats.php?competition=${id}&langue=fra&go=detail&action=structure&structure=${st}`, { gap: 1000 }); if (!h) continue;
    const D = dom(h); let sw = null;
    for (const tr of D.querySelectorAll('tr')) {
      const ind = tr.querySelector('.resStructureIndividu2');
      if (ind) { const m = txt(ind).match(/^(.+?) \((\d{4})\)/); sw = null;
        if (m) { const nk = m[1].split(' '); for (let k = 1; k < nk.length && !sw; k++) sw = RK[norm(nk.slice(0, k).join(' ') + nk.slice(k).join(' ')) + m[2]] || null; } continue; }
      if (!sw || !tr.classList.contains('survol')) continue;
      const tds = [...tr.children]; const a = tds[1] && tds[1].querySelector('a'); if (!a) continue;
      const lab = txt(a); const relay = /^\d+x/.test(lab); const tcell = tr.querySelector('td.temps'); if (!tcell) continue;
      const tA = tcell.querySelector('a') || tcell; const tStr = (tA.childNodes[0] ? tA.childNodes[0].textContent : txt(tcell)).trim();
      const t = sec(tStr); const place = txt(tr.querySelector('.resStructureDetailPlace'));
      const sp = [...tcell.querySelectorAll('td.split')].map(x => sec(txt(x)));
      const pts = parseInt(txt(tr.querySelector('.points'))) || 0;
      const rec = { c: ci, lab, relay, place, t: t > 0 ? t : null, raw: tStr, pts, sp: sp.length > 1 ? sp.slice(0, -1) : [] };
      (out.r[sw.iuf] = out.r[sw.iuf] || []).push(rec);
      const k = sw.iuf + '|' + ci + '|' + lab + '|' + rec.t;
      if (!seen.has(k) && rec.t && !relay) {
        const ev = LAB2EV(lab), pb = ev ? best(sw, ev, wc.b || 25) : null;
        const tag = pb == null ? 'première course' : rec.t < pb ? `RECORD PERSO (−${(pb - rec.t).toFixed(2)} s)` : `record perso ${fmt(pb)}`;
        notes.push([topicOf(sw.iuf), `${lab.replace(/ (Messieurs|Dames|Mixtes?)/, '')} : ${fmt(rec.t)}`, `${sw.prenom} ${sw.nom} · ${place} · ${tag}${pts ? ' · ' + pts + ' pts' : ''}\n${wc.t}`, rec.t < (pb || 0) ? 'trophy' : 'stopwatch']);
        notes.push([TOPIC_CLUB, `${sw.prenom} ${sw.nom} : ${lab.replace(/ (Messieurs|Dames|Mixtes?)/, '')} ${fmt(rec.t)}`, `${place} · ${tag} · ${wc.t}`, rec.t < (pb || 0) ? 'trophy' : 'stopwatch']);
      }
    }
  }
}
const n = Object.values(out.r).reduce((a, L2) => a + L2.length, 0);
console.log('résultats :', n, '· nouveaux :', notes.length / 2);
if (process.env.TEST_COMPS) { console.log(JSON.stringify(out).slice(0, 3000)); notes.slice(0, 6).forEach(x => console.log('[notif]', x.join(' | '))); process.exit(0); }
if (JSON.stringify({ ...out, maj: '' }) !== JSON.stringify({ ...keep, maj: '' })) {
  html = setConst(html, 'LIVE', out); saveApp(html);
  for (const x of notes) await notify(...x);
}
