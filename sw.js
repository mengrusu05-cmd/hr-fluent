// HR Fluent 16.3 — network-first navigation, limited offline cache, no version.json caching.
const CACHE='hr-fluent-v16-3-production-20261124';
const FILES=['./','./index.html','./manifest.webmanifest','./hr-fluent-icon.svg','./apple-touch-icon.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('hr-fluent-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 // A version manifest must always reach the network and never fill caches with timestamped copies.
 if(url.pathname.endsWith('/version.json'))return;
 event.respondWith(fetch(req,{cache:'no-store'}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));}
  return response;
 }).catch(async()=>{
  const cached=await caches.match(req,{ignoreSearch:true});
  if(cached)return cached;
  if(req.mode==='navigate')return (await caches.match('./index.html'))||Response.error();
  return Response.error();
 }));
});
