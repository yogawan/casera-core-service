# Bottom Navbar Mobile (Flutter) — HOST & AGENT

> Daftar nama Nav Item untuk bottom navbar di app Flutter, dipisah per role. **Tanpa API contract** — itu ada di `docs/AUTH-MOBILE-API-INTEGRATION.md` dan dokumen modul lainnya.

Struktur ini diturunkan dari **Authorization Matrix (PRD §3.2)** dan dari role gating yang benar-benar ada di kode. Karena PRD tidak pernah mendikte bentuk UI, bentuk nav di bawah — jumlah slot, tombol aksi tengah, penempatan Profil — adalah keputusan desain; yang bukan keputusan desain adalah *siapa boleh akses apa*, itu sudah ditentukan backend.

Kedua role sengaja **tidak** memakai bentuk nav yang sama:

- **AGENT** — 5 slot, tapi hanya **4 di antaranya tujuan navigasi**. Slot tengah adalah **tombol aksi (+) "Buat Transaksi"** — shortcut tercepat saat ada customer baru datang, bisa ditekan dari tab manapun, bukan halaman/tab biasa. Alasannya struktural (satu-satunya role yang bisa `POST /transactions`) sekaligus operasional (kecepatan saat customer menunggu) — lihat "Kenapa (+) Hanya Ada di AGENT" di bawah.
- **HOST** — 6 slot, dan **keenamnya tujuan navigasi biasa** (flat tabs, tanpa tombol aksi). HOST tidak punya satu aksi *create* yang dominan dan berulang seperti AGENT punya "Buat Transaksi" — lihat "Kenapa HOST Jadi 6 Tab Flat" di bawah. Slot ke-6 (Subscription & Billing) adalah pengecualian yang disengaja atas batas praktis "maksimal 5", bukan pola umum yang boleh ditiru untuk alasan lain.

---

## HOST

| # | Nav Item | Isi |
|---|---|---|
| 1 | **Dashboard** | Ringkasan KPI & revenue **semua cabang** |
| 2 | **Transaksi** | Daftar transaksi semua cabang + **Persetujuan** (antrian pengajuan perubahan) |
| 3 | **Inventaris** | Stok semua cabang |
| 4 | **Kelola** | Hub ke 3 halaman manajemen — lihat di bawah |
| 5 | **Subscription & Billing** | Status langganan Grooma, riwayat invoice, bayar via QRIS |
| 6 | **Profil** | Profil akun HOST, ganti password, logout |

### Kenapa HOST Jadi 6 Tab Flat (Tanpa Tombol Aksi)

Diperiksa ulang terhadap seluruh permukaan API yang bisa diakses HOST (PRD §7.2–§7.11 + §23): Dashboard, Transaksi (+ Persetujuan), Inventaris, Cabang, Karyawan, Kategori Servis, Subscription & Billing, Customer (kontekstual dari Transaksi), Profil — **seluruhnya sudah punya tempat**. Awalnya kesembilan hal itu dirancang pas di 5 slot (bottom nav praktis maksimal 5), dengan Subscription & Billing dititipkan di dalam hub Kelola bersama 3 sub-halaman administratif lainnya.

**Subscription & Billing dipromosikan keluar jadi tab ke-6 sendiri** — keputusan sadar untuk melanggar batas praktis "maksimal 5" itu, karena satu alasan spesifik: ini satu-satunya sub-halaman Kelola yang punya konsekuensi waktu nyata. Siklus billing-nya bulanan (§23.2), dan begitu lewat jatuh tempo, HOST kehilangan akses ke hampir seluruh app (lihat "State Terkunci" di bawah) — Subscription justru jadi satu-satunya "pintu keluar" dari kondisi itu. Menguburnya di balik hub yang 3 sub-halaman lainnya ikut ter-`402` saat kondisi itu terjadi menciptakan UX yang janggal: HOST menekan Kelola, melihat 3 halaman rusak dan 1 yang berfungsi, padahal yang berfungsi itu justru yang paling kritis untuk ditemukan cepat. Tab sendiri juga berarti bisa dapat badge independen di ikon nav-nya (mis. "jatuh tempo 3 hari") — sinyal yang lebih kuat daripada badge di dalam hub.

