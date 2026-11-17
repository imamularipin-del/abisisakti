/** Absensi Siswa - Google Apps Script + Google Sheets
 *  Pasang script ini dari Extensions > Apps Script pada spreadsheet Anda. */

const SH = { GURU: 'Guru', SISWA: 'Siswa', ABSEN: 'Absensi', HE: 'HariEfektif', SET: 'Pengaturan' };
const HEAD = {
  Guru: ['Nama', 'PIN', 'Kelas', 'Peran', 'NIP/ID'],
  Siswa: ['ID', 'NIS', 'Nama', 'Kelas'],
  Absensi: ['Bulan', 'SiswaID', 'Data (tgl 1-31)', 'Guru'],
  HariEfektif: ['Bulan', 'Data (1=HE, 0=HTE)', 'Catatan', 'Diubah oleh'],
  Pengaturan: ['Kunci', 'Nilai']
};
const TEXTCOLS = { Guru: ['B:C', 'E:E'], Siswa: ['B:B'], Absensi: ['A:A', 'C:C'], HariEfektif: ['A:B'], Pengaturan: ['B:B'] };
const SEED = {
  Guru: [['Bu Rina Wulandari', '1234', 'X IPA 1, X IPS 1', 'Guru', '198501012010012001'], ['Admin Sekolah', '0000', '*', 'Admin', 'ADMIN']],
  Siswa: [
    [1, '2024001', 'Aditya Pratama', 'X IPA 1'],
    [2, '2024002', 'Bunga Lestari', 'X IPA 1'],
    [3, '2024003', 'Citra Maharani', 'X IPA 1'],
    [4, '2024004', 'Kevin Hartono', 'X IPS 1'],
    [5, '2024005', 'Laila Azzahra', 'X IPS 1']
  ],
  Absensi: [],
  HariEfektif: [],
  Pengaturan: [['Sekolah', 'Nama Sekolah'], ['Tempat', ''], ['KepalaSekolah', 'Nama Kepala Sekolah']]
};

/* ---------- Pintu API (dipanggil dari aplikasi PWA di Cloudflare Pages) ---------- */
// Hanya fungsi di daftar ini yang boleh dipanggil dari luar.
function api_() {
  return { login: login, sesi: sesi, infoSekolah: infoSekolah, simpanAbsensi: simpanAbsensi, tambahSiswa: tambahSiswa,
    ubahSiswa: ubahSiswa, hapusSiswa: hapusSiswa, simpanHE: simpanHE, simpanPengaturan: simpanPengaturan,
    simpanGuru: simpanGuru, hapusGuru: hapusGuru };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, data: 'API Abisisakti aktif.' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = api_()[req.fn];
    if (typeof fn !== 'function') throw new Error('Perintah tidak dikenal.');
    const out = fn.apply(null, req.args || []);
    return json_({ ok: true, data: out === undefined ? null : out });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- Helper ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function setup_() {
  Object.keys(HEAD).forEach(function (name) {
    if (ss_().getSheetByName(name)) return;
    const sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]])
      .setFontWeight('bold').setBackground('#6c4cf5').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    TEXTCOLS[name].forEach(function (a) { sh.getRange(a).setNumberFormat('@'); });
    if (SEED[name].length) sh.getRange(2, 1, SEED[name].length, HEAD[name].length).setValues(SEED[name]);
  });
}

function rows_(name) {
  const sh = ss_().getSheetByName(name), last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
}

function tgl_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v);
}

function bln_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM') : String(v).slice(0, 7);
}

/* ---------- Sesi (token bertanda tangan, tanpa menyimpan apa pun di server) ---------- */
const SESI_HARI = 30;

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}
function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_()));
}
function token_(id) {
  const payload = id + '|' + (Date.now() + SESI_HARI * 86400000);
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}
function idDariToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  let payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); } catch (e) { return null; }
  if (sign_(payload) !== parts[1]) return null;
  const i = payload.lastIndexOf('|');
  if (Number(payload.slice(i + 1)) < Date.now()) return null;
  return payload.slice(0, i);
}
function guru_(id) {
  const k = String(id || '').trim().toLowerCase();
  if (!k) return null;
  return rows_(SH.GURU).filter(function (r) { return String(r[4] || '').trim().toLowerCase() === k; })[0] || null;
}
function profil_(g) {
  const raw = String(g[2]).trim(), all = raw === '*';
  return {
    id: String(g[4]).trim(), nama: String(g[0]), all: all,
    admin: String(g[3] || '').trim().toLowerCase() === 'admin',
    kelas: all ? [] : raw.split(',').map(function (x) { return x.trim(); }).filter(String)
  };
}
function auth_(token, kelas) {
  const id = idDariToken_(token), g = id && guru_(id);
  if (!g) throw new Error('Sesi berakhir. Silakan masuk kembali.');
  const u = profil_(g);
  if (kelas && !u.all && u.kelas.indexOf(kelas) < 0) throw new Error('Anda tidak mengajar kelas ini.');
  return u;
}

