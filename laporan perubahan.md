# Laporan Perubahan Kode Aplikasi SIPGN (Sistem Informasi Pemantauan Gizi Nasional)

Laporan ini merangkum seluruh perubahan, perbaikan bug, peningkatan keamanan, serta penambahan fitur baru yang telah dilakukan pada kode sumber aplikasi SIPGN sejak repositori pertama kali dicloning hingga saat ini. 

---

## 📌 Ringkasan Utama Perubahan

Secara garis besar, perubahan difokuskan pada:
1. **Keamanan & RBAC (Role-Based Access Control):** Mengamankan rute API dan navigasi frontend agar setiap pengguna hanya dapat melihat dan memodifikasi data sesuai peran (*role*) dan wilayah kerjanya (terutama bagi `OPERATOR_SPPG`, `ASISTEN_LAPANGAN`, dan `PENGAWAS_GIZI`).
2. **Kesesuaian & Validasi Data Gizi:** Memperbaiki sistem perhitungan status gizi Z-Score WHO, menerapkan rumus BMI untuk anak sekolah, dan validasi LILA untuk ibu hamil/menyusui.
3. **Penyempurnaan Fitur Distribusi & Penerima Manfaat:** Menambahkan alur Edit dan Hapus untuk laporan distribusi berstatus `DRAFT`, integrasi foto bukti, serta fitur mengaktifkan kembali (*reactivate*) penerima manfaat yang dinonaktifkan.
4. **Standardisasi Timezone:** Memperbaiki bug pergeseran tanggal akibat perbedaan zona waktu server/deployment dengan menyelaraskan ke Waktu Indonesia Barat (`Asia/Jakarta`).
5. **Peningkatan Kualitas Pengujian:** Menambahkan rangkaian pengujian unit (*unit testing*) untuk rute-rute utama backend dan frontend guna menjamin keandalan sistem.

---

## 🛠️ I. Detail Perubahan Backend (Sisi Server)

### 1. Keamanan & RBAC (Reroute & Middleware)
*   **File Modifikasi:**
    *   [rbac.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/middleware/rbac.js)
    *   [sppg.routes.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/sppg.routes.js)
*   **Perubahan:**
    *   Meningkatkan fungsi `resolveSppgId` agar dapat mendeteksi `sppgId` dari parameter URL `req.params.id` pada rute yang diawali `/sppg`.
    *   Menerapkan middleware `requireSppgAccess` pada rute detail SPPG (`GET /sppg/:id`) untuk memblokir operator SPPG dari mengakses detail SPPG lain.

### 2. Dashboard Controller & Validasi Operator
*   **File Modifikasi:** [dashboard.controller.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/controllers/dashboard.controller.js)
*   **Perubahan:**
    *   Menambahkan fungsi helper `validateBoundOperator`. Jika pengguna adalah `OPERATOR_SPPG` atau `ASISTEN_LAPANGAN` namun belum memiliki keterikatan `sppgId` pada akunnya, API akan mengembalikan status `403 Forbidden` ("Akun Anda belum terhubung dengan SPPG").
    *   Menyelaraskan format tanggal tren distribusi dan alert dengan menambahkan metode `.utc().format("YYYY-MM-DD")` untuk menghindari ketidakcocokan zona waktu.

### 3. Pengelolaan Penerima Manfaat (Penerima Controller & Routes)
*   **File Modifikasi:**
    *   [penerima.controller.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/controllers/penerima.controller.js)
    *   [penerima.routes.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/penerima.routes.js)
*   **Perubahan:**
    *   **Pengecekan NIK Duplikat:** Mencegah pendaftaran NIK yang sama di bawah SPPG yang sama (`nikHash` unik per SPPG), baik saat registrasi baru, update, maupun import via Excel.
    *   **Validasi Gender & Kategori:** Memastikan kategori `IBU_HAMIL` dan `IBU_MENYUSUI` hanya dapat dipilih jika jenis kelamin penerima adalah `PEREMPUAN`.
    *   **Batas Usia Kategori:** Memvalidasi kecocokan usia (BALITA harus 0–60 bulan, PESERTA_DIDIK minimal 60 bulan).
    *   **Pencarian & Pengurutan Dinamis:** Menambahkan pengurutan dinamis berdasarkan `namaLengkap`, `createdAt`, atau `kategori` pada endpoint list penerima.
    *   **Daftar Satuan Pendidikan:** Menambahkan endpoint `GET /penerima/satuan-pendidikan` untuk mengambil data instansi pendidikan unik per SPPG demi kemudahan filter di frontend.
    *   **Fitur Aktifkan Kembali:** Menambahkan rute `PATCH /penerima/:id/aktifkan` untuk mengaktifkan kembali data penerima manfaat yang sebelumnya berstatus nonaktif.

