# Abisisakti
Aplikasi Absensi Siswa Kataji Inspiratif — PWA (GitHub + Cloudflare Pages) dengan database Google Sheets lewat Google Apps Script.

```
abisisakti/
├─ public/                  ← folder yang di-deploy ke Cloudflare Pages
│  ├─ index.html            (aplikasi)
│  ├─ manifest.webmanifest  (identitas PWA)
│  ├─ sw.js                 (service worker / offline)
│  ├─ _headers              (header cache Cloudflare)
│  ├─ favicon.ico / .svg / -16.png / -32.png
│  └─ icons/                (icon-192/512, maskable-192/512, apple-touch-icon)
├─ apps-script/Code.gs      ← ditempel ke Apps Script (BUKAN di-deploy ke Cloudflare)
├─ make_icons.py            (opsional: pembuat ulang ikon)
└─ README.md
```

## 1. Pasang backend (Google Apps Script)
1. Buka Google Sheets Anda → **Extensions → Apps Script**.
2. Ganti seluruh isi `Code.gs` dengan `apps-script/Code.gs`. **Hapus file `Index.html`** di proyek Apps Script (tidak dipakai lagi).
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Salin **Web app URL** (berakhiran `/exec`).
5. Setiap kali `Code.gs` diubah: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (URL tetap sama).

## 2. Isi URL di aplikasi
Buka `public/index.html`, cari baris:
```js
var API_URL='GANTI_DENGAN_URL_WEB_APP_APPS_SCRIPT';
```
lalu ganti dengan URL dari langkah 1.4.

## 3. GitHub
```bash
cd abisisakti
git init
git add .
git commit -m "Abisisakti PWA"
git branch -M main
git remote add origin https://github.com/USERNAME/abisisakti.git
git push -u origin main
```

## 4. Cloudflare Pages
1. Dashboard Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pilih repo `abisisakti`.
2. Pengaturan build:
   - Framework preset: **None**
   - Build command: *(kosongkan)*
   - Build output directory: **`public`**
3. **Save and Deploy**. Hasilnya `https://abisisakti.pages.dev` (bisa diganti domain sendiri di tab *Custom domains*).

Setiap `git push` ke `main` akan otomatis men-deploy versi baru.

## 5. Uji PWA
- **Android (Chrome):** buka situsnya → muncul tombol "📲 Pasang Abisisakti" (atau menu ⋮ → *Install app*).
- **iPhone (Safari):** tombol Bagikan → *Tambah ke Layar Utama*.
- **Desktop:** ikon pasang di kanan address bar Chrome/Edge.
- Cek di Chrome DevTools → **Lighthouse → PWA** atau tab **Application → Manifest**.

## Catatan
- Saat offline, aplikasi tetap terbuka, tetapi login/simpan absensi butuh internet (data ada di Google Sheets).
- Setelah mengubah `index.html` atau ikon, naikkan `VERSION` di `public/sw.js` (mis. `abisisakti-v2`) agar pengguna mendapat versi terbaru.
- **Ganti PIN bawaan** (`1234` dan `0000`) di sheet *Guru* sebelum dipakai sungguhan.
