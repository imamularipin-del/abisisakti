/* Service worker Abisisakti
 * - Cangkang aplikasi (HTML, ikon, manifest) disimpan agar aplikasi bisa dibuka tanpa internet.
 * - Data absensi TIDAK di-cache: semua panggilan ke Apps Script selalu lewat jaringan.
 * Naikkan VERSION setiap kali Anda ingin memaksa pengguna memakai berkas terbaru. */
const VERSION = 'abisisakti-v3';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST ke Apps Script tidak disentuh
  const url = new URL(req.url);
  if (url.hostname.indexOf('google.com') > -1 && url.hostname.indexOf('script.') === 0) return;
  if (url.hostname.indexOf('googleusercontent.com') > -1) return;

  // Halaman: jaringan dulu (supaya update cepat), cadangan dari cache saat offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put('/index.html', copy); });
        return res;
      }).catch(function () { return caches.match('/index.html').then(function (r) { return r || caches.match('/'); }); })
    );
    return;
  }

  // Berkas statis sendiri & CDN (font, SweetAlert): pakai cache sambil memperbarui di latar belakang
  if (url.origin === location.origin || CDN.indexOf(url.hostname) > -1) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        const net = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});
