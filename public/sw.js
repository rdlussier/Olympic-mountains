const CACHE="hdl-app-__CACHE_NAME__",TIL="hdl-tiles-v1",F=__PRECACHE__;
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(F.map(u=>c.add(u).catch(()=>0)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.indexOf("hdl-app-")==0&&n!=CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const q=e.request,u=q.url;if(q.method!="GET")return;
 if(u.indexOf("tile.opentopomap.org")>-1){const key=u.replace(/^https:\/\/[abc]\./,"https://a.");e.respondWith(caches.open(TIL).then(async c=>{const m=await c.match(key);if(m)return m;try{const r=await fetch(key,{mode:"cors"});if(r.ok)c.put(key,r.clone());return r}catch(_){try{return await fetch(q)}catch(_){return Response.error()}}}));return}
 if(u.indexOf(self.registration.scope)==0)e.respondWith(caches.open(CACHE).then(async c=>{const m=await c.match(q,{ignoreSearch:q.mode=="navigate",ignoreVary:true});const net=fetch(q).then(r=>{if(r.ok)c.put(q,r.clone());return r}).catch(()=>null);return m||(await net)||Response.error()}))});
