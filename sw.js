/* sw.js (v21.6 INLINE) - unregister */
self.addEventListener("install", ()=> self.skipWaiting());
self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{
  try{ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }catch(e){}
  try{ await self.registration.unregister(); }catch(e){}
  try{ await self.clients.claim(); }catch(e){}
})());});
