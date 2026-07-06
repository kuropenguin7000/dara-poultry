# Dara Poultry — Website Company Profile

Website profil perusahaan untuk **Dara Poultry**, peternakan ayam petelur di
Tasikmalaya, Jawa Barat (3.000+ ekor ayam petelur, produksi telur segar setiap
hari) yang juga menjual pakan ternak.

## Teknologi
Situs statis murni — **HTML + CSS + JavaScript vanilla**, tanpa framework dan
tanpa proses build. Ringan, cepat, dan bisa di-host di mana saja.

## Struktur
```
index.html    → seluruh konten & struktur halaman
styles.css    → desain, tema warna, dan responsif (mobile friendly)
script.js     → menu mobile, animasi scroll, penghitung angka
server.js     → server statis kecil untuk pratinjau lokal (opsional)
```

## Menjalankan secara lokal
Cukup buka `index.html` langsung di browser.

Atau jalankan server lokal:
```bash
node server.js
# lalu buka http://localhost:4173
```

## Deploy
Unggah seluruh folder ke layanan hosting statis apa pun:
- **Netlify** / **Vercel** — tarik-lepas folder atau hubungkan repo
- **GitHub Pages** — aktifkan Pages pada repository
- Atau hosting/shared hosting biasa (upload via FTP)

## Yang perlu disesuaikan nanti
- **Nomor telepon / WhatsApp** — tombol "Hubungi Kami" & "Pesan" saat ini
  mengarah ke bagian kontak. Tambahkan link `https://wa.me/62xxxxxxxxxx` bila
  sudah ada nomor resmi.
- **Alamat lengkap** — saat ini "Tasikmalaya, Jawa Barat"; lengkapi jika perlu.
- **Foto asli** — ilustrasi dapat diganti dengan foto kandang, telur, dan produk.
- **Jam buka** — sesuaikan pada bagian Lokasi & Kontak dan footer.
