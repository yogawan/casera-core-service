# Integrasi Mobile (Flutter) — Grooma API — Kelola & Subscription (HOST)

> Dokumen ini mencakup **3 sub-halaman tab Kelola** (Cabang, Karyawan, Layanan) **plus Subscription & Billing**. Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2.
>
> **Catatan struktur nav:** Subscription & Billing **bukan lagi sub-halaman di dalam tab Kelola** — sekarang tab bottom-nav tersendiri untuk HOST (lihat `docs/MOBILE-BOTTOM-NAVBAR.md`, bagian "Kenapa HOST Jadi 6 Tab Flat"). Didokumentasikan di file yang sama karena API-nya tidak berubah bentuk sama sekali akibat perubahan posisi tab itu — hanya perubahan desain nav, bukan perubahan kontrak endpoint.

> **Diperbarui penuh berdasarkan audit langsung ke kode** (`models/`, `validations/`, `services/`, `app/api/v1/{branches,users,haircuts,shavings,treatments,colourings,chemicals,subscription}/**`) — bukan disalin dari versi dokumen sebelumnya.

---

## 0. Ringkasan & Policy

| Sub-halaman | Endpoint | Role |
|---|---|---|
| **Cabang** | `/api/v1/branches*` | Baca: HOST + AGENT · Tulis: **HOST only** |
| **Karyawan** | `/api/v1/users*` | **HOST only** (semuanya) |
| **Layanan** | `/api/v1/{haircuts,shavings,treatments,colourings,chemicals}*` | Baca: HOST + AGENT · Tulis: **HOST only** |
| **Subscription** | `/api/v1/subscription*` | **HOST only** (semuanya, read-only) |

### Subscription Gating — Beda-beda per Sub-halaman

| Sub-halaman | Policy | Artinya saat langganan HOST nunggak |
|---|---|---|
| Cabang, Karyawan | `ENFORCED` | HOST **dan** AGENT sama-sama `402` |
| Layanan (baca, kelima kategori) | `EXEMPT_AGENT` | AGENT tetap bisa baca katalog (butuh untuk input transaksi); HOST `402` |
| Layanan (tulis, kelima kategori) | `ENFORCED` | HOST `402` |
| **Subscription** | `EXEMPT_ALL` | **Selalu bisa diakses** — ini justru satu-satunya pintu HOST untuk bayar dan memulihkan akses |

> **Konsekuensi untuk UI:** saat langganan lapsed, dari seluruh grup ini **hanya Subscription yang masih hidup**. Cabang, Karyawan, dan kelima endpoint Layanan (sisi HOST) balas `402`. Arahkan HOST langsung ke tab Subscription lewat layar blocker, jangan biarkan menabrak 402 satu per satu (lihat `MOBILE-BOTTOM-NAVBAR.md` bagian state terkunci).

### ⚠️ Breaking Change — "Layanan" Sekarang 5 Model Terpisah, Bukan Satu `Service` (PRD §5.14, dieksekusi 2026-11-08)

**`/api/v1/services` sudah tidak ada sama sekali** — bukan dinonaktifkan, dihapus total dari kode (`models/Service.ts`, `services/serviceService.ts`, `validations/serviceSchema.ts`, dan seluruh route-nya tidak ada lagi). Digantikan **lima namespace identik strukturnya**, beda nama resource saja:

`/api/v1/haircuts`, `/api/v1/shavings`, `/api/v1/treatments`, `/api/v1/colourings`, `/api/v1/chemicals`

Field yang hilang dari bentuk lama — **tidak dibawa balik, dikonfirmasi final**: `serviceCode`, `description`, `category` (tidak perlu lagi — kategori sekarang adalah nama resource itu sendiri), `durationMinutes`, `isActive`. **Konsekuensi paling penting dari hilangnya `isActive`: tidak ada lagi mekanisme nonaktifkan/aktifkan apa pun untuk kelima kategori ini** — tidak ada endpoint `/status`, tidak ada cara menyembunyikan entri dari AGENT selain menghapusnya (dan tidak ada `DELETE` juga — begitu dibuat, hanya bisa diubah `name`/`price`/`revenueSharing`, tidak pernah ditarik dari katalog). Detail lengkap di §3.

**Field baru:** `timestamp` (Date, **tunggal**) — bukan `createdAt`/`updatedAt` seperti modul lain. Kelima model ini sengaja tidak memakai `timestamps: true`, jadi responsnya **tidak punya** `createdAt`/`updatedAt` sama sekali.

### ⚠️ Tiga Ketidakkonsistenan Lintas Sub-modul yang Gampang Bikin Bug

**1. Mekanisme status: dua punya, tiga tidak punya sama sekali — bukan sekadar beda bentuk.**

| Resource | Mekanisme status |
|---|---|
| Cabang | `PATCH .../status`, body `{ "status": "ACTIVE" }` — enum string |
| Karyawan | `PATCH .../status`, body `{ "status": "ACTIVE" }` — enum string |
| **Layanan (5 kategori)** | **Tidak ada endpoint status apa pun** — tidak ada `isActive`, tidak ada cara nonaktifkan |
| (Customer, di dokumen lain) | `PATCH .../status`, body `{ "isActive": true }` — boolean |

