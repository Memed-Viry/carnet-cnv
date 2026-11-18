// Outils communs aux tâches automatiques (GitHub Actions) du Carnet du Club
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
export const ROOT = new URL('..', import.meta.url).pathname;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (compatible; CarnetCNV/1.0; club de natation CN Viry-Chatillon)';
let last = 0;
// Requête polie : au moins `gap` ms entre deux appels, reprise sur 403/erreur
export async function get(url, { gap = 2500, tries = 6 } = {}) {
  for (let k = 0; k < tries; k++) {
    const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr' } });
      if (r.status === 403 || r.status === 429) { console.log('pause', r.status, url); await sleep(120000); continue; }
      if (r.ok) return await r.text();
      console.log('HTTP', r.status, url);
    } catch (e) { console.log('err', e.message, url); }
    await sleep(5000);
  }
  return null;
}
export const dom = html => parseHTML(html).document;
export const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
export const sec = t => { if (!t) return NaN; const p = String(t).trim().split(':').map(Number); return Math.round(p.reduce((a, v) => a * 60 + v, 0) * 100) / 100; };
export const fmt = s => { const m = Math.floor(s / 60), r = (s - m * 60).toFixed(2).padStart(5, '0'); return m ? `${m}:${r}` : (+r).toFixed(2); };
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

// Lecture / écriture des déclarations `const X = ...;` (une ligne) d'index.html
export function readApp() { return fs.readFileSync(ROOT + 'index.html', 'utf8'); }
export function getConst(html, name) {
  const m = html.match(new RegExp(`^const ${name} = (.*)$`, 'm'));
  if (!m) throw new Error('déclaration introuvable : ' + name);
  return JSON.parse(m[1].trim().replace(/;$/, ''));
}
export function setConst(html, name, val) {
  const re = new RegExp(`^const ${name} = .*$`, 'm');
  if (!re.test(html)) throw new Error('déclaration introuvable : ' + name);
  return html.replace(re, () => `const ${name} = ${JSON.stringify(val)};`);
}
export function saveApp(html) {
  const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  html = html.replace(/const BUILD = '[^']*';/, `const BUILD = '${v}';`);
  fs.writeFileSync(ROOT + 'index.html', html);
  const swp = ROOT + 'sw.js'; let sw = fs.readFileSync(swp, 'utf8');
  sw = sw.replace(/carnet-[0-9a-z-]+/g, 'carnet-' + v).replace(/Version [0-9a-z-]+/g, 'Version ' + v);
  fs.writeFileSync(swp, sw);
}

// Catégories, grilles, qualifications (mêmes règles que l'appli)
export function catOf(annee, Y) { const age = Y - annee; if (!annee || age < 25) return null; const k = Math.floor((age - 25) / 5); return { k, grid: Math.min(k, 13), label: 'C' + (k + 1) }; }
export function qualLevels(sw, G, Y) {
  const cat = catOf(sw.annee, Y); const out = {}; if (!cat) return out;
  const ok = p => { const y = +p[3].slice(0, 4); if (!(y >= Y - 3 && y <= Y)) return false; if (p[7]) return true; const c = catOf(sw.annee, y); return c && c.k === 0; };
  const grid = (lv, pool, ev) => { const g = G[`${lv}_${pool}_${sw.sexe}`]; return g && g[ev] ? g[ev][cat.grid] : null; };
  const evs = [...new Set(sw.p.map(p => p[1]))];
  for (const ev of evs) {
    const ps = sw.p.filter(p => p[1] === ev && ok(p)); if (!ps.length) continue;
    let n1 = false, n2 = false;
    for (const pool of [25, 50]) { const c = ps.filter(p => +p[0] === pool); if (!c.length) continue; const b = Math.min(...c.map(p => p[2]));
      const t1 = grid('N1', pool, ev); if (t1 != null && b <= t1) n1 = true; const t2 = grid('N2', pool, ev); if (t2 != null && b <= t2) n2 = true; }
    const b = Math.min(...ps.map(p => p[2])); const t2h = grid('N2', 25, ev); if (t2h != null && b <= t2h) n2 = true;
    if (n1 || n2) out[ev] = n1 ? 'N1' : 'N2';
  }
  return out;
}
export const EVL = { '50NL': '50 NL', '100NL': '100 NL', '200NL': '200 NL', '400NL': '400 NL', '800NL': '800 NL', '1500NL': '1500 NL', '50D': '50 dos', '100D': '100 dos', '200D': '200 dos', '50B': '50 brasse', '100B': '100 brasse', '200B': '200 brasse', '50P': '50 pap.', '100P': '100 pap.', '200P': '200 pap.', '1004N': '100 4 nages', '2004N': '200 4 nages', '4004N': '400 4 nages' };
