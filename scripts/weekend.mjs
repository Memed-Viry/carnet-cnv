// Listes de départ liveffn des 8 prochains jours pour les nageurs suivis
import { get, dom, txt, today, readApp, getConst, setConst, saveApp, notify, topicOf, TOPIC_CLUB } from './lib.mjs';
const L = 'https://www.liveffn.com/cgi-bin/';
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
const lines = h => { const d = dom(h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(tr|p|div|td|h\d|li)>/gi, '$&\n')); return (d.body ? d.body.textContent : '').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean); };

let html = readApp();
const DATA = getConst(html, 'DATA'), OLD = getConst(html, 'WEEKEND');
const RK = {}; DATA.sw.forEach(s => RK[norm(s.nom + s.prenom) + s.annee] = s.iuf);
const clubs = ['VIRY', ...new Set(DATA.sw.filter(s => s.ext && s.club).map(s => s.club))];
const CRE = new RegExp(clubs.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
const t0 = new Date(today() + 'T00:00:00'), lim = new Date(t0.getTime() + 8 * 864e5);
const toD = s => { const m = s.match(/(\d\d)\/(\d\d)\/(\d{4})/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : null; };
const iso = d => d.toLocaleDateString('sv-SE');

const LH = await get(L + 'liste_live.php', { gap: 1000 }); if (!LH) { console.log('liveffn inaccessible'); process.exit(1); }
const LD = dom(LH); const comps = {};
for (const a of LD.querySelectorAll('a[href*="competition="]')) {
  const id = a.getAttribute('href').match(/competition=(\d+)/)[1]; if (comps[id]) continue;
  let el = a; for (let i = 0; i < 4 && el && !/\d\d\/\d\d\/\d{4}/.test(el.textContent); i++) el = el.parentElement; if (!el) continue;
  const tx = txt(el); const ds = [...tx.matchAll(/\d\d\/\d\d\/\d{4}/g)].map(m => toD(m[0])); if (!ds.length) continue;
  const d1 = ds[0], d2 = ds[1] || ds[0]; if (d2 < t0 || d1 > lim) continue;
  const m = tx.match(/nageurs (.+?) Bassin de (\d+)m (.+?) (Régional|Départemental|National|International|Interrégional)/);
  comps[id] = { id, t: m ? m[1] : tx.slice(0, 80), b: m ? +m[2] : null, l: m ? m[3] : '', d1: iso(d1), d2: iso(d2) };
}
if (process.env.TEST_COMPS) { for (const k of Object.keys(comps)) delete comps[k]; for (const id of process.env.TEST_COMPS.split(',')) comps[id] = { id, t: 'TEST ' + id, b: 25, l: '', d1: today(), d2: today() }; }
const out = { maj: today(), comps: [], e: {} };
for (const id of Object.keys(comps)) {
  const sh = await get(`${L}startlist.php?competition=${id}&langue=fra&go=detail&action=structure`, { gap: 1000 }); if (!sh) continue;
  const S = dom(sh); const links = [...S.querySelectorAll('a[href*="structure="]')];
  if (!links.some(a => CRE.test(a.textContent) || /structure=354(\D|$)/.test(a.getAttribute('href')))) continue;
  const structs = [...new Set(links.map(a => a.getAttribute('href').match(/structure=(\d+)/)[1]))];
  const entries = [];
  for (const st of structs) {
    const h = await get(`${L}startlist.php?competition=${id}&langue=fra&go=detail&action=structure&structure=${st}`, { gap: 1000 }); if (!h) continue;
    const ln = lines(h); const i0 = ln.findIndex(l => /^Code de la structure/.test(l)); if (i0 < 0) continue; const club = ln[i0 - 1];
    let sw = null, cur = null;
    for (let i = i0 + 1; i < ln.length; i++) { const l = ln[i];
      if (/^Bienvenue$|liveffn.com est une production/.test(l)) break;
      const ms = l.match(/^(.+?) \((\d{4})\) [A-Z]{3}$/); if (ms) { sw = { name: ms[1], year: +ms[2] }; cur = null; continue; }
      if (!sw) continue;
      if (/^(\d+x)?\d+ (Nage Libre|Dos|Brasse|Papillon|4 Nages)/.test(l)) { cur = { name: sw.name, year: sw.year, club, lab: l, relay: /^\d+x/.test(l) }; entries.push(cur); continue; }
      if (!cur) continue; let m2;
      if ((m2 = l.match(/^\[(\d+)e? relay/))) cur.rel = +m2[1];
      else if ((m2 = l.match(/^série (\d+)/i))) cur.serie = +m2[1];
      else if ((m2 = l.match(/^couloir (\d+)/i))) cur.lane = +m2[1];
      else if (/^\d\d:\d\d\.\d\d$|^AT/.test(l) && !cur.et) cur.et = l.startsWith('AT') ? 'sans temps' : l.replace(/^00:/, '');
      else if (/^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) /.test(l)) cur.day = l;
      else if (/^\d{1,2}h\d\d$/.test(l)) cur.h = l;
    }
  }
  const ci = out.comps.length; let any = false;
  for (const e of entries) {
    const nk = e.name.split(' '); let iuf = null;
    for (let k = 1; k < nk.length && !iuf; k++) iuf = RK[norm(nk.slice(0, k).join(' ') + nk.slice(k).join(' ')) + e.year];
    if (!iuf) continue; any = true;
    const heat = e.relay ? entries.filter(x => x.lab === e.lab && x.club === e.club && x.serie === e.serie && x.lane === e.lane).sort((a, b) => (a.rel || 0) - (b.rel || 0)).map(x => [x.rel || 0, x.name, x.year])
      : entries.filter(x => x.lab === e.lab && x.serie === e.serie && !x.relay).sort((a, b) => (a.lane || 0) - (b.lane || 0)).map(x => [x.lane || 0, x.name, x.year, x.club, x.et || '']);
    (out.e[iuf] = out.e[iuf] || []).push({ c: ci, lab: e.lab, relay: e.relay, rel: e.rel || 0, s: e.serie || null, l: e.lane || null, et: e.et || '', day: e.day || '', h: e.h || '', heat });
  }
  if (any) out.comps.push(comps[id]);
}
// notifications : nouvelles engagements par rapport au relevé précédent
const oldKey = new Set(); for (const [iuf, L2] of Object.entries(OLD.e || {})) for (const r of L2) { const c = OLD.comps[r.c]; if (c) oldKey.add(iuf + c.id + r.lab); }
const byName = Object.fromEntries(DATA.sw.map(s => [s.iuf, s]));
const newBy = {};
for (const [iuf, L2] of Object.entries(out.e)) for (const r of L2) { const c = out.comps[r.c]; if (!oldKey.has(iuf + c.id + r.lab)) (newBy[iuf] = newBy[iuf] || []).push(r); }
const same = JSON.stringify({ ...out, maj: '' }) === JSON.stringify({ ...OLD, maj: '' });
console.log('compétitions :', out.comps.map(c => c.t).join(' | ') || 'aucune', '· nageurs :', Object.keys(out.e).length, same ? '(inchangé)' : '');
if (process.env.TEST_COMPS) { console.log(JSON.stringify(out).slice(0, 3000)); process.exit(0); }
if (!same) {
  html = setConst(html, 'WEEKEND', out); saveApp(html);
  for (const [iuf, L2] of Object.entries(newBy)) { const s = byName[iuf]; const c = out.comps[L2[0].c];
    await notify(topicOf(iuf), `Engagé${s.sexe === 'F' ? 'e' : ''} : ${c.t}`, L2.map(r => `${r.lab.replace(/ (Messieurs|Dames|Mixtes?)$/, '')} · ${r.day || c.d1}${r.h ? ' ' + r.h : ''}${r.s ? ` · série ${r.s} couloir ${r.l}` : ''}`).join('\n'), 'calendar'); }
  const n = Object.keys(newBy).length;
  if (n) await notify(TOPIC_CLUB, `Listes de départ publiées`, out.comps.map(c => `${c.t} (${c.l}) : ${Object.entries(out.e).filter(([, L2]) => L2.some(r => out.comps[r.c] === c)).length} nageur(s) du club`).join('\n'), 'calendar');
}
