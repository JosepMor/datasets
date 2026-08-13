/**
 * Service worker: guarda el "esqueleto" de la app para poder usarla sin
 * conexión. Estrategia: red primero con reserva en caché, de modo que al
 * publicar una versión nueva se recoja sola en cuanto haya red.
 *
 * Al cambiar cualquier fichero, sube el número de VERSION.
 */
const VERSION = 'prestamos-v1';
const RECURSOS = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './finanzas.js',
  './manifest.webmanifest',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(RECURSOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        return respuesta;
      })
      .catch(() => caches.match(peticion).then((r) => r || caches.match('./index.html')))
  );
});