**Cabang, Karyawan, dan Layanan tetap di dalam Kelola** — ketiganya tidak punya alasan sekuat Subscription untuk melanggar batas slot lebih jauh: administratif, jarang dibuka, dan tidak ada konsekuensi mengunci app kalau dibiarkan. Menaikkan salah satu dari mereka ke tab sendiri juga akan membawa nav ke 7 tanpa justifikasi operasional yang sebanding.

HOST tetap tidak mendapat tombol aksi tengah seperti AGENT, dengan alasan yang sama seperti sebelumnya: tidak ada satu aksi *create* HOST yang dominan dan berulang seperti "Buat Transaksi" milik AGENT — cabang, karyawan, kategori servis, dan item inventaris beda domain dan jarang dipakai, masing-masing sudah wajar diletakkan sebagai tombol "+" di dalam halamannya sendiri.

Satu-satunya perubahan isi lain dari versi sebelumnya: sub-halaman **Kelola › Layanan** sekarang mencakup CRUD lima kategori servis (Haircut, Shaving, Treatment, Colouring, Chemical — PRD §5.14, menggantikan `Service` tunggal yang sudah dihapus) dalam satu hub yang sama, bukan lima slot terpisah. Field per kategori kini hanya `nama`, `harga`, dan `revenue sharing` — tanpa durasi, kode, atau status aktif/nonaktif (field-field itu sengaja tidak dibawa dari `Service` lama).

---

## AGENT

| # | Nav Item | Isi |
|---|---|---|
| 1 | **Transaksi** | Riwayat & status transaksi cabangnya sendiri — list, detail, selesaikan servis, batalkan, lihat status pengajuan perubahan sendiri |
| 2 | **Dashboard** | Ringkasan KPI **cabangnya sendiri saja** |
| 3 | **(+) Buat Transaksi** | **Shortcut tercepat saat ada customer baru datang** — tombol aksi (bukan tab), bisa ditekan dari tab manapun untuk langsung ke flow transaksi baru: pilih/daftar customer, 1–5 kategori servis, employee pelaksana, metode bayar |
| 4 | **Customer** | Lihat, tambah, update customer (tidak bisa nonaktifkan) |
| 5 | **Inventaris** | CRUD stok, **hanya cabangnya sendiri** |

> **Profil AGENT tidak ada di bottom nav** — pindah ke ikon header, lihat "Kenapa Profil AGENT Pindah ke Ikon Header" di bawah.

### Kenapa (+) Hanya Ada di AGENT, di Posisi Tengah

**AGENT adalah satu-satunya role yang bisa membuat transaksi** (`POST /transactions` — Authorization Matrix PRD §3.2: Create transaction = `No` untuk HOST dengan `403` eksplisit, `Yes` untuk AGENT). Ini bukan sekadar satu dari sekian aksi AGENT — ini **alasan role itu ada secara operasional** (kasir POS), dipanggil berkali-kali dalam satu shift.

**Fungsinya sebagai shortcut, bukan cuma soal otorisasi.** Momen yang memicunya adalah **customer baru datang ke cabang** — AGENT perlu membuka flow transaksi secepat mungkin dari tab manapun dia sedang berada (Dashboard, Customer, atau Inventaris), tanpa harus pindah ke tab Transaksi dulu lalu cari tombol tambah di dalamnya. Slot tengah bottom nav adalah posisi paling cepat dijangkau jempol dan selalu terlihat dari semua tab — itu sebabnya tombol ini ditaruh di sana, bukan disembunyikan di dalam tab Transaksi. Kombinasi "satu aksi dominan + frekuensi sangat tinggi + harus secepat mungkin saat customer menunggu" itu yang membuatnya pantas jadi tombol aksi tengah (pola FAB/notch yang umum di app POS lain).