**2. Nama field id: ada yang `_id`, ada yang `id`.**

| Resource | Field id |
|---|---|
| Cabang, Layanan (5 kategori), Subscription, Invoice | `_id` |
| **Karyawan** | **`id`** (plus `branch` jadi `{id, name}`, bukan `{_id, name}`) |

**3. Timestamp: empat punya `createdAt`/`updatedAt`, Layanan punya `timestamp` tunggal.**

| Resource | Field waktu |
|---|---|
| Cabang, Karyawan, Subscription, Invoice | `createdAt`, `updatedAt` |
| **Layanan (5 kategori)** | **`timestamp`** (satu field, bukan dua) |

**4. Keempat grup list sekarang berpaginasi dengan bentuk yang sama.** *(Berubah 2026-10-19 — sebelumnya Cabang/Karyawan/Layanan mengembalikan seluruh data sekaligus, dan invoice memakai key `pages`.)*

| Resource | Pagination | Search/filter server-side |
|---|---|---|
| Cabang | `page`/`limit` | ❌ tidak ada |
| Karyawan | `page`/`limit` | ❌ tidak ada |
| Layanan (kelima kategori) | `page`/`limit` | ❌ tidak ada |
| Invoice subscription | `page`/`limit` | ✅ `status` |

Bentuk `pagination`-nya identik di keempatnya dan sama dengan modul lain — `{page, limit, total, totalPages}`. Kontrak lengkapnya **tidak diulang di sini**: lihat `AUTH-MOBILE-API-INTEGRATION.md` §2.1.

> ⚠️ **Cabang/Karyawan/Layanan dulu mengembalikan SELURUH data; sekarang default 20 baris.** Search & filter untuk ketiganya masih harus di sisi client, jadi layar yang melakukan filter lokal atas hasil fetch **sekarang memfilter 20 baris pertama saja**, bukan seluruh data.
>
> `pages` di invoice masih dikirim berdampingan dengan `totalPages` demi build lama, tapi sudah deprecated — pakai `totalPages`.

---

# 1. Cabang — `/api/v1/branches`

## 1.1. GET /api/v1/branches — List Cabang

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |

Tidak ada param search/filter. Terurut berdasarkan `name` (tie-breaker `_id`, jadi urutannya stabil antar halaman).

AGENT **boleh** memanggil ini (tidak ada `requireRole` sama sekali di route-nya), tapi hanya menerima **satu cabang: miliknya sendiri**. Untuk AGENT, `pagination` tetap terisi penuh dengan `total: 1` — bentuk response-nya identik dengan HOST, cuma isinya satu baris.

> AGENT yang belum punya cabang ditugaskan (kasus langka) dapat `200` dengan `branches: []` dan `total: 0` — bukan error.

```json
{
  "success": true,
  "data": {
    "branches": [
      {
        "_id": "66ffaa0011223344556677aa",
        "branchCode": "KMG",
        "name": "Cabang Kemang",
        "address": "Jl. Kemang Raya No. 1",
        "phone": "021-7654321",
        "timezone": "Asia/Jakarta",
        "status": "ACTIVE",
        "createdAt": "2026-01-05T04:00:00.000Z",
        "updatedAt": "2026-09-20T07:30:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

⚠️ **Picker cabang di form tambah/edit karyawan (§2.2) butuh daftar lengkap.** Dengan default 20, bisnis dengan lebih dari 20 cabang akan punya cabang yang tidak bisa dipilih sama sekali. Kirim `limit=100` dan cek `totalPages` sebelum membangun daftar pilihannya.

## 1.2. POST /api/v1/branches — Tambah Cabang

**HOST only.**

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `branchCode` | `string` | **Ya** | 1–32 karakter, **unik**, **tidak bisa diubah setelah dibuat** |
| `name` | `string` | **Ya** | 1–100 karakter |
| `address` | `string` | Tidak | Maks 255 |
| `phone` | `string` | Tidak | Maks 32 |
| `timezone` | `string` | Tidak | Default `"Asia/Jakarta"`. **Harus IANA timezone valid** (mis. `Asia/Makassar`, `Asia/Jayapura`) — string ngawur ditolak `400` |

> `timezone` bukan sekadar kosmetik: dipakai untuk membentuk tanggal pada `transactionCode` (`GRM-YYYYMMDD-XXXXXX`). Cabang di WITA/WIT harus diset benar, atau kode transaksi memakai tanggal yang salah di sekitar tengah malam.

| Status | Kapan |
|---|---|
| `201` | Sukses, body `{branch}` |
| `400` | Validasi gagal / timezone bukan IANA valid |
| `403` | Bukan HOST |
| `409` | `branchCode` sudah dipakai |

## 1.3. GET /api/v1/branches/:id — Detail Cabang

HOST bisa cabang manapun; AGENT **hanya cabangnya sendiri** (`403` untuk cabang lain, lewat `requireBranchAccess`).

## 1.4. PATCH /api/v1/branches/:id — Ubah Cabang

**HOST only.** Field: `name`, `address`, `phone`, `timezone` (semua optional). **`branchCode` tidak ada di schema** — immutable, dikirim pun ditolak `400`.

## 1.5. PATCH /api/v1/branches/:id/status — Aktif/Nonaktifkan

**HOST only.** Body: `{ "status": "ACTIVE" }` atau `{ "status": "INACTIVE" }` — **enum string, bukan boolean**.

> Efeknya ke operasional: AGENT **tidak bisa membuat transaksi** di cabang yang `INACTIVE` (`422 "Branch is not active."`). Data lama tidak terpengaruh.

---

# 2. Karyawan — `/api/v1/users`

**Seluruh endpoint di bagian ini HOST only** (`403` untuk AGENT — `requireRole(["HOST"])` di kelima handler, tanpa pengecualian `EXEMPT_AGENT`).

## 2.1. GET /api/v1/users — List Karyawan

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |

**Tidak ada search, tidak ada filter role/status** — hanya pagination. Terurut dari yang terbaru dibuat (`createdAt` desc, tie-breaker `_id`).

> Akun platform internal (`GROOMA_ADMIN`) tidak muncul di list ini, dan `pagination.total` **juga tidak menghitungnya** — endpoint ini memfilter dengan allowlist positif (`role: { $in: ["HOST","AGENT"] }`) yang diterapkan ke query DAN count, bukan daftar exclude.

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "66ab12cd34ef56ab78cd90aa",
        "username": "budi_agent",
        "name": "Budi Santoso",
        "role": "AGENT",
        "branch": { "id": "66ffaa0011223344556677aa", "name": "Cabang Kemang" },
        "phone": "08123456789",
        "status": "ACTIVE",
        "createdAt": "2026-09-01T10:30:00.000Z",
        "updatedAt": "2026-10-15T14:20:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 }
  }
}
```

