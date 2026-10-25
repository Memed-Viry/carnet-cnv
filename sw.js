// Carnet du Club : fonctionnement hors connexion. Version 202610251236
const C='carnet-202610251236';
const CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon-32.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(r.mode==='navigate'||u.pathname.endsWith('index.html')){ // réseau d'abord : les mises à jour arrivent dès qu'il y a du réseau
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put('index.html',cp));return res}).catch(()=>caches.match('index.html')));return}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok&&(u.origin===location.origin||u.host.includes('gstatic')||u.host.includes('googleapis'))){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})));
});