/* ---------- API untuk aplikasi ---------- */
function payload_(g) {
  const u = profil_(g), siswaAll = rows_(SH.SISWA);
  let kelas = u.all ? siswaAll.map(function (r) { return String(r[3]); }).concat(kelasGuru_()) : u.kelas;
  kelas = kelas.filter(function (k, i) { return kelas.indexOf(k) === i; }).sort();

  const siswa = siswaAll.filter(function (r) { return kelas.indexOf(String(r[3])) >= 0; })
    .map(function (r) { return { id: Number(r[0]), nis: String(r[1]), nama: String(r[2]), kelas: String(r[3]) }; });
  const ids = {};
  siswa.forEach(function (s) { ids[s.id] = 1; });
  const absen = {};
  rows_(SH.ABSEN).forEach(function (r) {
    if (!ids[r[1]]) return;
    const b = bln_(r[0]), d = String(r[2]);
    for (let i = 0; i < d.length; i++) {
      if ('HISA'.indexOf(d[i]) >= 0) absen[b + '-' + ('0' + (i + 1)).slice(-2) + '|' + r[1]] = d[i];
    }
  });
  const he = {}, set = {};
  rows_(SH.HE).forEach(function (r) { he[bln_(r[0])] = { d: String(r[1]), c: String(r[2] || '') }; });
  rows_(SH.SET).forEach(function (r) { set[String(r[0])] = String(r[1] || ''); });
  return { ok: true, token: token_(u.id), id: u.id, nama: u.nama, kelas: kelas, siswa: siswa, absen: absen, admin: u.admin, he: he, set: set, gurus: u.admin ? listGuru_() : [] };
}

function login(id, pin) {
  setup_();
  const g = guru_(id);
  if (!g || String(g[1]).trim() !== String(pin).trim()) return { ok: false, msg: 'NIP/ID atau PIN salah.' };
  return payload_(g);
}

/** Dipanggil otomatis saat aplikasi dibuka: masuk kembali memakai token yang tersimpan di perangkat. */
function sesi(token) {
  setup_();
  const id = idDariToken_(token), g = id && guru_(id);
  return g ? payload_(g) : { ok: false };
}

/** Jalankan dari editor jika ingin memaksa semua guru masuk ulang. */
function cabutSemuaSesi() {
  PropertiesService.getScriptProperties().deleteProperty('SECRET');
  return 'Semua sesi dicabut.';
}

/* Penyimpanan hemat: 1 baris per siswa per bulan, 31 karakter (H/I/S/A, '-' = belum diisi) */
function simpanAbsensi(token, tgl, kelas, recs) {
  const u = auth_(token, kelas);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw new Error('Format tanggal tidak valid.');
  const bulan = tgl.slice(0, 7), pos = Number(tgl.slice(8)) - 1;
  if (pos < 0 || pos > 30) throw new Error('Tanggal tidak valid.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SH.ABSEN), last = sh.getLastRow();
    const data = last > 1 ? sh.getRange(2, 1, last - 1, 4).getValues() : [];
    const idx = {}, add = [];
    data.forEach(function (r, i) { idx[bln_(r[0]) + '|' + r[1]] = i; });
    recs.forEach(function (x) {
      if (['H', 'I', 'S', 'A'].indexOf(x[1]) < 0) return;
      const k = bulan + '|' + x[0];
      if (k in idx) {
        const r = data[idx[k]], d = String(r[2]).padEnd(31, '-').split('');
        d[pos] = x[1]; r[0] = bulan; r[2] = d.join(''); r[3] = u.nama;
      } else {
        const d = Array(31).fill('-'); d[pos] = x[1];
        add.push([bulan, x[0], d.join(''), u.nama]);
      }
    });
    if (data.length) sh.getRange(2, 1, data.length, 4).setValues(data);
    if (add.length) sh.getRange(Math.max(last, 1) + 1, 1, add.length, 4).setValues(add);
  } finally { lock.releaseLock(); }
  return true;
}