Perhatikan: `id` (bukan `_id`), dan `branch` berbentuk `{id, name}` — **bentuknya identik dengan response `GET /profile`** (keduanya memakai satu fungsi `serializeUser()` yang sama di `services/userService.ts`), jadi model Dart bisa dipakai bersama (lihat `PROFILE-MOBILE-API-INTEGRATION.md` §1). Ketidakkonsistenan `id` vs `_id` ini **hanya berlaku untuk item di dalam array**; objek `pagination` sendiri bentuknya sama di seluruh backend.

**Catatan field:** hanya `username`, `password`(write-only), `name`, `role`, `branch`, `phone`, `status`, `createdAt`, `updatedAt` yang ada pada model `User` — tidak ada `address`/`photoUrl`/`compensation` atau field lain. Jangan menambahkan field itu ke model Dart meski pernah terlihat di sistem lama manapun — `validations/userSchema.ts` memakai `.strict()`, jadi field asing ditolak `400`.

## 2.2. POST /api/v1/users — Tambah Akun Staf

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `username` | `string` | **Ya** | 3–64 karakter, **otomatis di-lowercase server-side**, unik |
| `password` | `string` | **Ya** | 8–128 karakter |
| `name` | `string` | **Ya** | 1–100 karakter |
| `role` | `"HOST"` \| `"AGENT"` | **Ya** | |
| `branch` | `string \| null` | **Tergantung role** | **Wajib diisi kalau `role: "AGENT"`; wajib kosong/null kalau `role: "HOST"`** |
| `phone` | `string` | Tidak | Maks 32 |

⚠️ **Aturan `branch` itu saling-kunci dengan `role` dan ditegakkan di level model** (`UserSchema.pre("validate")`), bukan di schema Zod — Zod sendiri menerima `branch` apa pun bentuknya (`string | null | undefined`), validasi silang terjadi saat Mongoose menyimpan. Hasil akhirnya tetap `400 VALIDATION_ERROR` kalau dilanggar, jadi tidak ada beda perilaku dari sisi app — AGENT tanpa branch ditolak, HOST dengan branch juga ditolak. Form Flutter harus mengikuti: pilih role dulu → kalau AGENT tampilkan picker cabang (wajib), kalau HOST sembunyikan field cabang sepenuhnya.

| Status | Kapan |
|---|---|
| `201` | Sukses |
| `400` | Validasi gagal, aturan role↔branch dilanggar, atau `branch` menunjuk cabang yang tidak ada |
| `403` | Bukan HOST |
| `409` | `username` sudah dipakai |

## 2.3. GET /api/v1/users/:id — Detail Staf

Akun platform internal (`GROOMA_ADMIN`) **tidak pernah muncul** di list maupun detail — kalau id-nya ditebak sekalipun, balasannya `404`, seolah tidak ada.

## 2.4. PATCH /api/v1/users/:id — Ubah Staf

Field: `name`, `role`, `branch`, `phone` (semua optional).

⚠️ **`username` immutable, dan `password` TIDAK ADA di endpoint ini.**

### ‼️ Belum Ada Fitur Reset Password oleh HOST