HOST tidak punya pasangan yang setara untuk aksi tunggal seperti ini — lihat "Kenapa HOST Tetap 5 Tab Flat" di atas.

**Penting — jangan matikan tombol (+) saat subscription HOST menunggak.** Sesuai PRD §23.4.1, `POST /transactions` ada di allowlist endpoint yang tetap bisa dipanggil AGENT meskipun subscription HOST-nya `PAST_DUE`/`EXPIRED`/`CANCELLED` — cakupan lengkap allowlist-nya ada di bagian "State Terkunci" di bawah. Tombol (+) termasuk hal yang **harus** tetap aktif, bukan kandidat default untuk di-disable bersama Dashboard/Inventaris.

Secara teknis, slot ini **bukan tab biasa** — tidak punya state "aktif/terpilih" seperti 4 lainnya, karena menekannya membuka flow baru, bukan berpindah ke halaman yang "dihuni". Setelah transaksi berhasil dibuat, AGENT wajar mendarat di halaman detail transaksi tersebut (bukan otomatis balik ke tab sebelumnya); dari sana tetap bisa kembali ke tab Transaksi untuk melihatnya dalam daftar.

### Kenapa Profil AGENT Pindah ke Ikon Header

Menambahkan tombol (+) ke tengah membuat AGENT hanya punya **4 slot untuk 5 tujuan navigasi yang sudah ada** sebelumnya (Transaksi, Customer, Inventaris, Dashboard, Profil) — satu harus direlokasi, bukan dihapus. Kandidatnya dipilih dengan membandingkan seberapa kuat alasan masing-masing untuk tetap jadi tab:

- **Dashboard tidak bisa dikorbankan** — PRD §1.3 secara eksplisit menyebut "melihat dashboard" sebagai satu dari empat tanggung jawab AGENT (bersama mencatat transaksi, mengelola inventaris cabangnya, mengajukan koreksi transaksi), dan ini halaman yang wajar dibuka berkali-kali per shift (cek KPI cabang di tengah jam kerja), bukan sekali lalu lupa.
- **Customer tidak dikorbankan** — dokumen ini sejak awal sudah menetapkan bahwa customer untuk AGENT pantas jadi tab sendiri, berbeda dari HOST yang cukup mengaksesnya dari dalam tab Transaksi (lihat catatan di bagian "Apa Itu Tab Kelola" di bawah). Membalik keputusan itu sekarang, hanya demi aritmetika slot, akan menghilangkan alasan kuat yang sudah ada tanpa gantinya.
- **Inventaris tidak dikorbankan** — tanggung jawab eksplisit AGENT yang sama (PRD §1.3), dan satu-satunya tempat AGENT melakukan CRUD stok cabangnya.
- **Profil adalah kandidat yang tersisa**, dan secara kebetulan juga kandidat paling masuk akal: isinya (ganti password, logout, lihat profil akun) diakses jauh lebih jarang dibanding empat lainnya — bukan halaman yang dibuka berkali-kali per shift — dan memindahkan akses profil/akun ke ikon header (mis. avatar di pojok kanan atas) adalah pola yang sudah umum di mobile app, bukan perubahan yang membingungkan pengguna.

**Fungsinya tidak hilang, hanya pintunya pindah** — seluruh isi Profil tetap ada dan dapat diakses dari ikon header di semua halaman AGENT.

**HOST tidak mengalami relokasi yang sama.** HOST tidak punya tombol (+) yang merebut slot, jadi tidak ada tekanan aritmetika untuk mengevakuasi satu dari 5 tujuan navigasinya — Profil HOST tetap di bottom nav seperti semula. Perbedaan ini sengaja tidak disamakan paksa antar role; bentuk chrome boleh berbeda selama alasannya konsisten.

---

## Apa Itu Tab "Kelola"?