function tambahSiswa(token, nama, nis, kelas) {
  auth_(token, kelas);
  nama = String(nama).trim(); nis = String(nis).trim();
  if (!nama || !nis) throw new Error('Nama dan NIS wajib diisi.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const all = rows_(SH.SISWA);
    if (all.some(function (r) { return String(r[1]).trim() === nis; })) throw new Error('NIS sudah terdaftar.');
    const id = all.reduce(function (m, r) { return Math.max(m, Number(r[0])); }, 0) + 1;
    ss_().getSheetByName(SH.SISWA).appendRow([id, nis, nama, kelas]);
    return { id: id, nis: nis, nama: nama, kelas: kelas };
  } finally { lock.releaseLock(); }
}

function hapusSiswa(token, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SH.SISWA), data = rows_(SH.SISWA);
    const i = data.findIndex(function (r) { return Number(r[0]) === Number(id); });
    if (i < 0) throw new Error('Siswa tidak ditemukan.');
    auth_(token, String(data[i][3]));
    sh.deleteRow(i + 2);

    const sa = ss_().getSheetByName(SH.ABSEN), last = sa.getLastRow();
    if (last > 1) {
      const all = sa.getRange(2, 1, last - 1, 4).getValues();
      const keep = all.filter(function (r) { return Number(r[1]) !== Number(id); });
      sa.getRange(2, 1, last - 1, 4).clearContent();
      if (keep.length) sa.getRange(2, 1, keep.length, 4).setValues(keep);
    }
  } finally { lock.releaseLock(); }
  return true;
}

/** Jalankan SEKALI dari editor jika sheet Absensi masih format lama (1 baris per siswa per hari). */
function migrasiAbsensi() {
  const sh = ss_().getSheetByName(SH.ABSEN);
  if (sh.getRange(1, 3).getValue() !== 'Kelas') return 'Sudah format baru.';
  const map = {};
  rows_(SH.ABSEN).forEach(function (r) {
    const t = tgl_(r[0]), b = t.slice(0, 7), k = b + '|' + r[1];
    map[k] = map[k] || [b, r[1], Array(31).fill('-'), r[4]];
    map[k][2][Number(t.slice(8)) - 1] = r[3];
  });
  const out = Object.keys(map).map(function (k) { const m = map[k]; return [m[0], m[1], m[2].join(''), m[3]]; });
  sh.clear();
  HEAD.Absensi.forEach(function (h, i) { sh.getRange(1, i + 1).setValue(h); });
  TEXTCOLS.Absensi.forEach(function (a) { sh.getRange(a).setNumberFormat('@'); });
  if (out.length) sh.getRange(2, 1, out.length, 4).setValues(out);
  return 'Selesai: ' + out.length + ' baris.';
}

/** Khusus admin: simpan Hari Efektif per bulan. data = 31 karakter, 1 = HE, 0 = HTE. */
function simpanHE(token, bulan, data, catatan) {
  const u = auth_(token);
  if (!u.admin) throw new Error('Hanya admin yang dapat mengatur hari efektif.');
  if (!/^\d{4}-\d{2}$/.test(bulan) || !/^[01]{31}$/.test(data)) throw new Error('Data hari efektif tidak valid.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SH.HE), rows = rows_(SH.HE);
    const i = rows.findIndex(function (r) { return bln_(r[0]) === bulan; });
    const row = [[bulan, data, String(catatan || '').slice(0, 200), u.nama]];
    sh.getRange(i >= 0 ? i + 2 : Math.max(sh.getLastRow(), 1) + 1, 1, 1, 4).setValues(row);
  } finally { lock.releaseLock(); }
  return true;
}

/* ---------- Khusus admin: Pengaturan sekolah & data guru ---------- */
function adminAuth_(token) {
  const u = auth_(token);
  if (!u.admin) throw new Error('Hanya admin yang dapat melakukan ini.');
  return u;
}

function listGuru_() {
  return rows_(SH.GURU).map(function (r) {
    return { id: String(r[4] || '').trim(), nama: String(r[0]), kelas: String(r[2]), peran: String(r[3] || '').trim().toLowerCase() === 'admin' ? 'Admin' : 'Guru' };
  }).filter(function (g) { return g.id; });
}

function kelasGuru_() {
  const out = [];
  rows_(SH.GURU).forEach(function (r) {
    String(r[2]).split(',').forEach(function (k) { k = k.trim(); if (k && k !== '*') out.push(k); });
  });
  return out;
}

