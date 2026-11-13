# Integrasi Mobile (Flutter) — Grooma API — Modul Customer

> Dokumen ini khusus modul **Customer**. Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2. Kontrak pagination juga tidak diulang — lihat bagian 2.1 dokumen yang sama.

> **Diperbarui penuh berdasarkan audit langsung ke kode** (`models/Customer.ts`, `validations/customerSchema.ts`, `services/customerService.ts`, `app/api/v1/customers/**`) — bukan disalin dari versi dokumen sebelumnya. Setiap klaim di dokumen ini bisa ditelusuri balik ke salah satu file itu.

---

## 0. ⚠️ Breaking Change — Struktur Customer Dirombak (PRD §5.3, dieksekusi 2026-11-08)

**Field yang dihapus total dari model** — bukan disembunyikan, benar-benar tidak ada lagi. Kalau client lama masih mengirim salah satu ini di `POST`/`PATCH`, sekarang ditolak `400 VALIDATION_ERROR` (schema `.strict()`), bukan diabaikan secara diam-diam:

`customerCode`, `email`, `gender`, `birthDate`, `address`, `notes`, `customerType`, `lastVisitAt`

**Field baru, menggantikan field privasi di atas:**

| Field | Tipe | Catatan |
|---|---|---|
| `cityFrom` | `string`, optional, maks 100 | Kota asal customer — bukan alamat lengkap |
| `age` | `integer` ≥ 0, optional | Umur — bukan tanggal lahir |
| `busyness` | `string` bebas, optional, maks 500 | Deskripsi naratif ketersediaan/kesibukan customer. **Teks bebas tanpa enum/format** — bukan boolean, bukan angka, bukan pilihan tetap |

**Perubahan paling besar untuk app: tidak ada lagi perbedaan response berdasarkan role.** Versi dokumen ini yang lama punya section yang menjelaskan AGENT tidak pernah menerima `email`/`gender`/`birthDate`/`address`/`notes` di response manapun, sementara HOST menerima semuanya. **Itu sudah sepenuhnya tidak berlaku.** Kelima field itu sudah tidak ada di model untuk siapa pun, dan `cityFrom`/`age`/`busyness` yang menggantikannya dikonfirmasi **tidak dibatasi perannya** (PRD §5.3: "AGENT dan HOST menerima bentuk response Customer yang identik"). Di kode, `serializeCustomer()` di `services/customerService.ts` bahkan sudah tidak menerima parameter `role` sama sekali — tidak ada lagi field Customer yang bisa dibedakan per role.

**Kalau app punya 2 model Dart (HOST-view vs AGENT-view) atau logic apa pun yang mem-parsing response Customer berbeda berdasarkan role yang login, itu harus dihapus — satu model cukup untuk kedua role sekarang.**

**Tidak berubah** — aman dipertahankan dari implementasi lama:
- `name`, `phone`, `isActive`, `loyaltyPoints` — tipe, aturan, dan perilakunya identik seperti sebelumnya.
- Customer tetap tidak terikat cabang sama sekali (§1 di bawah).
- Normalisasi & dedupe nomor HP saat search & create (§3.1, §4 di bawah).
- Kontrak pagination `GET /customers` (lihat `AUTH-MOBILE-API-INTEGRATION.md` §2.1) — ini berubah di Phase 9 (2026-10-19), **sebelum** restrukturisasi field ini, dan tidak tersentuh oleh perubahan field.
- Perilaku "`201` tidak selalu berarti record baru" saat create (§4 di bawah).

**Tidak ada migrasi data untuk customer lama** (dikonfirmasi final, PRD §5.3) — dokumen `Customer` yang dibuat sebelum perubahan ini masih menyimpan field lama secara fisik di database, tapi Mongoose mengabaikannya total (tidak error, tidak terbaca, tidak pernah muncul di response). Tidak ada aksi yang perlu dilakukan dari sisi app untuk ini — API-nya sendiri sudah konsisten untuk data lama maupun baru.

---

## 1. Hal yang Tetap Beda dari Modul Lain