**Kelola** adalah satu slot nav HOST yang isinya **menu/hub ke beberapa halaman manajemen**, bukan satu halaman tunggal. Alasannya sederhana: HOST punya 3 area administratif yang masing-masing jarang dibuka (tidak harian seperti Transaksi), sementara nav tetap dijaga seminim mungkin slotnya. Kalau masing-masing dikasih slot sendiri, nav-nya jadi 8 item dan yang harian malah tenggelam.

Isi tab Kelola (**semuanya HOST-only** — tidak satu pun bisa diakses AGENT):

| Sub-halaman | Isi |
|---|---|
| **Cabang** | CRUD cabang, aktif/nonaktifkan cabang |
| **Karyawan** | CRUD akun AGENT/HOST, assign cabang, aktif/nonaktifkan akun |
| **Layanan** | CRUD 5 kategori servis (Haircut, Shaving, Treatment, Colouring, Chemical): nama, harga, revenue sharing (bagi hasil owner/pegawai) — tanpa durasi, kode, atau status aktif/nonaktif (PRD §5.14) |

> Catatan: **Subscription & Billing dulu ada di sini, sekarang jadi tab sendiri (posisi 5)** — lihat "Kenapa HOST Jadi 6 Tab Flat" di atas untuk alasan promosinya.

> Catatan: **Customer sengaja TIDAK ditaruh di Kelola** meskipun HOST punya kewenangan ekstra di situ (aktif/nonaktifkan). Alasannya, customer dipakai operasional harian oleh kedua role, bukan data master yang jarang disentuh — jadi untuk HOST, customer paling pas diakses dari dalam tab **Transaksi** (saat menelusuri siapa yang bertransaksi), bukan dikubur di menu administratif. Untuk AGENT, customer memang sudah jadi tab sendiri.

---

## Soal Kategori Servis (Haircut/Shaving/Treatment/Colouring/Chemical) — Sudah Ada, Tapi Perhatikan Ini

**Untuk HOST:** kelima kategori ada di dalam **Kelola › Layanan** (CRUD penuh per kategori: tambah, ubah harga, atur bagi hasil — lihat PRD §5.14 untuk field persisnya).

**Untuk AGENT: kelima kategori sebaiknya BUKAN nav item, dan itu disengaja.** AGENT memang bisa membaca seluruh entri di kelima kategori (`GET /haircuts`, `/shavings`, `/treatments`, `/colourings`, `/chemicals` — semuanya memperbolehkan AGENT), tapi aksesnya **read-only** — tidak bisa tambah/ubah/hapus sama sekali (dan tidak ada status aktif/nonaktif untuk dibatasi juga — kelima model memang tidak punya field `isActive`). Pembacaan itu hanya dibutuhkan **di dalam flow tombol (+) Buat Transaksi** (layar "pilih kategori servis" saat input transaksi baru, boleh pilih 1–5 kategori sekaligus dalam satu transaksi), bukan sebagai halaman katalog yang berdiri sendiri. Memberi AGENT tab tersendiri untuk ini hanya akan memakan slot nav untuk layar yang tidak punya tujuan di luar flow itu.

Kalau tetap ingin AGENT bisa melihat daftar harga di luar flow Buat Transaksi (mis. untuk menjawab pertanyaan customer), taruh sebagai halaman read-only di dalam tab **Transaksi** atau di balik ikon **Profil** di header — bukan slot nav tersendiri.

---

## Persetujuan (Change Request) — HOST

Antrian pengajuan perubahan transaksi adalah **queue kerja milik HOST** (`GET /transaction-change-requests` HOST-only) — AGENT mengajukan, HOST memutuskan.

**Rekomendasi penempatan:** di dalam tab **Transaksi** sebagai sub-halaman "Persetujuan", **dengan badge berisi jumlah pengajuan `PENDING`** di ikon nav Transaksi. Alasannya: ini sifatnya menunggu tindakan HOST, jadi harus terlihat tanpa HOST perlu membukanya dulu — badge menyelesaikan itu tanpa memakan slot nav keenam.