### 4. Perhitungan Z-Score & Klasifikasi Status Gizi
*   **File Modifikasi:**
    *   [zscore.service.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/services/zscore.service.js)
    *   [gizi.controller.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/controllers/gizi.controller.js)
    *   [gizi.routes.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/gizi.routes.js)
*   **Perubahan:**
    *   **WHO Z-Score:** Melewati kalkulasi Z-score WHO untuk Ibu Hamil/Menyusui, serta untuk anak sekolah (`PESERTA_DIDIK`) berusia di atas 5 tahun (60 bulan) karena tabel pertumbuhan WHO hanya berkisar untuk anak usia 0-5 tahun.
    *   **Klasifikasi Ibu Hamil & Menyusui:** Mengklasifikasikan status gizi berdasarkan LILA (Lingkar Lengan Atas). Jika LILA < 23.5 cm dikategorikan `GIZI_KURANG`, selain itu `GIZI_BAIK`.
    *   **Klasifikasi Anak Sekolah (> 60 bulan):** Menggunakan perhitungan Indeks Massa Tubuh (BMI) dengan rumus $\text{BMI} = \text{Berat (kg)} / (\text{Tinggi (m)})^2$. Status diklasifikasikan sebagai `GIZI_KURANG` jika BMI < 18.5, dan `GIZI_LEBIH` jika BMI > 25.0.
    *   **Integrasi Prevalensi Gizi:** Mengizinkan peran `OPERATOR_SPPG` mengakses data prevalensi gizi agar grafik ringkasan di dashboard operator dapat terisi. Menambahkan proteksi agar pengawas gizi hanya dapat memfilter wilayah pengawasannya sendiri.

### 5. Pengelolaan Distribusi MBG
*   **File Modifikasi:**
    *   [distribusi.controller.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/controllers/distribusi.controller.js)
    *   [distribusi.routes.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/distribusi.routes.js)
*   **Perubahan:**
    *   **Fitur CRUD Lengkap:** Menambahkan fungsi `detailDistribusi` (`GET /distribusi/:id`), `updateDistribusi` (`PUT /distribusi/:id`), dan `hapusDistribusi` (`DELETE /distribusi/:id`).
    *   **Validasi Status:** Mengatur agar fungsi Update dan Hapus hanya boleh dilakukan apabila status laporan masih berupa `DRAFT` (kecuali untuk peran `ADMIN`).
    *   **Validasi Kapasitas & Porsi:** Memastikan total porsi yang didistribusikan lebih dari 0, dan tidak melampaui batas toleransi 120% dari kapasitas harian SPPG yang bersangkutan.
    *   **Validasi Batas Tanggal:** Membatasi input tanggal maksimal H-3 dari hari ini (untuk mencegah manipulasi data masa lalu oleh operator tanpa izin admin/pengawas).

### 6. Layanan Ekspor Laporan
*   **File Modifikasi:**
    *   [laporan.service.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/services/laporan.service.js)
    *   [laporan.controller.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/controllers/laporan.controller.js)
    *   [excel.service.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/services/excel.service.js)
*   **Perubahan:**
    *   **Perbaikan Ekspor PDF Distribusi:** Mengubah logika pembuatan PDF distribusi agar menggunakan `fetchDistribusi` (bukan pratinjau yang dibatasi 100 baris) agar seluruh data yang difilter tercetak dengan total porsi yang akurat.
    *   **Ekspor Excel Status Gizi:** Menambahkan kolom `Z BB/TB` ke dalam berkas Excel yang diunduh.
    *   **Validasi Filter Laporan:** Menerapkan fungsi `validateLaporanFilter` untuk mencegah pengguna di luar admin mengakses data SPPG lain saat mengekspor laporan.

### 7. Sinkronisasi Tanggal (Timezone Fix) & Webhook Cron
*   **File Modifikasi:**
    *   [dateRange.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/utils/dateRange.js)
    *   [cron.controller.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/controllers/cron.controller.js)
*   **Perubahan:**
    *   **Penyelesaian Masalah Tanggal Geser:** Mengubah logika `startOfDay` dan `endOfDay` agar memotong offset jam. String tanggal `YYYY-MM-DD` yang diterima dari frontend diproses di level UTC midnight. Hal ini mencegah tanggal laporan bergeser menjadi H-1 saat disimpan di database PostgreSQL region luar negeri (misal region Vercel/Supabase).
    *   **Otorisasi Webhook Fleksibel:** Webhook cron kini mendukung fallback otorisasi berbasis token JWT user (selain pengecekan header `CRON_SECRET`), sehingga Admin dapat memicu sinkronisasi/cron secara manual dengan aman langsung dari antarmuka web.

---