Satu-satunya jalur ganti password di seluruh backend adalah `POST /auth/change-password`, yang **mewajibkan user login sendiri dan tahu password lamanya**. Artinya: **kalau AGENT lupa password, HOST TIDAK PUNYA cara apa pun untuk mereset lewat API.**

Jangan bangun layar "Reset Password Karyawan" di tab Kelola — endpoint-nya memang tidak ada. Workaround operasional satu-satunya saat ini: HOST menonaktifkan akun lama (§2.5) lalu membuat akun baru (§2.2). Kalau fitur ini dibutuhkan, perlu endpoint baru di backend dulu.

> **Diverifikasi ulang 2026-11-10 langsung ke `app/api/v1/auth/change-password/route.ts`:** saat user berhasil ganti password sendiri, **semua sesi lain miliknya otomatis dicabut** (`revokeOtherSessions()`, dipanggil setelah password berhasil disimpan) — perangkat lain yang masih login akan mulai menerima `401` dan harus login ulang. Perangkat yang dipakai mengganti password tetap login. Response-nya juga menyertakan `revokedSessions` (jumlah sesi yang dicabut) kalau app ingin menampilkannya.

## 2.5. PATCH /api/v1/users/:id/status — Aktif/Nonaktifkan Akun

Body: `{ "status": "ACTIVE" }` atau `{ "status": "INACTIVE" }` — **enum string** (sama seperti Cabang; Layanan sekarang tidak punya mekanisme status sama sekali, lihat §0).

> Efek langsung: akun `INACTIVE` **tidak bisa login** (`403 ACCOUNT_INACTIVE`), dan **sesi yang sedang aktif langsung berhenti berfungsi** — validasi sesi mengecek status user di tiap request, jadi AGENT yang sedang memegang HP langsung dapat `401` begitu dinonaktifkan. Tidak perlu menunggu sesinya kedaluwarsa.

---

# 3. Layanan — 5 Kategori Terpisah (Haircut, Shaving, Treatment, Colouring, Chemical)

> Lihat §0 untuk ringkasan breaking change-nya. Kelima namespace di bawah **identik strukturnya** — hanya nama resource dan dua default `revenueSharing` yang beda. Contoh di bawah pakai `haircuts`; ganti nama resource untuk keempat lainnya, semua detail lain (field, validasi, status code, policy) berlaku sama.

## 3.1. GET /api/v1/haircuts — List Haircut (pola yang sama untuk /shavings, /treatments, /colourings, /chemicals)

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |

Tidak ada param search/filter. Terurut `name` (tie-breaker `_id`).

**Tidak ada lagi perbedaan isi berdasarkan role** — beda dari dokumen versi sebelumnya yang mendeskripsikan `Service` difilter `isActive` untuk AGENT. Kelima model kategori **tidak punya field `isActive` sama sekali**, jadi **HOST dan AGENT menerima katalog yang identik, seluruhnya, tanpa terkecuali** (`services/haircutService.ts#listHaircuts` tidak menerima parameter role apa pun). `pagination.total` sama untuk kedua role.

```json
{
  "success": true,
  "data": {
    "haircuts": [
      {
        "_id": "66bb22cc33dd44ee55ff6600",
        "name": "Haircut + Styling",
        "price": 100000,
        "revenueSharing": { "ownerPercentage": 50, "employeePercentage": 50 },
        "timestamp": "2026-01-05T04:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1 }
  }
}
```

Key array per resource: `haircuts`, `shavings`, `treatments`, `colourings`, `chemicals` (bukan `items`, bukan diseragamkan — konsisten dengan konvensi modul lain di `AUTH-MOBILE-API-INTEGRATION.md` §2.1.2).

### ⚠️ Ini Endpoint Paling Rawan dari Perubahan Pagination

Layar **"pilih kategori servis" saat AGENT membuat transaksi** memanggil (gabungan kelima) endpoint ini dan butuh daftar yang bisa dipilih seluruhnya. Dengan default `limit: 20`, bisnis dengan lebih dari 20 entri aktif di satu kategori akan punya entri yang **tidak bisa dipilih sama sekali** — tanpa error, tanpa indikasi apa pun di UI. Kirim `limit=100` per kategori, dan kalau `totalPages > 1` ambil halaman berikutnya sampai habis sebelum membangun daftar pilihan.

## 3.2. GET /api/v1/haircuts/:id — Detail

HOST + AGENT, `EXEMPT_AGENT`. Tidak ada lagi nuansa `isActive` untuk dipertimbangkan (§0) — kalau id-nya ada, responsnya selalu bisa diambil oleh siapa pun yang berhak baca modul ini.

## 3.3. POST /api/v1/haircuts — Tambah

**HOST only.**

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `name` | `string` | **Ya** | 1–100 karakter |
| `price` | `number` | **Ya** | ≥ 0 |
| `revenueSharing` | `object` | **Tidak** | `{ ownerPercentage, employeePercentage }` — **boleh diomit seluruhnya**, model mengisi default |

**Default `revenueSharing` kalau diomit, beda per kategori** (PRD §5.14, keputusan 2026-11-06):