Untuk **AGENT**, tidak ada antrian apa pun: AGENT hanya bisa melihat status pengajuan **yang dia ajukan sendiri**, dan itu paling pas ditempel di halaman detail transaksi yang bersangkutan, bukan jadi halaman daftar tersendiri. Detailnya di `docs/TRANSACTION-CHANGE-REQUESTS-MOBILE-API-INTEGRATION.md` §4.

---

## Cakupan — Semua Modul API Sudah Terwakili di Mana?

Tabel ini untuk memastikan tidak ada modul backend yang kelupaan dapat tempat di UI:

| Modul API | HOST | AGENT |
|---|---|---|
| `/auth` | Profil (ganti password, logout) | Ikon header › Profil |
| `/profile` | Profil | Ikon header › Profil |
| `/dashboard/*` | Tab Dashboard | Tab Dashboard |
| `/transactions/*` | Tab Transaksi (lihat, selesaikan, batalkan) | Tab Transaksi (lihat, selesaikan, batalkan) + **(+) Buat Transaksi** (baru) |
| `/payments/*` | — (tidak pernah dipanggil HOST) | Di dalam flow (+) Buat Transaksi, bayar QRIS |
| `/transaction-change-requests/*` | Transaksi › Persetujuan (+ badge) | Di detail transaksi (status pengajuan sendiri) |
| `/customers/*` | Di dalam tab Transaksi | Tab Customer |
| `/inventory/*` | Tab Inventaris | Tab Inventaris |
| `/haircuts`, `/shavings`, `/treatments`, `/colourings`, `/chemicals` | Kelola › Layanan | Read-only di flow (+) Buat Transaksi |
| `/branches/*` | Kelola › Cabang | Read-only info cabang sendiri, di balik ikon header › Profil |
| `/users/*` | Kelola › Karyawan | **Tidak ada akses** |
| `/subscription/*` | Tab **Subscription & Billing** | **Tidak ada akses** |

---

## State "Terkunci" Saat Subscription HOST Menunggak

Ini bukan kasus langka — ini state yang **harus** dirancang dari awal, dan efeknya ke dua role sangat berbeda. Saat subscription berstatus `PAST_DUE`/`EXPIRED`/`CANCELLED`:

### HOST — hampir seluruh app terkunci

Satu-satunya yang masih bisa diakses HOST: **Profil** dan tab **Subscription & Billing** (supaya bisa bayar). Dashboard, Transaksi, Inventaris, dan seluruh sub-halaman Kelola (Cabang, Karyawan, Layanan) **semuanya balas `402`**.

**Jangan** biarkan HOST menekan tab satu per satu lalu disambut error 402 di tiap layar. Pola yang benar: begitu app tahu subscription lapsed, tampilkan **layar blocker** dengan CTA "Bayar Tagihan" yang langsung ke tab Subscription, dan disable seluruh tab lain di navbar kecuali Profil.

### AGENT — hanya sebagian terkunci

Allowlist persisnya (PRD §23.4.1) adalah daftar endpoint, bukan daftar tab — berikut pemetaannya ke nav di atas:

| Masih jalan normal | Terkunci (`402`) |
|---|---|
| **(+) Buat Transaksi** (`POST /transactions`) | Tab **Dashboard** (seluruh `/dashboard/*`) |
| Tab **Transaksi** — lihat, selesaikan, batalkan, struk, bayar QRIS | Tab **Inventaris** (seluruh `/inventory/*`) |
| Tab **Customer** (kecuali aktif/nonaktifkan — itu HOST-only) | **Ajukan perubahan** transaksi (`/transactions/{id}/change-requests`) |
| Ikon header **Profil** — ganti password, logout, lihat profil akun (`/profile`, `/auth/*`, exempt tanpa syarat) | Info **cabang sendiri** di dalam Profil (`/branches`) — lihat jebakan di bawah |
| Pilih kategori servis di flow (+) Buat Transaksi | |

**(+) sengaja TIDAK ada di kolom kanan** — ini bukan kelalaian, lihat "Kenapa (+) Hanya Ada di AGENT" di atas.