**Customer TIDAK terikat cabang sama sekali.** Tidak ada field `branch` di `models/Customer.ts`, dan tidak ada satu pun pemanggilan `requireBranchAccess` di ketiga route handler modul ini (beda dari Transaksi/Inventaris yang selalu memvalidasi cabang). Semua customer **dibagi lintas cabang** dalam satu bisnis — AGENT dari cabang manapun bisa lihat & edit customer yang sama, bukan cuma customer "milik" cabangnya.

---

## 2. Ringkasan

| Method | Endpoint | Role | Subscription Policy |
|---|---|---|---|
| GET | `/api/v1/customers` | HOST, AGENT | `EXEMPT_AGENT` |
| POST | `/api/v1/customers` | HOST, AGENT | `EXEMPT_AGENT` |
| GET | `/api/v1/customers/:id` | HOST, AGENT | `EXEMPT_AGENT` |
| PATCH | `/api/v1/customers/:id` | HOST, AGENT | `EXEMPT_AGENT` |
| PATCH | `/api/v1/customers/:id/status` | **HOST only** | `ENFORCED` (default) |

4 dari 5 endpoint `EXEMPT_AGENT` (`lib/authorization.ts`) — AGENT tetap bisa cari/buat/lihat/edit customer meski subscription HOST-nya nunggak, bagian dari alur melayani customer yang sedang di tempat (PRD §23.4.1). Mengaktifkan/nonaktifkan customer murni keputusan administratif HOST, tidak dikecualikan — detail urutan 402/403-nya ada di §7.

**Endpoint terkait (di luar modul ini):** `GET /api/v1/employees` — dibutuhkan bersama picker customer saat membuat transaksi. Didokumentasikan di `TRANSACTION-MOBILE-API-INTEGRATION.md §0` dan diringkas di §10 dokumen ini.

---

## 3. GET /api/v1/customers — Cari/List Customer

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |
| `search` | `string` | — | Maks 100 karakter. Cocok ke `name` (regex, case-insensitive) **atau** `phone` (lihat normalisasi di §3.1) |

Terurut alfabetis berdasarkan `name` (tie-breaker `_id`, jadi urutannya stabil antar halaman — `stableSort({ name: 1 })` di `services/customerService.ts`). Kontrak pagination lengkapnya di `AUTH-MOBILE-API-INTEGRATION.md` §2.1.

**Dua catatan kompatibilitas `search` (berlaku sejak Phase 9, tidak tersentuh restrukturisasi field):**

1. **`?search=` kosong tetap berarti "tanpa filter"**, bukan `400` — schema query-nya (`listCustomersQuerySchema`) men-transform string kosong jadi `undefined`. Search box yang dikosongkan user aman mengirim string kosong. *(Catatan: `/inventory` dan `/transactions` justru menolak `?search=` kosong dengan `400` — beda perilaku, jangan diasumsikan seragam antar modul.)*
2. **`search` dibatasi 100 karakter** (`400` kalau lebih).

**Rekomendasi UI:** desain search-first dengan debounce 2–3 karakter. "Browse semua customer" bisa dilakukan lewat infinite scroll (`page` naik sampai `page >= totalPages`) — pakai `pagination.total` untuk menampilkan jumlah hasil, bukan `customers.length`.

### 3.1. Normalisasi Nomor HP — Tidak Perlu Dilakukan di Client

Backend otomatis mencocokkan varian format nomor Indonesia saat `search` maupun saat deteksi duplikat di create (§4): `0812xxxxxxx`, `62812xxxxxxx`, dan `+62812xxxxxxx` dianggap **nomor yang sama** (`normalizePhone`/`phoneVariants` di `services/customerService.ts`). Kirim apa adanya dari input user, tidak perlu normalisasi manual di Flutter sebelum search/create.

### Response `200 OK`

**Bentuk response, identik untuk HOST maupun AGENT** (lihat §0 — tidak ada lagi perbedaan per role):

```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "66aa11bb22cc33dd44ee55ff",
        "name": "Andi Wijaya",
        "cityFrom": "Bandung",
        "age": 29,
        "busyness": "Biasanya available siang hari kerja",
        "phone": "6281234567890",
        "loyaltyPoints": 450,
        "isActive": true,
        "createdAt": "2026-01-10T08:00:00.000Z",
        "updatedAt": "2026-10-10T09:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1340, "totalPages": 67 }
  }
}
```