function simpanPengaturan(token, data) {
  adminAuth_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SH.SET), rows = rows_(SH.SET);
    ['Sekolah', 'Tempat', 'KepalaSekolah'].forEach(function (k) {
      const v = String((data || {})[k] || '').trim().slice(0, 120);
      const i = rows.findIndex(function (r) { return String(r[0]) === k; });
      sh.getRange(i >= 0 ? i + 2 : Math.max(sh.getLastRow(), 1) + 1, 1, 1, 2).setValues([[k, v]]);
      if (i < 0) rows.push([k, v]);
    });
  } finally { lock.releaseLock(); }
  const set = {};
  rows_(SH.SET).forEach(function (r) { set[String(r[0])] = String(r[1] || ''); });
  return set;
}

/** orig = NIP/ID lama (kosong jika guru baru). PIN kosong saat mengubah = PIN tidak berubah. */
function simpanGuru(token, orig, d) {
  const me = adminAuth_(token);
  const id = String(d.id || '').trim(), nama = String(d.nama || '').trim(), kelas = String(d.kelas || '').trim();
  const peran = String(d.peran).toLowerCase() === 'admin' ? 'Admin' : 'Guru';
  let pin = String(d.pin || '').trim();
  if (!id || !nama) throw new Error('NIP/ID dan nama wajib diisi.');
  if (id.length > 40) throw new Error('NIP/ID terlalu panjang.');
  if (pin && pin.length < 4) throw new Error('PIN minimal 4 karakter.');
  if (peran === 'Guru' && !kelas) throw new Error('Isi kelas yang diajar, pisahkan dengan koma.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SH.GURU), rows = rows_(SH.GURU);
    const find = function (x) {
      x = String(x || '').trim().toLowerCase();
      return rows.findIndex(function (r) { return String(r[4] || '').trim().toLowerCase() === x; });
    };
    const i = orig ? find(orig) : -1;
    if (orig && i < 0) throw new Error('Data guru tidak ditemukan.');
    const dup = find(id);
    if (dup >= 0 && dup !== i) throw new Error('NIP/ID sudah dipakai guru lain.');
    if (i < 0 && !pin) throw new Error('PIN wajib diisi untuk guru baru.');
    if (i >= 0 && String(rows[i][4]).trim().toLowerCase() === me.id.toLowerCase()) {
      if (id.toLowerCase() !== me.id.toLowerCase()) throw new Error('NIP/ID akun Anda sendiri tidak dapat diubah.');
      if (peran !== 'Admin') throw new Error('Peran akun Anda sendiri tidak dapat diturunkan.');
    }
    if (!pin && i >= 0) pin = String(rows[i][1]);
    sh.getRange(i >= 0 ? i + 2 : Math.max(sh.getLastRow(), 1) + 1, 1, 1, 5)
      .setValues([[nama, pin, kelas || '*', peran, id]]);
  } finally { lock.releaseLock(); }
  return listGuru_();
}

function hapusGuru(token, id) {
  const me = adminAuth_(token);
  if (String(id).trim().toLowerCase() === me.id.toLowerCase()) throw new Error('Akun Anda sendiri tidak dapat dihapus.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const rows = rows_(SH.GURU), k = String(id).trim().toLowerCase();
    const i = rows.findIndex(function (r) { return String(r[4] || '').trim().toLowerCase() === k; });
    if (i < 0) throw new Error('Data guru tidak ditemukan.');
    ss_().getSheetByName(SH.GURU).deleteRow(i + 2);
  } finally { lock.releaseLock(); }
  return listGuru_();
}

/** Publik (tanpa login): hanya mengembalikan nama sekolah untuk ditampilkan di header halaman login. */
function infoSekolah() {
  setup_();
  const r = rows_(SH.SET).filter(function (x) { return String(x[0]) === 'Sekolah'; })[0];
  return r ? String(r[1] || '') : '';
}

/** Khusus admin: ubah nama, NIS, atau kelas siswa. Riwayat absensi mengikuti ID siswa, jadi ikut berpindah kelas. */
function ubahSiswa(token, id, d) {
  adminAuth_(token);
  const nama = String(d.nama || '').trim(), nis = String(d.nis || '').trim(), kelas = String(d.kelas || '').trim();
  if (!nama || !nis || !kelas) throw new Error('Nama, NIS, dan kelas wajib diisi.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const rows = rows_(SH.SISWA);
    const i = rows.findIndex(function (r) { return Number(r[0]) === Number(id); });
    if (i < 0) throw new Error('Siswa tidak ditemukan.');
    if (rows.some(function (r, j) { return j !== i && String(r[1]).trim() === nis; })) throw new Error('NIS sudah dipakai siswa lain.');
    ss_().getSheetByName(SH.SISWA).getRange(i + 2, 2, 1, 3).setValues([[nis, nama, kelas]]);
    return { id: Number(id), nis: nis, nama: nama, kelas: kelas };
  } finally { lock.releaseLock(); }
}