**Satu jebakan implementasi:** ikon header Profil sendiri tidak pernah terkunci (`/profile`/`/auth/me`/`/auth/change-password` exempt tanpa syarat, tidak berubah oleh §23.4.1). Tapi kalau halaman itu juga menampilkan info cabang sendiri AGENT (`GET /branches/:id`, sesuai baris "Cakupan" di atas), sub-bagian **itu spesifik** tetap harus 402 — `/branches` eksplisit ada di daftar terkunci §23.4.1, terlepas dari status Profil-nya sendiri. Jangan samakan "Profil tidak terkunci" dengan "semua yang ditampilkan di halaman Profil tidak terkunci".

Ini disengaja (PRD §23.4.1): customer yang sudah duduk di kursi tidak boleh jadi korban tagihan HOST yang telat, tapi AGENT juga tidak dibiarkan bebas sepenuhnya — akses AGENT dibatasi ke alur yang dibutuhkan untuk menyelesaikan satu transaksi, bukan dibebaskan dari pembatasan sepenuhnya. Jadi untuk AGENT cukup **disable 2 tab** (Dashboard, Inventaris) + sembunyikan tombol "Ajukan Perubahan" + sembunyikan sub-bagian info cabang di Profil — sisanya (termasuk tombol (+)) tetap berfungsi penuh.

---

## Catatan Lain

- **AGENT tidak punya tab "Kelola"** — ketiga isinya HOST-only, jadi memang tidak ada link-nya sama sekali, bukan disembunyikan secara kondisional.
- **AGENT juga tidak punya tab "Subscription & Billing"** — sama seperti Kelola, ini HOST-only sepenuhnya (PRD §7.11). AGENT tidak memiliki subscription sendiri untuk dilihat; status subscription HOST-nya memengaruhi *akses* AGENT (lihat "State Terkunci" di atas), bukan memberi AGENT halaman untuk melihatnya.
- **HOST (6 slot) dan AGENT (5 slot) punya jumlah nav yang berbeda, dan itu disengaja** — satu-satunya alasan HOST dikecualikan dari batas praktis "maksimal 5" adalah Subscription & Billing (lihat "Kenapa HOST Jadi 6 Tab Flat" di atas), bukan preferensi umum untuk slot lebih banyak. Jangan jadikan ini alasan menambah slot HOST lain di masa depan tanpa justifikasi operasional yang setara.
- **Urutan tab sengaja berbeda antar role:** AGENT ditaruh Transaksi di posisi 1 karena itu kerjaan hariannya, dengan **(+) Buat Transaksi di tengah (posisi 3)** sebagai aksi tercepatnya; HOST ditaruh Dashboard di posisi 1 karena lebih sering buka overview dulu, dan tidak punya tombol aksi sama sekali karena tidak ada satu aksi *create* yang dominan (lihat penjelasan masing-masing di atas).
- **"Dashboard" dan "Inventaris" sama namanya di kedua role, tapi scope datanya beda** (semua cabang vs. satu cabang) — ditentukan backend otomatis dari sesi login, bukan dari pilihan di UI (PRD §3.2, §3.3).
- **HOST tidak bisa membuat transaksi** (`POST /transactions` menolak HOST dengan `403`) — konsekuensinya dobel: HOST tidak pernah mendapat tombol (+) di nav-nya sama sekali (lihat "Kenapa HOST Tetap 5 Tab Flat" di atas), dan di dalam tab Transaksi milik HOST, **jangan tampilkan tombol "Buat Transaksi"** dalam bentuk apa pun. Tab itu untuk HOST sifatnya monitoring + approval, bukan input.
- **Profil tidak di tempat yang sama di kedua role** — HOST: tab bottom nav biasa (posisi 5). AGENT: ikon header, direlokasi khusus untuk memberi ruang ke (+) — lihat "Kenapa Profil AGENT Pindah ke Ikon Header" di atas. Ini perbedaan chrome yang disengaja, bukan inkonsistensi.