| Kategori | `ownerPercentage` default | `employeePercentage` default |
|---|---|---|
| Haircut, Shaving, Treatment | 50 | 50 |
| Colouring, Chemical | 60 | 40 |

⚠️ **Kalau `revenueSharing` dikirim, harus lengkap dua-duanya dan WAJIB berjumlah tepat 100.** Mengirim `{ "revenueSharing": { "ownerPercentage": 70 } }` saja ditolak `400` — `employeePercentage` tetap wajib ada di dalam objeknya kalau objeknya dikirim. Pelanggaran jumlah ≠ 100 juga `400`, pesan "Owner and employee percentages must total 100%." Di form Flutter, paling aman pakai **satu slider/input saja** (mis. porsi owner) lalu hitung sisanya otomatis.

**Tidak ada `serviceCode`/`description`/`category`/`durationMinutes`/`isActive`** — field-field itu tidak ada di schema manapun, dikirim pun ditolak `400` (`.strict()`).

| Status | Kapan |
|---|---|
| `201` | Sukses, body `{haircut}` |
| `400` | Validasi gagal, `revenueSharing` tidak berjumlah 100, atau field asing (termasuk field lama dari `Service`) |
| `403` | Bukan HOST |

## 3.4. PATCH /api/v1/haircuts/:id — Ubah

**HOST only.** Field: `name`, `price`, `revenueSharing` (semua optional, tapi `revenueSharing` kalau dikirim harus lengkap & total 100 — lihat §3.3).

> **Penting soal harga:** mengubah `price` **tidak mengubah transaksi lama sama sekali**. Tiap transaksi menyimpan `*Snapshot` (nama + harga + bagi hasil saat itu), jadi riwayat dan laporan tetap memakai angka lama. Perubahan harga hanya berlaku untuk transaksi baru.

### ‼️ Tidak Ada Cara Menonaktifkan atau Menghapus Entri

Beda dari `Service` lama (yang punya `PATCH .../status`) dan beda dari Cabang/Karyawan di dokumen ini: **kelima kategori servis tidak punya endpoint status maupun `DELETE` sama sekali.** Begitu sebuah haircut/shaving/dll dibuat, satu-satunya operasi yang tersedia selamanya adalah mengubah `name`/`price`/`revenueSharing` — tidak ada cara "menyembunyikan" entri lama yang sudah tidak ditawarkan lagi dari daftar pilihan AGENT. Kalau bisnis butuh "pensiunkan" sebuah layanan, satu-satunya opsi yang ada di API hari ini adalah mengubah namanya jadi sesuatu yang jelas tidak dipakai (mis. "(Tidak Dipakai) ...") — bukan solusi yang bersih, tapi itu yang tersedia sampai ada endpoint baru.

---

# 4. Subscription & Billing — `/api/v1/subscription`

**HOST only, semuanya read-only (`GET`).** Ini satu-satunya area yang tetap hidup saat langganan nunggak (`EXEMPT_ALL`).

## 4.1. Tidak Ada Endpoint "Bayar"

Tidak ada `POST` apa pun di modul ini (dikonfirmasi — tidak ada file route lain di luar 3 `GET` yang didokumentasikan di sini). Alur bayarnya:

1. Sistem (cron billing, `POST /api/v1/internal/subscriptions/run-billing-cycle`, auth pakai secret bukan session user) menerbitkan invoice **beserta QR code-nya sekaligus**.
2. App tinggal **menampilkan `qrCodeUrl` / `qrString`** yang sudah menempel di invoice.
3. HOST scan & bayar lewat aplikasi bank/e-wallet.
4. Midtrans memberi tahu backend lewat webhook (server-to-server, **tidak pernah sampai ke app**).
5. App perlu **polling** `GET /subscription` atau `GET /subscription/invoices` untuk tahu statusnya sudah `PAID`.

Jadi tombol "Bayar Sekarang" di UI = menampilkan QR, bukan memanggil endpoint.

## 4.2. GET /api/v1/subscription — Status Langganan

```json
{
  "success": true,
  "data": {
    "subscription": {
      "_id": "66ee99887766554433221100",
      "host": "66ab12cd34ef56ab78cd90bb",
      "plan": {
        "_id": "66ee00112233445566778899",
        "code": "BASIC",
        "name": "Paket Basic",
        "price": 299000,
        "currency": "IDR",
        "billingCycle": "MONTHLY",
        "graceDays": 7,
        "maxBranches": 3,
        "isActive": true
      },
      "status": "ACTIVE",
      "currentPeriodStart": "2026-10-01T00:00:00.000Z",
      "currentPeriodEnd": "2026-11-01T00:00:00.000Z",
      "graceEndsAt": null,
      "cancelledAt": null,
      "cancelReason": null
    }
  }
}
```

⚠️ **`subscription` bisa bernilai `null`** (tetap status `200`) — terjadi pada deployment yang baru di-provision dan belum punya langganan sama sekali. **Ini bukan error dan bukan berarti akses terkunci**: HOST tanpa record langganan justru diperlakukan sebagai akses penuh normal. UI harus menangani `null` sebagai "belum ada data langganan", bukan sebagai kondisi gagal bayar.