`cityFrom`/`age`/`busyness` muncul sebagai `null` (bukan absen) kalau belum pernah diisi — berbeda dari field lama yang dihapus total (§0), field-field baru ini **selalu ada sebagai key**, nilainya saja yang bisa `null`. Aman dimodelkan sebagai field nullable non-absen di Dart.

---

## 4. POST /api/v1/customers — Buat Customer

### Request Body

```json
{
  "name": "Siti Rahma",
  "phone": "081298765432",
  "cityFrom": "Jakarta",
  "age": 34,
  "busyness": "Sering available weekend"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `name` | `string` | **Ya** | 1–100 karakter |
| `phone` | `string` | Tidak | Maks 32 karakter |
| `cityFrom` | `string` | Tidak | Maks 100 karakter |
| `age` | `integer` | Tidak | ≥ 0, tidak ada batas atas di validasi |
| `busyness` | `string` | Tidak | Maks 500 karakter, teks bebas |

Schema **strict** (`createCustomerSchema` di `validations/customerSchema.ts`). `loyaltyPoints` **tidak ada di schema manapun** (create/update) — tidak bisa diset langsung lewat API ini sama sekali, hanya berubah lewat mekanisme transaksi (credit otomatis saat transaksi lunas, reverse saat dibatalkan).

### ⚠️ `201` Tidak Selalu Berarti Record Baru

Kalau `phone` yang dikirim cocok dengan customer yang **sudah ada** (termasuk kalau beda format penulisan, lihat §3.1), backend **mengembalikan customer yang sudah ada itu** — tetap dengan status `201`, bukan `409`/`200`. Jangan asumsikan response `201` dari endpoint ini selalu berisi data kosong/baru sesuai yang baru diketik — cek dulu apakah `name`/field lain di response sama dengan yang baru diketik user; kalau beda, berarti itu match ke customer lama.

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Berhasil dibuat **atau** cocok ke customer existing by phone (lihat di atas) |
| `400` | `VALIDATION_ERROR` | `name` kosong, field asing (termasuk field lama yang sudah dihapus, lihat §0), `age` negatif/bukan integer, dll |
| `402` | `PAYMENT_REQUIRED` | Hanya bisa kena HOST — endpoint ini `EXEMPT_AGENT` |
| `403` | `FORBIDDEN` | Bukan HOST/AGENT |

---

## 5. GET /api/v1/customers/:id — Detail Customer

Bentuk response sama seperti satu item di `customers[]` pada §3, dibungkus `{ customer: {...} }`. Identik untuk HOST maupun AGENT (§0).

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `402` | `PAYMENT_REQUIRED` — hanya bisa kena HOST (endpoint ini `EXEMPT_AGENT`) |
| `403` | Bukan HOST/AGENT (**tidak ada** pengecekan cabang — siapa pun HOST/AGENT bisa lihat customer manapun, §1) |
| `404` | Customer tidak ditemukan |

---

## 6. PATCH /api/v1/customers/:id — Update Customer

### Request Body (semua optional, field sama seperti create)

| Field | Tipe |
|---|---|
| `name` | `string`, 1–100 |
| `phone` | `string`, maks 32 |
| `cityFrom` | `string`, maks 100 |
| `age` | `integer` ≥ 0 |
| `busyness` | `string`, maks 500 |

Schema **strict** juga (`updateCustomerSchema`) — kirim field lama yang sudah dihapus (§0) akan ditolak `400`, bukan diabaikan.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{customer}` |
| `400` | `VALIDATION_ERROR` | Field tidak sesuai schema |
| `402` | `PAYMENT_REQUIRED` | Hanya bisa kena HOST (endpoint ini `EXEMPT_AGENT`) |
| `403` | `FORBIDDEN` | Bukan HOST/AGENT |
| `404` | `NOT_FOUND` | Customer tidak ditemukan |

---

## 7. PATCH /api/v1/customers/:id/status — Aktifkan/Nonaktifkan

