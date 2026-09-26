const CACHE='personal-accounting-v2';
const FILES=['./','./index.html','./styles.css','./app.js','./ui.js','./auth.js','./db.js','./accounting.js','./utils.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('personal-accounting-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin || !FILES.some(path=>new URL(path,self.registration.scope).href===url.href))return;
  event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request)));
});
