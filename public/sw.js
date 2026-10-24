/*
 * Service worker do MeuMix (PWA).
 * - Páginas: sempre da rede (dados ao vivo e pessoais nunca ficam em cache);
 *   sem conexão, mostra /offline.html.
 * - Arquivos estáticos (JS/CSS com hash, logos de mapas, insígnias, ícones):
 *   cache, para o app abrir rápido.
 * - API, login e ações do servidor: não passam pelo cache.
 * - Avisos no celular (Web Push): mostra o aviso e abre a página ao tocar.
 */
const VERSION = "meumix-v1";
const STATIC = `${VERSION}-static`;
const PRECACHE = ["/offline.html", "/pwa/icon-192.png", "/brand/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cada deploy gera arquivos novos em /_next/static: mantém só os mais recentes.
const MAX_ENTRIES = 400;
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) if (!PRECACHE.includes(new URL(keys[i].url).pathname)) await cache.delete(keys[i]);
}

const ASSETS = /^\/(_next\/static|maps|badges|brand|brands|pwa)\//;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (ASSETS.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const cached = await cache.match(request);
        // Arquivos com hash do Next nunca mudam: o cache basta.
        if (cached && url.pathname.startsWith("/_next/static/")) return cached;
        // Demais (mapas, insígnias, ícones): usa o cache e atualiza em segundo plano.
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone()).then(() => trim(cache));
            return res;
          })
          .catch(() => cached ?? Response.error());
        return cached ?? network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "MeuMix", {
      body: data.body || "",
      icon: "/pwa/icon-192.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Mesma origem: reaproveita uma aba aberta do MeuMix.
      if (target.origin === self.location.origin) {
        const tab = list.find((c) => new URL(c.url).origin === self.location.origin);
        if (tab)
          return tab
            .navigate(target.href)
            .then((c) => (c || tab).focus())
            .catch(() => self.clients.openWindow(target.href));
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