`plan` **selalu ter-populate** sebagai objek penuh (bukan ObjectId).

Arti `status`:

| `status` | Artinya |
|---|---|
| `ACTIVE` | Normal, semua fitur jalan |
| `PAST_DUE` | Invoice lewat jatuh tempo, masih dalam masa tenggang (`graceEndsAt`) — **akses sudah terkunci** |
| `EXPIRED` | Masa tenggang habis — akses terkunci |
| `CANCELLED` | Dibatalkan — akses terkunci |

Ketiga status selain `ACTIVE` memicu `402` di seluruh endpoint `ENFORCED`.

### 🔎 Temuan Audit — `currency`/`billingCycle` Punya Nilai yang Tidak Pernah Dipakai di Praktik

`SubscriptionPlan.currency` enum-nya `["IDR", "USD"]` dan `billingCycle` enum-nya `["MONTHLY", "ANNUAL"]` — keduanya benar ada di model dan logic kalkulasi periode (`lib/billing.ts#calculateNextBillingPeriod` punya cabang `ANNUAL` yang fungsional, bukan stub). **Tapi hanya satu plan yang pernah di-seed di deployment manapun sejauh ini** (`STANDARD`, `IDR`, `MONTHLY`) — jadi `USD`/`ANNUAL` secara teknis valid kalau GROOMA_ADMIN membuat plan baru dengan nilai itu, tapi belum pernah benar-benar terjadi. Jangan asumsikan app hanya akan pernah melihat `IDR`/`MONTHLY`, tapi juga jangan bangun UI khusus untuk `USD`/`ANNUAL` sebelum benar-benar dibutuhkan.

### 🔎 Temuan Audit — `maxBranches` pada `plan` Tidak Ditegakkan di Mana Pun

Field `maxBranches` ada di `SubscriptionPlan` dan muncul di response (contoh di atas), tapi **grep ke seluruh codebase tidak menemukan satu pun tempat yang membandingkan jumlah cabang HOST terhadap nilai ini** — `POST /api/v1/branches` (§1.2) tidak melakukan pengecekan apa pun terhadap `maxBranches`. HOST bisa membuat cabang ke-4, ke-5, dst. meski `plan.maxBranches: 3`, dan tidak akan ada error apa pun. **Jangan bangun validasi di sisi Flutter yang mengasumsikan backend akan menolak cabang melebihi `maxBranches`** — kalau mau ditegakkan, itu perlu dibangun dulu di backend. Field ini aman ditampilkan sebagai informasi ("maks N cabang sesuai paket Anda"), tapi tidak aman dijadikan dasar validasi keras di app karena backend sendiri tidak menegakkannya.

### ⚠️⚠️ Temuan Audit Paling Signifikan — Transisi `ACTIVE` → `PAST_DUE` Tidak Pernah Terjadi Otomatis di Kode Saat Ini

**Ini bukan soal API contract, tapi soal ekspektasi behavior yang mobile team perlu tahu sebelum QA skenario "subscription lapsed".** Ditemukan lewat `grep` langsung, bukan asumsi:

- `lib/billing.ts` punya fungsi `determineSubscriptionStatus()` dan `calculateGracePeriodEnd()` yang **dirancang** untuk menghitung transisi ke `PAST_DUE` dan `graceEndsAt` — tapi **keduanya tidak dipanggil dari mana pun** di seluruh codebase (hanya didefinisikan, nol pemanggil).
- Satu-satunya tempat string `"PAST_DUE"` **ditulis** (bukan sekadar dibaca/dibandingkan) adalah filter query di `expireOverdueSubscriptions()` (`billingService.ts`) — fungsi ini **mencari** subscription yang **sudah** `PAST_DUE` untuk dinaikkan ke `EXPIRED`, tapi tidak ada kode lain yang pernah **membuat** sebuah subscription menjadi `PAST_DUE` di tempat pertama.
- `graceEndsAt` hanya pernah **di-clear** (`= undefined`, saat invoice lunas) — tidak pernah **di-set** ke tanggal apa pun di seluruh codebase.
- Konsekuensinya: cron billing (`run-billing-cycle`) setiap kali jalan akan terus menerbitkan **invoice baru** untuk subscription yang `status`-nya masih `ACTIVE` dan `currentPeriodEnd`-nya sudah lewat — karena tidak ada mekanisme yang pernah menurunkan status itu dari `ACTIVE`. QR code invoice kadaluwarsa dalam ~15 menit (`expiresAt`), tapi subscription-nya sendiri **tetap terbaca `ACTIVE` tanpa batas waktu** kalau HOST tidak pernah membayar — bukan berpindah ke `PAST_DUE` seperti yang digambarkan tabel di atas dan di `MOBILE-BOTTOM-NAVBAR.md`.

