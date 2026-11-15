// Veille calendrier : meetings labellisés et résultats Maîtres (extraNat), agendas IDF (BB Natation, Paris Aquatique)
import { get, dom, txt, today, readApp, getConst, setConst, saveApp } from './lib.mjs';
const X = 'https://ffn.extranat.fr/webffn/';
const MOIS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
const N = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cityKey = s => { const w = N(String(s || '').split(/[,(]/)[0]).replace(/^st /, 'saint ').split(' '); return (/^(saint|sainte|le|la|les|l)$/.test(w[0]) ? w.slice(0, 2) : w.slice(0, 1)).join(' '); };
const tc = s => String(s || '').toLowerCase().replace(/(^|[\s\-'])\S/g, c => c.toUpperCase());
const lines = h => { const d = dom(h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(tr|p|div|td|th|h\d|li|span|a)>/gi, '$&\n')); return (d.body ? d.body.textContent : '').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean); };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const decode = s => String(s || '').replace(/&rsquo;|&#8217;|&#039;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

let html = readApp();
const CAL = getConst(html, 'CAL'), RES = getConst(html, 'CAL_RES');
const t0 = today(), lim7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const log = [];
const sameEv = (a, d, city) => a.d === d && cityKey(a.l) && cityKey(a.l) === cityKey(city);

// 1. Meetings labellisés Maîtres (extraNat)
const mh = await get(X + 'meetings.php?idact=mtr');
const meets = [];
if (mh) {
  const L = lines(mh); const i0 = L.findIndex(l => /à venir/.test(l)); const i1 = L.findIndex((l, i) => i > i0 && /Pour consulter/.test(l));
  const part = L.slice(i0, i1 > 0 ? i1 : undefined);
  for (let i = 0; i < part.length; i++) {
    const m = part[i].match(/^(?:Le \S+ (\d+) (\S+) (\d{4})|Du \S+ (\d+)(?: (\S+))?(?: (\d{4}))? au \S+ (\d+) (\S+) (\d{4}))$/i); if (!m) continue;
    let d1, d2 = null;
    if (m[1]) d1 = iso(m[3], MOIS[m[2].toLowerCase()], m[1]);
    else { const y2 = m[9], mo2 = MOIS[m[8].toLowerCase()]; d1 = iso(m[6] || y2, m[5] ? MOIS[m[5].toLowerCase()] : mo2, m[4]); d2 = iso(y2, mo2, m[7]); }
    const city = tc(part[i + 1] || ''), t = part[i + 2] || '', b = (part[i + 3] || '').match(/(25|50)m/);
    if (t) meets.push({ d: d1, d2, l: city, t, b: b ? +b[1] : null });
  }
}
for (const m of meets) {
  if (CAL.some(e => sameEv(e, m.d, m.l))) continue;
  const nul = CAL.find(e => !e.d && cityKey(e.l) === cityKey(m.l) && e.k === 'meet');
  if (nul) { Object.assign(nul, { d: m.d, ...(m.d2 ? { d2: m.d2 } : {}), t: m.t, b: m.b, n: 'Meeting national labellisé FFN.' }); log.push('date publiée : ' + m.t); continue; }
  CAL.push({ d: m.d, ...(m.d2 ? { d2: m.d2 } : {}), k: 'meet', t: m.t, l: m.l, b: m.b, n: 'Meeting national labellisé FFN.' }); log.push('meeting ajouté : ' + m.t + ' (' + m.l + ')');
}

// 2. Agendas IDF
const ag = [];
const bb = [await get('https://bbnatation.fr/agenda/liste/', { gap: 1500 }), await get('https://bbnatation.fr/agenda/liste/page/2/', { gap: 1500 })];
for (const h of bb) { if (!h) continue;
  for (const m of h.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)) { let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
    if (!Array.isArray(j)) continue;
    for (const e of j) { if (e['@type'] !== 'Event') continue; const name = decode(e.name), desc = decode(e.description);
      if (!/ma[iî]tre/i.test(name + ' ' + desc)) continue;
      const loc = e.location || {}; const city = (loc.address && loc.address.addressLocality) || loc.name || '';
      ag.push({ src: 'BB Natation', t: name, d: e.startDate.slice(0, 10), d2: e.endDate && e.endDate.slice(0, 10) !== e.startDate.slice(0, 10) ? e.endDate.slice(0, 10) : null, l: [tc(city), loc.address && loc.address.streetAddress && !N(loc.address.streetAddress).includes(N(city)) ? tc(loc.address.streetAddress) : ''].filter(Boolean).join(', ') }); } } }
const pa = await get('https://www.parisaquatique.fr/events', { gap: 1500 });
if (pa) { const D = dom(pa);
  for (const tr of D.querySelectorAll('tr')) { const g = c => txt(tr.querySelector('.views-field-' + c));
    const t = g('title'), s1 = g('start-date'), s2 = g('end-date'), city = g('city'); if (!/ma[iî]tre/i.test(t)) continue;
    const p = x => { const m = x.match(/(\d\d)\/(\d\d)\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
    const d = p(s1); if (!d) continue; const d2 = p(s2);
    ag.push({ src: 'Paris Aquatique', t: t.replace(/\s*\((FFN|WORLD AQUATICS MASTERS)\)\s*/i, ' ').trim(), d, d2: d2 && d2 !== d ? d2 : null, l: tc(city) }); } }
for (const a of ag) {
  if (a.d < t0) continue;
  const near = e => e.d && Math.abs(new Date(e.d) - new Date(a.d)) <= 3 * 864e5;
  const words = t => N(t).split(' ').filter(w => w.length > 3 && !/^(championnats?|maitres?|open|meeting|des|les)$/.test(w));
  const ex = CAL.find(e => (e.d === a.d && sameEv(e, a.d, a.l)) || (near(e) && (cityKey(e.l) === cityKey(a.l) || words(e.t).filter(w => words(a.t).includes(w)).length >= 2 || (e.k === 'nat' && /france/i.test(a.t) && ((/n1/.test(N(e.t)) && /n1/.test(N(a.t))) || (/n2/.test(N(e.t)) && /n2/.test(N(a.t))) || (/relais/.test(N(e.t)) && /relais/.test(N(a.t))))))));
  const undef = x => /a definir|a paraitre|date et lieu/.test(N(x));
  if (ex) { if (undef(ex.l) && a.l && !undef(a.l)) { log.push(`lieu précisé : ${ex.t} → ${a.l} (${a.src})`); ex.l = a.l; } continue; }
  const k = /france/i.test(a.t) ? 'nat' : /monde|world|europe|international/i.test(a.t) ? 'int' : meets.some(m => m.d === a.d && cityKey(m.l) === cityKey(a.l)) ? 'meet' : 'idf';
  CAL.push({ d: a.d, ...(a.d2 ? { d2: a.d2 } : {}), k, t: a.t, l: a.l, b: null, n: `Source : ${a.src}.` }); log.push(`ajouté : ${a.t} · ${a.d} · ${a.l} (${a.src})`);
}

// 3. Résultats Maîtres publiés (extraNat)
const seen = new Set(RES.map(r => r.id));
const pages = ['competitions.php?idact=mtr'];
const rh = await get(X + pages[0]);
if (rh) { const sai = (rh.match(/idsai=(\d{4})/g) || []).map(x => +x.slice(6)); const cur = new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  pages.push(`competitions.php?idact=mtr&idsai=${cur}&idreg=1592`); }
const SEASON0 = `${new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1}-09-01`;
const done = new Set();
for (let i = 0; i < pages.length; i++) { const u = pages[i]; if (done.has(u)) continue; done.add(u);
  const h = i === 0 && rh ? rh : await get(X + u); if (!h) continue; const idf = /idreg=1592/.test(u);
  for (const m of h.matchAll(/competitions\.php\?idact=mtr&(?:amp;)?idsai=\d+&(?:amp;)?idreg=1592&(?:amp;)?iddep=&(?:amp;)?idmth=\d+/g)) if (idf) pages.push(m[0].replace(/&amp;/g, '&'));
  const D = dom(h);
  for (const a of D.querySelectorAll('a[href*="resultats.php?idact=mtr&idcpt="]')) {
    const id = a.getAttribute('href').match(/idcpt=(\d+)/)[1]; if (seen.has(id)) continue;
    let el = a; for (let k = 0; k < 8 && el && !/Type de compétition/.test(el.textContent); k++) el = el.parentElement; if (!el) continue;
    const tx = txt(el);
    const m = tx.match(/^\S+ (\d\d)\/(\d\d)(?:\/(\d\d))?(?: - \S+ (\d\d)\/(\d\d)\/(\d\d))? .*?(International|National|Interrégional|Régional|Départemental) \S+ (.+?) - ([^-]+?) \((\w+)\) Titre original : (.+?) Type de compétition/);
    if (!m) continue; const y = '20' + (m[3] || m[6]); if (`${y}-${m[2]}-${m[1]}` < SEASON0) continue;
    const t = m[8].replace(/ - ([A-ZÀ-Ü' -]+)$/, (x, r) => ' - ' + tc(r));
    RES.push({ id, d: `${y}-${m[2]}-${m[1]}`, d2: m[4] ? `20${m[6]}-${m[5]}-${m[4]}` : null, niv: m[7], t, l: tc(m[9].trim()), orig: m[11], reg: idf || /ILE-DE-FRANCE|ESSONNE|PARIS|YVELINES|HAUTS-DE-SEINE|SEINE-SAINT-DENIS|VAL-DE-MARNE|VAL-D'OISE|SEINE-ET-MARNE/i.test(m[8]) ? 'IDF' : '' });
    seen.add(id); log.push(`résultats publiés : ${m[11]} (${tc(m[9].trim())})`);
  } }

// 4. Ménage : compétitions terminées depuis plus de 7 jours
const before = CAL.length; const keep = CAL.filter(e => !e.d || (e.d2 || e.d) >= lim7); if (keep.length < before) log.push(`${before - keep.length} compétition(s) terminée(s) retirée(s)`);
keep.sort((a, b) => (a.d || '9999') < (b.d || '9999') ? -1 : (a.d || '9999') > (b.d || '9999') ? 1 : 0);

console.log(log.length ? log.join('\n') : 'rien de nouveau');
console.log('meetings lus :', meets.length, '· agendas lus :', ag.length);
if (process.env.DRY) process.exit(0);
const nh = setConst(setConst(html, 'CAL', keep), 'CAL_RES', RES);
if (nh !== html) saveApp(nh);
