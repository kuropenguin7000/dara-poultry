# Dara Poultry — Website Company Profile

Website profil perusahaan untuk **Dara Poultry**, peternakan ayam petelur di
Ciamis, Jawa Barat (3.000+ ekor ayam petelur, produksi telur segar setiap hari)
yang juga menjual pakan ternak.

## Teknologi
Situs statis murni — **HTML + CSS + JavaScript vanilla**, tanpa framework dan
tanpa proses build. Satu-satunya dependensi eksternal adalah **Three.js** yang
dimuat dari CDN lewat `importmap` untuk animasi 3D.

## Struktur
```
index.html    → seluruh konten & struktur halaman
styles.css    → desain, tema warna, efek kaca, dan responsif (mobile friendly)
script.js     → menu mobile, animasi scroll, penghitung angka, tilt 3D kartu,
                pengatur video latar
scene.js      → adegan 3D (Three.js): ladang telur di latar belakang
server.js     → server statis kecil untuk pratinjau lokal (opsional)
media/        → video latar (2 ukuran × mp4/webm) + gambar poster
tools/        → skrip pembuat video latar (tidak ikut di-deploy)
```

## Animasi 3D
Satu `<canvas>` WebGL menempel di belakang seluruh halaman. Sekumpulan telur
tersusun ulang mengikuti posisi scroll — dari gugusan bebas di hero, menjadi
susunan seperti rak telur, lalu lengkungan panen, dan akhirnya menyebar kembali.
Kamera bergerak menyusuri jalur tetap yang "di-scrub" oleh scroll, bukan dipicu
sekali jalan, sehingga gerakannya selalu mengikuti posisi pembaca.

Detail teknis:
- Bentuk telur dibuat dengan `LatheGeometry` — tidak ada file model yang diunduh.
- Pencahayaan matahari terbit dibuat secara prosedural (canvas → PMREM), jadi
  tidak perlu mengambil file HDR.
- Kekuatan latar 3D meredup saat pengguna scroll melewati hero agar tidak
  mengganggu keterbacaan teks.

Interaksi saat scroll dan gerak kursor:
- Posisi scroll ikut **memutar** setiap telur, bukan hanya memindahkannya.
- **Kecepatan** scroll membuat telur sedikit memanjang, kamera mundur, dan
  bidang pandang miring tipis — jadi terasa menyatu dengan gerakan jari.
- Di perangkat dengan mouse, telur **menghindar** dari kursor.

**Fallback otomatis** — halaman tetap utuh tanpa 3D:
- Jika Three.js gagal dimuat atau WebGL tidak tersedia → ilustrasi 2D hero tampil.
- Jika pengguna mengaktifkan *reduced motion* → adegan 3D dirender diam
  (tanpa animasi), dan seluruh animasi CSS dinonaktifkan.

## Video latar
Di lapisan paling belakang ada video **matahari terbit** yang berputar mulus
(18 detik, tanpa suara). Video ini hanya menjadi suasana untuk area pembuka:
saat pengguna scroll, video meredup hingga hilang di 1,5 layar pertama lalu
**dijeda otomatis** supaya tidak memakan baterai dan kuota.

Videonya **dibuat sendiri secara prosedural** — bukan stok video. Semua frame
digambar lewat perhitungan di Node lalu di-encode dengan ffmpeg, jadi tidak ada
aset berbayar dan hasilnya selalu sama setiap kali dibuat ulang:

```bash
node tools/make-hero-video.mjs             # buat ulang video (± 1 menit)
node tools/make-hero-video.mjs --still 0   # simpan 1 frame sebagai PNG
```
Butuh **ffmpeg** terpasang di sistem.

Hemat kuota — ukuran file dipilih otomatis oleh `script.js`:

| Kondisi | Yang diunduh |
| --- | --- |
| Layar ≥ 900px | `hero-loop.webm` (333 KB) |
| Layar < 900px | `hero-loop-sm.webm` (135 KB) |
| *Reduced motion*, mode hemat data, atau jaringan 2g | hanya poster (8 KB) |

Bila video gagal dimuat atau autoplay ditolak browser, gambar poster tetap
tampil sebagai latar — halaman tidak pernah menampilkan kotak hitam.

## Menjalankan secara lokal
Karena Three.js dimuat sebagai ES module, halaman perlu dibuka lewat HTTP
(bukan `file://`):

```bash
node server.js
# lalu buka http://localhost:4173
```

## Deploy — Firebase Hosting
Situs ini di-deploy ke **Firebase Hosting** (project: `dara-poultry`).

**URL:** https://dara-poultry.web.app

### Sekali saja (mesin baru)
```bash
npm install -g firebase-tools
firebase login
```

### Deploy
```bash
firebase deploy --only hosting

# validasi tanpa mem-publish
firebase deploy --only hosting --dry-run
```

### Pratinjau konfigurasi Hosting secara lokal
```bash
firebase emulators:start --only hosting   # http://localhost:5000
```

> **Catatan (Windows):** custom header pada `firebase.json` tidak diterapkan oleh
> emulator lokal di Windows karena bug normalisasi pola glob. Header tetap
> berfungsi normal di Firebase Hosting sungguhan. Jangan mengubah konfigurasi
> header hanya berdasarkan hasil emulator.

### File yang di-deploy
Sembilan file yang diunggah — `index.html`, `styles.css`, `script.js`,
`scene.js`, dan lima aset di `media/`. Sisanya (`.git/`, `.claude/`,
`server.js`, `tools/`, `*.md`) dikecualikan lewat daftar `ignore` di
`firebase.json`.

Untuk memastikan file apa saja yang akan terunggah:
```bash
firebase deploy --only hosting --dry-run
```
Perhatikan baris `found N files` saat deploy — jumlahnya harus **9**. Bila
bertambah, ada file baru yang belum masuk daftar `ignore`.

> **Penting:** `tools/` wajib dikecualikan. Isinya skrip pembuat video yang
> hanya dipakai saat pengembangan; hasilnya (`media/`) yang ikut ter-deploy,
> bukan skripnya.

> **Penting:** daftar `ignore` harus memuat `**/.*/**`, bukan hanya `**/.*`.
> Pola `**/.*` hanya cocok untuk segmen terakhir yang diawali titik, sehingga
> isi folder `.git/` tetap ikut terunggah dan riwayat repository bisa diakses publik.

> **Penting:** `*.md` sengaja dikecualikan. Tanpa itu, `README.md` dan `CLAUDE.md`
> ikut tersaji publik di `https://dara-poultry.web.app/README.md`.

### Alternatif hosting statis lain
- **Netlify** / **Vercel** — tarik-lepas folder atau hubungkan repo
- **GitHub Pages** — aktifkan Pages pada repository
- Atau hosting/shared hosting biasa (upload via FTP)

## Yang perlu disesuaikan nanti
- **Nomor telepon / WhatsApp** — tombol "Hubungi Kami" & "Pesan" saat ini
  mengarah ke bagian kontak. Tambahkan link `https://wa.me/62xxxxxxxxxx` bila
  sudah ada nomor resmi.
- **Alamat lengkap** — saat ini "Ciamis, Jawa Barat"; lengkapi jika perlu.
- **Foto asli** — ilustrasi 2D dapat diganti dengan foto kandang, telur, dan produk.
- **Jam buka** — sesuaikan pada bagian Lokasi & Kontak dan footer.
- **Three.js dari CDN** — untuk kemandirian penuh, unduh `three.module.js`
  dan arahkan `importmap` di `index.html` ke file lokal.