**Status pending — belum bisa dipastikan apakah ini gap yang disengaja atau belum selesai dikerjakan.** Yang pasti dan sudah terverifikasi: skenario "402 lockout karena invoice tidak dibayar" **tidak akan muncul secara organik lewat penggunaan normal** di kode saat ini — satu-satunya jalur yang pasti menghasilkan `PAST_DUE`/`EXPIRED`/`CANCELLED` adalah override manual lewat backend admin (`PATCH /admin/subscriptions/:id/status`, di luar backend ini — PRD §3.6/§7.11). **Rekomendasi untuk QA mobile:** kalau perlu menguji tampilan layar blocker/402 di app, minta status di-override manual lewat backend admin, jangan menunggu skenario "biarkan invoice kadaluwarsa" terjadi sendiri — kemungkinan besar tidak akan pernah berubah status.

## 4.3. GET /api/v1/subscription/invoices — Riwayat Invoice

| Param | Default | Catatan |
|---|---|---|
| `page` | `1` | |
| `limit` | `20` (maks 100) | |
| `status` | — | `PENDING\|PAID\|FAILED\|EXPIRED\|REFUNDED`. Diterapkan ke query (bukan dibuang) |

Konsekuensi: **`pagination.total` ikut mengikuti filter `status`.** `?status=PAID` mengembalikan `total` = jumlah invoice `PAID` saja, bukan jumlah seluruh invoice.

Nilai di luar enum ditolak `400`.

```json
{
  "success": true,
  "data": {
    "invoices": [
      {
        "_id": "66ff11223344556677889900",
        "subscription": "66ee99887766554433221100",
        "host": "66ab12cd34ef56ab78cd90bb",
        "invoiceCode": "INV-202610-000001",
        "periodStart": "2026-10-01T00:00:00.000Z",
        "periodEnd": "2026-11-01T00:00:00.000Z",
        "amount": 299000,
        "status": "PENDING",
        "dueAt": "2026-11-08T00:00:00.000Z",
        "paidAt": null,
        "provider": "MIDTRANS",
        "providerOrderId": "GRM-SUB-202610-000001",
        "qrCodeUrl": "https://api.midtrans.com/v2/qris/.../qr-code",
        "qrString": "00020101021226...",
        "expiresAt": "2026-11-08T00:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 4, "totalPages": 1, "pages": 1 }
  }
}
```

⚠️ **`dueAt` vs `expiresAt` — jangan disamakan.** `dueAt` dihitung `+3 hari` dari saat invoice dibuat (hardcoded di `generateSubscriptionInvoice`, belum membaca `plan.graceDays`), tapi `expiresAt` (kadaluwarsa QR Midtrans) hanya `+15 menit`. **Jendela bayar yang sebenarnya jauh lebih pendek dari yang tersirat `dueAt`.** Kalau app menampilkan hitung mundur ke HOST, pakai `expiresAt` untuk urgensi QR, bukan `dueAt` — dan tampilkan dengan jelas bahwa QR yang sudah kadaluwarsa butuh invoice baru (lihat temuan di §4.2 soal kapan invoice baru benar-benar diterbitkan).

### `totalPages` dan `pages` — Dua Key, Nilai Sama

| Key | Status | Pakai? |
|---|---|---|
| `totalPages` | Standar, sama seperti seluruh endpoint lain | ✅ **Pakai ini** |
| `pages` | Nama lama, **deprecated** | ❌ Jangan dipakai di kode baru |

### Kalau HOST Belum Punya Langganan

Response tetap `200` dengan `invoices: []`. Objek `pagination`-nya memantulkan `page`/`limit` yang app kirim.

## 4.4. GET /api/v1/subscription/invoices/:id — Detail Invoice

### 🐛🐛 ENDPOINT INI MASIH RUSAK — SELALU `403` (diverifikasi ulang 2026-11-10, bug belum diperbaiki)

**Jangan dipakai, dan jangan buang waktu men-debug sisi Flutter kalau endpoint ini balas `403`** — penyebabnya di backend, bukan di app. Dicek langsung ke `services/billingService.ts#getInvoiceById` dan `app/api/v1/subscription/invoices/[id]/route.ts` hari ini — bug-nya **masih ada, persis seperti sebelumnya**:

`getInvoiceById` memanggil `.populate("subscription").lean()` — ini membuat `invoice.subscription` menjadi **objek penuh** (bukan ObjectId/string). Route kemudian membandingkan `String(invoice.subscription) !== String(subscription._id)`. `String()` pada sebuah plain object mengembalikan literal `"[object Object]"`, yang **tidak akan pernah cocok** dengan string id asli — untuk siapa pun, termasuk pemilik sah invoice tersebut. Hasilnya `403 FORBIDDEN` di semua kasus. Belum ada test yang meng-cover route ini.

**Workaround:** semua data yang dibutuhkan untuk menampilkan dan membayar invoice (`amount`, `status`, `dueAt`, `qrCodeUrl`, `qrString`, `expiresAt`) **sudah lengkap tersedia di response list** (§4.3). Tampilkan halaman detail invoice dari item list yang sudah di-fetch, jangan panggil endpoint ini.

Perilaku yang *seharusnya* (setelah diperbaiki nanti): `200` dengan `{invoice}`, `403` kalau invoice milik HOST lain, `404` kalau invoice/langganan tidak ada.