## 💻 II. Detail Perubahan Frontend (Sisi Klien)

### 1. Keamanan Rute Navigasi (`App.jsx`)
*   **File Modifikasi:** [App.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/App.jsx)
*   **Perubahan:**
    *   Membatasi akses ke halaman Daftar SPPG dan Detail SPPG hanya untuk peran `ADMIN`, `PEJABAT_BGN`, dan `PENGAWAS_GIZI`.
    *   Menghubungkan komponen form distribusi dengan parameter `id` (`/distribusi/:id/edit`) agar mendukung mode edit.
    *   Membatasi akses input pemantauan gizi hanya untuk `ADMIN`, `PENGAWAS_GIZI`, dan `OPERATOR_SPPG`.

### 2. Fitur & Antarmuka Dashboard
*   **File Modifikasi:** [DashboardPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/DashboardPage.jsx)
*   **Perubahan:**
    *   **Visualisasi Peta Lokal:** Jika operator SPPG login, peta sebaran SPPG secara otomatis akan terfokus (zoom level 11) langsung ke koordinat SPPG operator tersebut.
    *   **Penyembunyian Tombol Manajemen Data:** Tombol *Backfill 30 Hari* dan *Reset Data Dummy* disembunyikan dari semua pengguna kecuali `ADMIN`.
    *   **Alert Realisasi Rendah:** Menambahkan visualisasi daftar SPPG yang memiliki tingkat realisasi penyaluran porsi di bawah 80% dari kapasitas harian mereka.

### 3. Halaman Laporan & Ekspor (`LaporanPage.jsx`)
*   **File Modifikasi:** [LaporanPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/LaporanPage.jsx)
*   **Perubahan:**
    *   **Pembatasan Tab Laporan:** Membatasi tab laporan *Status Gizi* dan *Kinerja SPPG* agar hanya bisa diakses oleh Admin, Pejabat BGN, dan Pengawas Gizi.
    *   **Auto-Lock Filter Operator:** Menonaktifkan opsi pemilihan provinsi dan SPPG bagi operator SPPG (terkunci otomatis pada SPPG tempat mereka ditugaskan).
    *   **Pencarian Dinamis Penerima:** Menambahkan kolom input pencarian berbasis Nama/NIK di tab laporan Penerima.
    *   **Tabel Hasil:** Menampilkan kolom nilai `Z BB/TB` pada pratinjau tabel Status Gizi.

### 4. Halaman Penerima Manfaat
*   **File Modifikasi:**
    *   [PenerimaListPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/PenerimaListPage.jsx)
    *   [PenerimaFormPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/PenerimaFormPage.jsx)
    *   [PenerimaDetailPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/PenerimaDetailPage.jsx)
*   **Perubahan:**
    *   **Aksi Aktifkan Kembali:** Menambahkan tombol "Aktifkan" pada daftar penerima berstatus nonaktif (khusus untuk admin/operator).
    *   **Penyelesaian Bug Sorting:** Mengintegrasikan Ant Design Table sorting secara penuh dengan backend, sehingga klik pada header tabel benar-benar memicu pemuatan ulang data terurut dari server.
    *   **Validasi Formulir:**
        *   NIK wajib diisi saat pendaftaran baru (16 digit), namun opsional saat edit data jika tidak ingin diubah.
        *   Validasi interaktif: memblokir pemilihan jenis kelamin Laki-laki bila kategori Ibu Hamil/Menyusui dipilih, serta membatasi usia secara presisi (0-60 bulan untuk Balita, dll.).
    *   **Satuan Pendidikan Dinamis:** Satuan pendidikan/layanan akan melacak opsi yang pernah diinput ke basis data di bawah SPPG tersebut, menggabungkannya dengan nilai default untuk AutoComplete yang lebih cerdas.
    *   **Detail Penerima Lengkap:** Mengintegrasikan data histori lengkap pengukuran gizi (ditampilkan sebagai grafik pertumbuhan) serta memuat tabel 5 riwayat distribusi terakhir unit SPPG terkait.

### 5. Halaman Input Laporan Distribusi MBG
*   **File Modifikasi:**
    *   [DistribusiListPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/DistribusiListPage.jsx)
    *   [DistribusiFormPage.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/pages/DistribusiFormPage.jsx)
*   **Perubahan:**
    *   **Aksi Edit & Hapus:** Menampilkan tombol Edit dan Hapus pada tabel distribusi jika baris data berstatus `DRAFT`. Tombol hapus dilengkapi dengan konfirmasi pengaman (`Popconfirm`).
    *   **Formulir Distribusi Multi-step:** 
        *   Memisahkan alur pengisian menjadi beberapa tahap terpisah (Step 1: Info Tanggal/Unit, Step 2: Input Porsi, Step 3: Konfirmasi).
        *   Menyediakan validasi wajib isi pada Step 1 & Step 2 sebelum tombol "Lanjut" dapat ditekan.
        *   Menampilkan informasi status unggahan foto bukti lama beserta tautan berkas foto yang tersimpan jika form sedang berada dalam mode edit.