**HOST only.** Satu-satunya endpoint di modul ini yang AGENT tidak bisa akses dengan sukses, sesuai PRD §3.2 ("AGENT ... kecuali nonaktifkan status").

### Request Body

```json
{ "isActive": false }
```

| Field | Tipe | Wajib |
|---|---|---|
| `isActive` | `boolean` | **Ya** |

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{customer}` |
| `400` | `VALIDATION_ERROR` | `isActive` tidak dikirim/bukan boolean |
| `402` | `PAYMENT_REQUIRED` | Lihat catatan presedensi di bawah — **ini beda dari 4 endpoint lain di modul ini** |
| `403` | `FORBIDDEN` | Bukan HOST (dan subscription tidak sedang lapsed — lihat catatan di bawah) |
| `404` | `NOT_FOUND` | Customer tidak ditemukan |

**⚠️ Catatan presedensi 402 vs 403 — ditemukan saat audit kode, koreksi dari versi dokumen sebelumnya.** Endpoint ini pakai policy `ENFORCED` (default), bukan `EXEMPT_AGENT` seperti 4 endpoint lain di modul ini. Di `app/api/v1/customers/[id]/status/route.ts`, urutan pemanggilannya adalah `requireAuth()` (termasuk cek subscription) **dulu**, baru `requireRole(user, ["HOST"])`. Konsekuensinya: **kalau subscription HOST sedang `PAST_DUE`/`EXPIRED`/`CANCELLED` dan AGENT (keliru) memanggil endpoint ini, response-nya `402 PAYMENT_REQUIRED` — bukan `403 FORBIDDEN`.** Urutan "403 duluan" hanya benar selama subscription HOST aktif atau belum pernah dibuat. App tidak perlu menangani ini secara khusus di UI (hasil akhirnya AGENT tetap tidak bisa mengaktifkan/nonaktifkan customer apa pun status code-nya) — ini murni koreksi presisi dokumentasi.

Tidak ada efek lanjutan otomatis ke transaksi lama milik customer ini — menonaktifkan customer tidak mengubah riwayat transaksinya. Efeknya baru terasa ke depan: transaksi baru tidak bisa dibuat dengan customer yang `isActive: false` (lihat `TRANSACTION-MOBILE-API-INTEGRATION.md` §1 — `422 "Customer is not available."`; dokumen itu sendiri belum diperbarui untuk restrukturisasi kategori servis/employee Phase 10–11, di luar scope audit ini).

---

## 8. Status Code — Ringkasan

| Status | `error.code` | Catatan |
|---|---|---|
| `400` | `VALIDATION_ERROR` | |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Di 4 endpoint `EXEMPT_AGENT` (§2), hanya bisa kena HOST. Di `PATCH .../status` (`ENFORCED`, §7), bisa kena HOST **atau** AGENT kalau subscription HOST sedang lapsed — lihat catatan presedensi di §7 |
| `403` | `FORBIDDEN` | Role salah — **tidak pernah karena beda cabang**, modul ini tidak kenal konsep cabang (§1) |
| `404` | `NOT_FOUND` | |
| `500` | `INTERNAL_ERROR` | |

---

## 9. Catatan Implementasi Flutter

- **Hapus logic/model Dart yang membedakan response Customer per role** (§0) — kalau ada 2 varian model (HOST-view vs AGENT-view) dari implementasi sebelumnya, konsolidasikan jadi satu. Tidak ada lagi field yang absen tergantung siapa yang login.
- **Satu model Dart untuk Customer, dengan `cityFrom`/`age`/`busyness` nullable** (§0, §3) — ketiganya optional di create/update dan bisa `null` di response, tapi **selalu ada sebagai key** (beda dari field lama yang benar-benar absen sebelum restrukturisasi ini).
- **Form create/edit customer: ganti field `email`/`gender`/`birthDate`/`address`/`notes` dengan `cityFrom`/`age`/`busyness`** — field lama akan ditolak `400` kalau masih dikirim (§0). Ini breaking change murni di layer form, bukan sekadar field tambahan.
- **Endpoint list (§3) tetap berpaginasi, default 20 baris** — perilaku ini dari Phase 9 (2026-10-19), tidak berubah oleh restrukturisasi field. Infinite scroll berhenti saat `page >= totalPages`; tampilkan jumlah hasil dari `pagination.total`, bukan `customers.length`.
- **Search box boleh tetap mengirim string kosong** saat dikosongkan user (§3) — backend menganggapnya "tanpa filter". Tambahkan `maxLength: 100` di field-nya.
- **Jangan asumsikan `201` dari create = data kosong baru** — selalu render response-nya, bukan input form-nya, karena bisa saja backend mengembalikan customer lama yang sudah match by phone (§4).
- **Tidak perlu filter berdasarkan cabang di UI manapun untuk modul ini** (§1) — AGENT di sini melihat seluruh basis customer bisnis, bukan cuma cabangnya. **Ini berbeda dari picker employee** (`GET /api/v1/employees`) yang secara otomatis dibatasi ke cabang AGENT yang login — dua perilaku berbeda untuk dua entitas berbeda.
- **Endpoint status (§7) bisa balas `402` untuk AGENT juga**, bukan cuma HOST — kalau app punya penanganan error generik per status code (bukan per endpoint), ini sudah otomatis tertangani; kalau ada logic yang berasumsi "402 di modul Customer = pasti HOST", perbaiki asumsinya.
- **Picker customer di layar Buat Transaksi harus diinisialisasi paralel dengan picker employee** — keduanya dibutuhkan sebelum form bisa disubmit. Panggil `GET /customers?limit=20` dan `GET /employees?limit=100` secara bersamaan (`Future.wait`). Customer bersifat search-first (debounce), employee di-fetch sekali di awal. Detail alur di §10.

---

## 10. Relasi Customer ↔ Employee ↔ Transaksi (Phase 13 ✅)

> Phase 13 (diimplementasikan 2026-11-10) menyelesaikan blocker yang sebelumnya tercatat di `TRANSACTION-MOBILE-API-INTEGRATION.md §0`: endpoint `GET /api/v1/employees` sekarang tersedia dan harus menjadi sumber data untuk picker `employeeId` di layar buat transaksi. Bagian ini menjelaskan keterkaitan modul Customer dengan alur tersebut dari sudut pandang Customer API.

### 10.1. Alur Pembuatan Transaksi — Ketiga Entitas

Satu transaksi menghubungkan tiga entitas utama:

| Entitas | Field di `Transaction` | Sumber data untuk picker |
|---|---|---|
| **Customer** | `customer` (optional, ObjectId → Customer) | `GET /api/v1/customers` (modul ini, §3) |
| **Employee** | `employee` (wajib, ObjectId → Employee) | `GET /api/v1/employees` (endpoint baru Phase 13) |
| **Agent (kasir)** | `agent` (otomatis dari sesi) | Tidak perlu picker — diambil dari session cookie |

Layar \"Buat Transaksi\" di Flutter harus mengambil data kedua endpoint di atas **sebelum form bisa diisi lengkap**:

```
// Inisialisasi layar — dua fetch paralel
Future.wait([
  GET /api/v1/customers?limit=20,     // paginasi — search-first dengan debounce
  GET /api/v1/employees?limit=100,    // ambil semua employee aktif di cabang
])
```

### 10.2. Endpoint Daftar Employee — Ringkasan untuk Konteks Transaksi

Endpoint lengkap didokumentasikan di `TRANSACTION-MOBILE-API-INTEGRATION.md §0`. Ringkasan dari sudut pandang relasi customer–employee–transaksi:

```
GET /api/v1/employees
```

**Auth:** Session cookie wajib. Policy `EXEMPT_AGENT` (sama seperti endpoint Customer di §2 — AGENT tetap bisa akses meski subscription HOST nunggak).

**Query params relevan:**

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` — untuk picker, kirim `limit=100` |
| `branchId` | `string` | — | **HOST only** — AGENT: diabaikan secara diam-diam |