---

## 5. Status Code — Ringkasan

| Status | `error.code` | Kapan |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema, timezone bukan IANA, `revenueSharing` tidak lengkap/≠ 100, role↔branch dilanggar, branch tidak ada |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Cabang/Karyawan/kelima Layanan saat langganan lapsed — **tidak pernah** di endpoint Subscription. Lihat juga temuan audit §4.2 soal `PAST_DUE` yang jarang/tidak pernah tercapai otomatis |
| `403` | `FORBIDDEN` | Bukan HOST; AGENT akses cabang lain; **plus bug di §4.4** |
| `404` | `NOT_FOUND` | Resource tidak ada (termasuk akun platform internal yang disembunyikan) |
| `409` | `CONFLICT` | `branchCode` / `username` duplikat |
| `500` | `INTERNAL_ERROR` | |

---

## 6. Catatan Implementasi Flutter

- **Jangan pakai satu widget "toggle status" generik untuk semua resource** — Cabang & Karyawan pakai `{status: "ACTIVE"|"INACTIVE"}`; kelima kategori Layanan **tidak punya mekanisme status sama sekali** (§0, §3.4). Bikin pemetaan eksplisit, dan untuk Layanan jangan render tombol toggle apa pun.
- **Model Dart tidak bisa seragam soal id maupun timestamp** — Karyawan pakai `id` + `createdAt`/`updatedAt`; Cabang/Subscription/Invoice pakai `_id` + `createdAt`/`updatedAt`; **Layanan pakai `_id` + `timestamp` tunggal** (§0 poin 2–3).
- **Hapus logic pemilihan katalog layanan berdasarkan role** — versi dokumen sebelumnya mengharuskan AGENT hanya melihat entri `isActive: true`. Itu sudah tidak berlaku: kelima model kategori tidak punya `isActive`, HOST dan AGENT selalu melihat katalog yang identik (§3.1).
- **Satu model Dart per kategori, atau satu model generik dipakai lima kali** — kelima kategori strukturnya identik (`name`, `price`, `revenueSharing`, `timestamp`), hanya endpoint dan dua default `revenueSharing` yang beda (§3.3).
- **‼️ Keempat grup list (Cabang/Karyawan/Layanan ×5/Invoice) berpaginasi, default 20 baris** — audit setiap layar sebelum rilis; tidak ada error yang akan memberi tahu kalau daftarnya terpotong.
- **Prioritas tertinggi: picker kategori servis di alur buat transaksi** (§3.1) dan **picker cabang di form karyawan** (§1.1). Kirim `limit=100` + ambil halaman lanjutan kalau `totalPages > 1`.
- **Form tambah karyawan: role menentukan field cabang** (§2.2) — AGENT wajib cabang, HOST wajib tanpa cabang.
- **Form Layanan: satu input porsi bagi hasil, bukan dua** (§3.3) — hitung sisanya otomatis supaya total selalu 100. `revenueSharing` boleh diomit total untuk pakai default kategori.
- **Jangan bikin layar reset password karyawan** (§2.4) — endpoint-nya tidak ada sama sekali. Tapi **ganti password sendiri MEMANG mencabut sesi lain** — tampilkan itu sebagai info ke user kalau relevan ("perangkat lain akan logout").
- **Jangan panggil `GET /subscription/invoices/:id`** (§4.4) — masih rusak per 2026-11-10; render detail dari data list.
- **Jangan bangun validasi client-side yang menolak cabang ke-N+1 berdasarkan `plan.maxBranches`** (§4.2) — backend sendiri tidak menegakkannya, validasi di app akan lebih ketat dari backend-nya sendiri dan bisa menyesatkan user.
- **Untuk QA skenario "subscription lapsed"**: jangan andalkan invoice yang dibiarkan kadaluwarsa untuk memicu `PAST_DUE` secara alami (§4.2) — minta override manual lewat backend admin.
- **Tangani `subscription: null`** sebagai keadaan normal, bukan error (§4.2).

---

## 7. Pending / Belum Bisa Dipastikan dari Audit Ini

- **Apakah transisi `ACTIVE → PAST_DUE` yang tidak pernah terpanggil (§4.2) adalah gap yang belum dikerjakan atau desain yang disengaja (mis. menunggu keputusan produk soal mekanisme dunning) — tidak bisa dipastikan hanya dari membaca kode.** Ditandai sebagai temuan, bukan diasumsikan salah satu arah. Kalau mobile team butuh kepastian sebelum membangun UI blocker, ini pertanyaan untuk tim backend/produk, bukan sesuatu yang bisa dijawab dari sisi dokumentasi integrasi.
- **`GET /subscription/invoices/:id` (§4.4)** bukan item pending — ini bug terkonfirmasi, bukan spesifikasi yang belum ada. Dicatat di sini juga supaya tidak terlewat saat membaca ringkasan.
- Tidak ditemukan blocker lain di luar dua hal di atas untuk modul Cabang, Karyawan, dan Layanan — seluruh endpoint, schema, dan service function diverifikasi langsung dari kode yang sudah berjalan.