### 6. Grafik Pertumbuhan Gizi (`GiziGrafikPertumbuhan.jsx`)
*   **File Modifikasi:** [GiziGrafikPertumbuhan.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/components/gizi/GiziGrafikPertumbuhan.jsx)
*   **Perubahan:**
    *   **Penyembunyian Kurva Non-Balita:** Kurva standar pertumbuhan WHO (garis SD -3, -2, Median, +2, +3) kini disembunyikan apabila kategori penerima manfaat bukan `BALITA` (misal untuk anak sekolah/ibu hamil), karena kurva tersebut tidak relevan bagi usia mereka.
    *   **Sumbu X Dinamis:** Batas sumbu X (usia dalam bulan) dapat meregang melebihi 60 bulan secara dinamis tergantung pada usia tertinggi yang tercatat pada riwayat pengukuran anak sekolah.

### 7. Konfigurasi Aset Vite (`vite.config.js`)
*   **File Modifikasi:** [vite.config.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/vite.config.js)
*   **Perubahan:**
    *   Mengubah konfigurasi `base` path Vite dari `"/frontend/"` menjadi `"/"` guna menyelesaikan masalah pemuatan bundel aset JavaScript/CSS dan jalur routing ketika aplikasi dijalankan.

---

## 📈 III. Penambahan & Pembaruan File Pengujian (Unit & Integration Tests)

Guna memastikan setiap perubahan logika backend dan rute API aman dan tidak merusak sistem yang sudah ada, ditambahkan rangkaian pengujian otomatis baru di folder `__tests__`:

1.  **[distribusi.routes.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/__tests__/distribusi.routes.test.js) [NEW]:**
    *   Menguji validasi pembuatan laporan distribusi (porsi > 0, pembatasan masa lampau H-3).
    *   Menguji otorisasi rute detail, edit (update), dan hapus distribusi untuk status `DRAFT` dan non-DRAFT.
2.  **[gizi.routes.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/__tests__/gizi.routes.test.js) [NEW]:**
    *   Menguji rute prevalensi gizi dan validasi zona wilayah bagi peran pengawas gizi.
    *   Menguji validasi masukan antropometri (berat badan, tinggi badan, LILA).
3.  **[laporan.routes.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/__tests__/laporan.routes.test.js) [NEW]:**
    *   Menguji rute ekspor PDF dan Excel laporan distribusi, penerima, status gizi, dan kinerja SPPG.
    *   Memastikan rute dilindungi oleh pembatasan akses data berbasis peran.
4.  **[sppg.routes.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/__tests__/sppg.routes.test.js) [NEW]:**
    *   Menguji keamanan endpoint SPPG detail terhadap upaya bypass data oleh operator dari SPPG lain.
5.  **[rbac.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/middleware/__tests__/rbac.test.js) [MODIFY]:**
    *   Menambahkan kasus uji untuk memverifikasi penanganan `sppgId` dari baseUrl `/sppg/:id`.
6.  **[penerima.routes.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/routes/__tests__/penerima.routes.test.js) [MODIFY]:**
    *   Memperluas kasus uji untuk mencakup validasi baru (kategori perempuan untuk ibu hamil/menyusui, keunikan NIK).
7.  **[zscore.service.test.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/services/__tests__/zscore.service.test.js) [MODIFY]:**
    *   Memverifikasi logika perhitungan Z-score baru untuk anak di atas 5 tahun (metode BMI) dan ibu hamil (metode LILA).
8.  **[DashboardPage.test.jsx](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/frontend/src/__tests__/DashboardPage.test.jsx) [MODIFY]:**
    *   Memperbarui tes antarmuka dashboard untuk menguji rendering alert realisasi rendah yang baru ditambahkan.

---

## 📈 IV. Penambahan File Eksternal / Utilitas Lainnya

*   **[generate-who-data.js](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/scripts/generate-who-data.js) [NEW]:** 
    *   Script untuk menyusun berkas referensi JSON standar deviasi WHO dari paket *pedi-growth* menggunakan interpolasi LMS biner.
*   **[Data WHO JSON](file:///home/rafi/Documents/tugas-kuliah/semester4/software-engginer/BGN/backend/src/data/who/) [NEW/MODIFY]:**
    *   Kumpulan berkas JSON berisi referensi lengkap Bb/U, Tb/U, dan Bb/Tb untuk boys dan girls yang digunakan sebagai landasan hitung Z-score pada server gizi.
