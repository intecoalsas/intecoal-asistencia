/*
 * Service worker mínimo de INTECOAL Asistencia.
 *
 * Única función: mostrar /offline.html cuando falla la navegación por falta
 * de conexión. No almacena respuestas de la API, ni páginas de la aplicación,
 * ni marcaciones, ni datos personales. No permite marcaciones sin conexión.
 *
 * Caché: solo la página informativa y su icono (recursos estáticos públicos).
 */
const CACHE = "intecoal-offline-v1";
const RECURSOS = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(RECURSOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Elimina cachés de versiones anteriores de este service worker
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Solo navegaciones (cargas de página). Todo lo demás —API, QR, imágenes,
  // scripts— va directo a la red sin intervención ni caché.
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() => caches.match("/offline.html"))
  );
});