**Scoping (berbeda dari Customer — employee IS branch-scoped):**

- **AGENT** → response dibatasi ke cabang AGENT yang login (`user.branch` dari sesi). Parameter `branchId` diabaikan secara diam-diam — tidak ada cara AGENT mengintip employee cabang lain. **Ini berbeda dari Customer (§1) yang tidak terikat cabang sama sekali.**
- **HOST tanpa `branchId`** → semua cabang.
- **HOST dengan `branchId`** → difilter ke cabang tersebut.
- Filter `employmentStatus: "ACTIVE"` **selalu diterapkan di server** — employee `RESIGNED`/`SUSPENDED` tidak pernah muncul.

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "_id": "66cc33dd44ee55ff66007711",
        "name": "Budi Santoso",
        "branch": { "_id": "66ffaa0011223344556677aa", "name": "Grooma Central" },
        "employmentStatus": "ACTIVE"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
  }
}
```

**Field yang TIDAK ADA di response ini** (tidak pernah terekspos): `compensation.*`, `joinedAt`, `resignedAt`, `username`, `password`, `role`, `status`.

**Status code:**

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `400` | `page`/`limit` di luar rentang |
| `401` | Tidak terautentikasi |
| `402` | HOST dengan subscription lapsed (AGENT tidak pernah kena ini di endpoint ini) |
| `403` | Bukan HOST atau AGENT |

### 10.3. Customer di Response Transaksi

Ketika transaksi dibuat dengan `customerId`, field `customer` di response transaksi berbentuk berbeda tergantung endpoint:

| Endpoint | Bentuk `customer` |
|---|---|
| `POST /transactions` (create) | ObjectId mentah (string) — tidak populated |
| `GET /transactions` (list) | `{ "_id": "...", "name": "Andi Wijaya", "phone": "08123456789" }` atau `null` |
| `GET /transactions/:id` (detail) | Sama seperti list |
| `GET /transactions/:id/receipt` | Sama seperti list |

Field yang di-populate dari Customer di response transaksi (`_id`, `name`, `phone`) **tidak termasuk field yang dihapus di Phase 12** (`email`, `gender`, dst.) — sehingga perubahan Phase 12 **tidak memengaruhi** bentuk `customer` di response transaksi.

> **`cityFrom`/`age`/`busyness` tidak pernah muncul di response transaksi** — populate transaksi hanya mengambil `_id`, `name`, dan `phone` dari Customer. Untuk menampilkan detail lengkap customer dari sebuah transaksi, panggil `GET /customers/:id` (§5) secara terpisah.

### 10.4. `employeeId` di Request Transaksi — Validasi Backend

Saat `POST /transactions`, `employeeId` divalidasi **3 syarat sekaligus** di `services/transactionService.ts`:

1. Employee dengan `_id` tersebut ada di database.
2. `employmentStatus: "ACTIVE"` — employee yang sudah resigned/suspended tidak bisa dipilih.
3. `branch` employee sama dengan cabang AGENT yang login.

Kegagalan salah satu syarat → `422 BUSINESS_RULE_VIOLATION`: `"Employee is not available for this branch."`. Karena picker employee di Flutter menggunakan `GET /api/v1/employees` yang sudah memfilter `ACTIVE` dan branch-scoped, error 422 ini hanya bisa terjadi kalau ada race condition (employee dinonaktifkan tepat di antara fetch picker dan submit form).

---

## 11. Belum Diperiksa / Di Luar Scope Audit Ini

Tidak ditemukan blocker atau spesifikasi yang belum tersedia untuk modul Customer sendiri — seluruh endpoint, schema, dan service function di atas diverifikasi langsung dari kode yang sudah dieksekusi penuh (PLAN-GROOMA.md Phase 12 ✅, Phase 13 ✅). Dua hal berikut **disengaja** tidak disentuh karena di luar cakupan modul Customer:

- **`TRANSACTION-MOBILE-API-INTEGRATION.md`** — sudah diperbarui penuh untuk Phase 10 (`employeeId` wajib), Phase 11 (5 kategori servis), dan Phase 13 (`GET /api/v1/employees`). Referensi silang di §10 dokumen ini mengacu ke versi terbarunya.
- **Migrasi data customer lama** — sudah diputuskan final (tidak ada migrasi, §0), bukan item pending.
