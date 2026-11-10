# Integrasi Mobile (Flutter) — Grooma API — Modul Transaksi (POS Core)

> Dokumen ini khusus **POS core**: create, list, detail, complete, cancel, receipt — plus dua endpoint `/payments/*` pendukung yang dibutuhkan untuk menuntaskan alur QRIS. Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2.
>
> **Di luar scope dokumen ini:** alur pengajuan & approval koreksi transaksi (`/transactions/:id/change-requests`, `/transaction-change-requests/*`) — itu di `docs/TRANSACTION-CHANGE-REQUESTS-MOBILE-API-INTEGRATION.md`.

> **Diperbarui penuh berdasarkan audit langsung ke kode** (`models/Transaction.ts`, `validations/transactionSchema.ts`, `services/transactionService.ts`, `services/paymentService.ts`, `lib/utils.ts`, `lib/idempotency.ts`, dan seluruh route `app/api/v1/{transactions,payments}/**`) — bukan disalin dari versi dokumen sebelumnya. Versi lama ditulis **sebelum** Phase 10 (`employeeId` wajib) dan Phase 11 (Service → 5 kategori), jadi hampir seluruh bentuk request/response berubah.

---

## 0. ‼️🐛 BLOCKER — `employeeId` Wajib, Tapi Tidak Ada Endpoint untuk Mengambil Daftar Employee

**Ini bukan nuansa dokumentasi — ini menghalangi implementasi layar "Buat Transaksi" sama sekali kalau tidak diselesaikan dulu.**

Sejak Phase 10 (PRD §5.5, §5.13), `POST /transactions` **mewajibkan** field `employeeId` — merujuk ke dokumen `Employee` (siapa yang **mengerjakan** servis, beda dari `agent` yang cuma memproses penjualan di kasir). Tapi diverifikasi langsung ke kode (`grep -rn "Employee" app/api/v1/` — nol hasil di luar yang sudah disebut di sini):

- **Tidak ada `/api/v1/employees` atau endpoint apa pun untuk list/detail `Employee`.** Model `Employee` ada (`models/Employee.ts`: `user`, `branch`, `compensation`, `employmentStatus`, `joinedAt`, `resignedAt`), tapi satu-satunya kode yang membacanya adalah validasi internal saat `createTransaction` — tidak ada route HTTP yang mengeksposnya sama sekali.
- **`employee` pada response Transaction juga tidak pernah di-populate** — `services/transactionService.ts`'s `listTransactions`/`getTransactionById`/`getReceipt` semuanya memanggil `.populate("branch", ...)`, `.populate("agent", ...)`, `.populate("customer", ...)`, tapi **tidak pernah** `.populate("employee", ...)`. Field `employee` di response selalu ObjectId mentah, tidak pernah `{_id, name}`.

**Konsekuensi gabungan:** app tidak punya cara mengambil daftar employee untuk ditampilkan sebagai picker saat input transaksi, **dan** tidak punya cara menampilkan nama employee dari transaksi yang sudah dibuat — bahkan kalau id-nya didapat dari sumber lain (mis. hardcode sementara untuk testing), tidak ada endpoint untuk resolve id itu jadi nama.

**Status: pending, bukan sesuatu yang bisa diselesaikan dari sisi dokumentasi integrasi.** Ini butuh endpoint baru di backend sebelum alur create-transaction bisa benar-benar diimplementasikan di Flutter. Jangan menebak bentuk endpoint yang belum ada (mis. jangan asumsikan `GET /employees` akan berbentuk tertentu) — konfirmasi ke tim backend dulu.

---

## 1. Ringkasan

| Method | Endpoint | Role | Catatan |
|---|---|---|---|
| POST | `/api/v1/transactions` | **AGENT only** | HOST tidak bisa membuat transaksi (403). Butuh `employeeId` — lihat §0 |
| GET | `/api/v1/transactions` | HOST, AGENT | AGENT lihat **seluruh transaksi cabangnya**, bukan cuma miliknya sendiri |
| GET | `/api/v1/transactions/:id` | HOST, AGENT (cabang sendiri) | |
| POST | `/api/v1/transactions/:id/complete` | **AGENT only** | |
| POST | `/api/v1/transactions/:id/cancel` | HOST, AGENT (cabang sendiri) | |
| GET | `/api/v1/transactions/:id/receipt` | HOST, AGENT (cabang sendiri) | **Side-effect:** increment print count tiap dipanggil |
| POST | `/api/v1/payments/qris` | **AGENT only** | Buat/retry QRIS untuk transaksi yang sudah ada |
| GET | `/api/v1/payments/:id` | HOST, AGENT (cabang sendiri) | Polling status pembayaran |

**Subscription gating kedelapan endpoint di atas pakai policy `EXEMPT_AGENT`** (dikonfirmasi di setiap route handler) — beda dari modul change-request (`ENFORCED` penuh, lihat dokumen terpisah). Artinya: kalau subscription HOST nunggak, **AGENT tetap bisa jalan normal** (create/list/detail/complete/cancel/receipt/bayar) — ini sengaja, supaya customer yang sudah duduk di kursi tidak disandera tagihan HOST yang telat bayar (PRD §23.4.1). **HOST** yang hit endpoint `GET`/`cancel` di modul ini tetap kena `402` kalau nunggak.

---

## 2. POST /api/v1/transactions — Buat Transaksi

### Headers

| Header | Wajib | Value |
|---|---|---|
| `Content-Type` | Ya | `application/json` |
| Cookie `grooma_session` | Ya | — |
| `Idempotency-Key` | **Sangat disarankan, lihat §2.5** | String unik per percobaan submit (mis. UUID v4) |

### ⚠️ Breaking Change — `serviceId` Diganti 5 Field Kategori Opsional (PRD §5.14)

`serviceId` tunggal **sudah tidak ada**. Diganti lima field opsional — isi **1 sampai 5** sekaligus dalam satu transaksi (mis. haircut + shaving dalam satu kunjungan), **tidak boleh lebih dari satu id per kategori** (bukan array):

`haircutId`, `shavingId`, `treatmentId`, `colouringId`, `chemicalId`

**Minimal satu dari kelima wajib diisi** — kalau tidak ada satu pun, ditolak `400` ("At least one of haircutId, shavingId, treatmentId, colouringId, chemicalId is required.").

### Request Body

```json
{
  "customerId": "66aa11bb22cc33dd44ee55ff",
  "haircutId": "66bb22cc33dd44ee55ff6600",
  "employeeId": "66cc33dd44ee55ff66007711",
  "paymentMethod": "QRIS",
  "discountAmount": 0,
  "serviceHourType": "REGULAR"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `customerId` | `string` | Tidak | Kalau tidak dikirim, transaksi tanpa customer tercatat (`customer: null`) |
| `haircutId` | `string` | Lihat §0.1 | |
| `shavingId` | `string` | Lihat §0.1 | |
| `treatmentId` | `string` | Lihat §0.1 | |
| `colouringId` | `string` | Lihat §0.1 | |
| `chemicalId` | `string` | Lihat §0.1 | |
| `employeeId` | `string` | **Ya** | Siapa yang mengerjakan servis — **lihat blocker §0**, belum ada cara mengambil daftarnya |
| `paymentMethod` | `"CASH" \| "QRIS"` | **Ya** | |
| `discountAmount` | `number` | Tidak | Default `0`. Tidak boleh melebihi total harga kategori yang dipilih (422 kalau melebihi) |
| `serviceHourType` | `"REGULAR" \| "OVERTIME"` | Tidak | Default `"REGULAR"`. **Hanya tercatat untuk laporan, tidak memengaruhi harga sama sekali** |

Schema **strict** — field seperti `agentId`, `branchId`, `serviceId` (nama lama), `total`, `ownerRevenue`, `employeeRevenue`, `*Snapshot` **akan ditolak 400** kalau dikirim. Semua nilai itu **selalu dihitung ulang di server** dari data kategori yang live di database saat request masuk. `agent`/`branch` transaksi juga selalu diambil dari sesi login, bukan dari body — `employeeId` adalah **satu-satunya** field referensi yang memang diterima dari body (§5.5/§5.13 PRD: tidak ada cara lain bagi backend untuk tahu siapa yang mengerjakan servis).

**Setiap kategori divalidasi terpisah, pesan error beda per kategori** (`422 BUSINESS_RULE_VIOLATION`): `"Haircut is not available."` / `"Shaving is not available."` / `"Treatment is not available."` / `"Colouring is not available."` / `"Chemical is not available."` — tergantung mana yang id-nya tidak ditemukan. **Tidak ada lagi konsep "tidak aktif"** untuk kategori ini — kelima model tidak punya field `isActive` (lihat `KELOLA-MOBILE-API-INTEGRATION.md` §3), jadi satu-satunya alasan 422 di sini adalah id-nya tidak ditemukan sama sekali, bukan dinonaktifkan.

**`employeeId` tervalidasi 3 syarat sekaligus**, satu pesan error gabungan: `422 "Employee is not available for this branch."` — employee harus ada, `employmentStatus: ACTIVE`, dan berada di cabang yang sama dengan transaksi (cabang AGENT yang login).

### Cara Harga Dihitung (untuk referensi/debug, bukan sesuatu yang dihitung di client)

**Kalau tepat satu kategori terisi** (kasus paling umum, formula tidak berubah dari sebelum Phase 11):

```
subtotal        = Category.price
total           = subtotal - discountAmount
ownerRevenue    = round(total * Category.revenueSharing.ownerPercentage / 100)
employeeRevenue = total - ownerRevenue   // sisa, supaya selalu pas tanpa selisih pembulatan
pointsEarned    = floor(total / 1000)     // 1.000 IDR = 1 poin
```

**Kalau lebih dari satu kategori terisi** (`lib/utils.ts#computeMultiCategoryPricing`), formulanya beda secara mendasar:

```
subtotal        = sum(setiap Category.price)
total           = subtotal - discountAmount
// Tiap kategori hitung bagi hasilnya SENDIRI dari harga KOTORNYA sendiri,
// BUKAN dari total setelah diskon — lalu dijumlahkan:
ownerRevenue    = sum(round(Category[i].price * Category[i].revenueSharing.ownerPercentage / 100))
employeeRevenue = sum(Category[i].price - ownerRevenue[i])
pointsEarned    = floor(total / 1000)
```

⚠️ **Konsekuensi yang disengaja (bukan bug): `ownerRevenue + employeeRevenue` TIDAK LAGI otomatis sama dengan `total` begitu `discountAmount > 0` DAN lebih dari satu kategori terisi.** `discountAmount` hanya dikurangi dari `total` akhir, tidak pernah didistribusikan ke revenue split manapun. Kalau transaksi hanya mengisi satu kategori, invarian lama (`ownerRevenue + employeeRevenue === total`) tetap terjaga persis seperti sebelumnya — ini hanya berubah untuk kombinasi >1 kategori + diskon. Jangan "perbaiki" ketidakcocokan ini di sisi app dengan menghitung ulang — ini nilai yang benar-benar dikembalikan backend.

### Response `201 Created`

**Kasus CASH** (langsung lunas), satu kategori terisi:

```json
{
  "success": true,
  "data": {
    "transaction": {
      "_id": "671234abcd5678ef90123456",
      "transactionCode": "GRM-20261018-412837",
      "branch": "66ffaa0011223344556677aa",
      "agent": "66ab12cd34ef56ab78cd90aa",
      "employee": "66cc33dd44ee55ff66007711",
      "customer": "66aa11bb22cc33dd44ee55ff",
      "haircut": "66bb22cc33dd44ee55ff6600",
      "haircutSnapshot": { "name": "Haircut + Styling", "price": 100000, "ownerPercentage": 50, "employeePercentage": 50 },
      "shaving": null,
      "treatment": null,
      "colouring": null,
      "chemical": null,
      "paymentMethod": "CASH",
      "paymentStatus": "PAID",
      "transactionStatus": "PENDING",
      "serviceHourType": "REGULAR",
      "subtotal": 100000,
      "discountAmount": 0,
      "total": 100000,
      "ownerRevenue": 50000,
      "employeeRevenue": 50000,
      "pointsEarned": 100,
      "paidAt": "2026-10-18T08:00:00.000Z",
      "completedAt": null,
      "changeRequest": { "status": "NONE" },
      "receipt": { "printed": false, "printCount": 0 },
      "createdAt": "2026-10-18T08:00:00.000Z",
      "updatedAt": "2026-10-18T08:00:00.000Z"
    },
    "payment": null,
    "paymentError": null
  }
}
```

⚠️ **`branch`/`agent`/`employee`/`customer`/kelima field kategori di response `create` adalah ObjectId mentah (string), BUKAN object `{id, name}`** — beda dari response `list`/`detail` yang sebagian populated (lihat §3). Endpoint create tidak melakukan `.populate()` sama sekali. `employee` **tetap ObjectId mentah di SEMUA endpoint, termasuk list/detail** (lihat blocker §0) — tidak ada tempat di API ini yang pernah menampilkannya sebagai nama.

**Kategori yang tidak diisi muncul sebagai `null`** (`shaving`/`treatment`/`colouring`/`chemical` di atas) — field dan `*Snapshot` pasangannya sama-sama `null`/absen kalau kategori itu tidak dipilih.

**Kasus multi-kategori** (mis. haircut + shaving dalam satu transaksi) — kedua field kategori terisi, masing-masing punya snapshot sendiri, dan `ownerRevenue`/`employeeRevenue` dihitung dengan formula gross-per-kategori di atas (bisa tidak sama dengan `total` kalau ada diskon).

**Kasus QRIS, mode `MANAGED` (default), sukses bikin QR:**

```json
{
  "success": true,
  "data": {
    "transaction": { "...": "...", "paymentMethod": "QRIS", "paymentStatus": "PENDING", "paidAt": null },
    "payment": {
      "_id": "66cc00112233445566778800",
      "transaction": "671234abcd5678ef90123456",
      "provider": "MIDTRANS",
      "providerOrderId": "GRM-20261018-412837",
      "status": "PENDING",
      "grossAmount": 100000,
      "currency": "IDR",
      "qrCodeUrl": "https://api.midtrans.com/v2/qris/.../qr-code",
      "qrString": "00020101021226...",
      "expiresAt": "2026-10-18T08:15:00.000Z"
    },
    "paymentError": null
  }
}
```

**Kasus QRIS, panggilan ke Midtrans gagal saat create** (jaringan/Midtrans down):

```json
{
  "success": true,
  "data": {
    "transaction": { "...": "...", "paymentMethod": "QRIS", "paymentStatus": "PENDING" },
    "payment": null,
    "paymentError": "Failed to create QRIS charge: ..."
  }
}
```

⚠️ **Status tetap `201` (sukses), bukan error** — transaksinya **sudah tersimpan** sebagai sale of record, cuma QR code-nya gagal dibuat. **Cek `paymentError` setiap kali `paymentMethod: QRIS`** — kalau tidak `null`, tampilkan state "gagal buat QR" dan arahkan ke `POST /payments/qris` (§6) untuk retry pakai `transaction._id` yang sudah didapat ini.

**Kasus QRIS pada deployment `SELF_RECORDED`:** `paymentStatus` langsung `"PAID"`, `payment: null`, `paymentError: null` — identik pola responnya seperti CASH. Tidak pernah ada Payment/QR sama sekali pada mode ini.

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Transaksi berhasil dibuat (cek `paymentError` untuk tahu apakah QR-nya juga berhasil) |
| `400` | `VALIDATION_ERROR` | Body tidak sesuai schema, field asing (termasuk `serviceId` lama), tidak ada satu pun kategori terisi, atau header `Idempotency-Key` wajib tapi tidak dikirim (§2.5) |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | **Tidak pernah terjadi untuk AGENT** (EXEMPT_AGENT) — endpoint ini murni milik AGENT |
| `403` | `FORBIDDEN` | User login sebagai HOST (HOST tidak bisa create transaksi sama sekali) |
| `409` | `CONFLICT` | `Idempotency-Key` yang sama masih diproses request lain secara konkuren (§2.5) |
| `422` | `BUSINESS_RULE_VIOLATION` | Agent tidak punya cabang, cabang tidak aktif, salah satu kategori tidak ditemukan, customer tidak tersedia/tidak aktif, `employeeId` tidak valid untuk cabang ini, atau `discountAmount` melebihi total harga kategori |
| `500` | `INTERNAL_ERROR` | |

### 2.5. `Idempotency-Key` — WAJIB Diperhatikan untuk Tombol "Bayar"

*(Tidak berubah oleh Phase 10/11 — bagian ini diverifikasi ulang ke `lib/idempotency.ts` dan `app/api/v1/transactions/route.ts`, perilakunya sama seperti sebelumnya.)*

- **Opsional secara default** di level backend ini (`REQUIRE_IDEMPOTENCY_KEY` env var, per-deployment) — tapi kalau tidak dikirim, submit ganda = **transaksi ganda**.
- **Rekomendasi kuat untuk app:** generate **satu UUID v4 per percobaan submit**.
- Kalau key yang sama dikirim ulang dan request sebelumnya **sudah selesai**: backend tidak membuat transaksi baru, langsung mengembalikan transaksi yang sudah ada (`201` sukses, isinya transaksi lama).
- Kalau key yang sama dikirim ulang **sementara request pertama masih diproses**: request kedua dapat `409 CONFLICT`.
- Kalau deployment nanti mengaktifkan `REQUIRE_IDEMPOTENCY_KEY=true`, submit tanpa header ini akan ditolak `400`.

> **Detail teknis yang tidak terlihat dari luar:** secara internal, "replay" (key sudah pernah selesai) ditandai dengan flag `replayed: true` di kode (`services/transactionService.ts#replayTransaction`) — tapi flag ini **tidak pernah dikirim ke client**, route hanya mengembalikan `{transaction, payment, paymentError}`. Jangan bangun logic di app yang mengharapkan field `replayed` di response — tidak ada cara membedakan "baru dibuat" vs "hasil replay" dari response-nya; keduanya identik bentuknya.

---

## 3. GET /api/v1/transactions — List Transaksi

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |
| `search` | `string` | — | Cocok ke `transactionCode` (case-insensitive, substring) |
| `paymentStatus` | `PENDING\|PAID\|FAILED\|REFUNDED\|PARTIALLY_REFUNDED` | — | |
| `transactionStatus` | `PENDING\|IN_PROGRESS\|COMPLETED\|CANCELLED` | — | Lihat catatan `IN_PROGRESS` di §10 |
| `from`, `to` | `string` (ISO 8601) | — | Filter `createdAt` |
| `branchId` | `string` | — | **HOST only** — diabaikan untuk AGENT |
| `agentId` | `string` | — | **HOST only** — diabaikan untuk AGENT |

⚠️ **Tidak ada filter `employeeId`** — meskipun `employee` sekarang field wajib di setiap transaksi, `listTransactionsQuerySchema` tidak punya parameter untuk memfilter berdasarkan employee (hanya `agentId`, yang memfilter berdasarkan kasir, bukan pengerjanya).

⚠️ **AGENT melihat SELURUH transaksi di cabangnya, bukan cuma transaksi yang dia buat sendiri.**

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "671234abcd5678ef90123456",
        "transactionCode": "GRM-20261018-412837",
        "branch": { "_id": "66ffaa0011223344556677aa", "name": "Cabang Kemang" },
        "agent": { "_id": "66ab12cd34ef56ab78cd90aa", "name": "Budi Santoso" },
        "employee": "66cc33dd44ee55ff66007711",
        "customer": { "_id": "66aa11bb22cc33dd44ee55ff", "name": "Andi Wijaya", "phone": "08123456789" },
        "haircut": "66bb22cc33dd44ee55ff6600",
        "haircutSnapshot": { "name": "Haircut + Styling", "price": 100000, "ownerPercentage": 50, "employeePercentage": 50 },
        "shaving": null,
        "treatment": null,
        "colouring": null,
        "chemical": null,
        "paymentMethod": "CASH",
        "paymentStatus": "PAID",
        "transactionStatus": "COMPLETED",
        "total": 100000,
        "pointsEarned": 100,
        "createdAt": "2026-10-18T08:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
  }
}
```

Di sini `branch`/`agent`/`customer` **sudah populated** jadi object (`customer` jadi `null` kalau transaksi tidak punya customer tercatat) — beda dengan response `create` di §2. **`employee` TIDAK ikut populated** (lihat blocker §0) — tetap ObjectId mentah di sini juga. Kelima field kategori (`haircut`/`shaving`/`treatment`/`colouring`/`chemical`) tetap ObjectId mentah di semua endpoint — nama yang ditampilkan ke user selalu dari `*Snapshot.name` masing-masing, bukan dari hasil populate.

---

## 4. GET /api/v1/transactions/:id — Detail Transaksi

Bentuk response **identik dengan satu item di `transactions[]` pada §3** (populasi field yang sama, termasuk `employee` yang tetap tidak populated), dibungkus `{ transaction: {...} }` (bukan array).

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | AGENT dari cabang lain mencoba akses transaksi ini |
| `404` | Transaksi tidak ditemukan |

---

## 5. POST /api/v1/transactions/:id/complete — Selesaikan Layanan

**AGENT only** (403 untuk HOST). Menandai layanan sudah selesai dikerjakan — set `transactionStatus: "COMPLETED"` + `completedAt`. **Tidak terpengaruh Phase 10/11 sama sekali** — logic-nya tidak menyentuh field kategori atau employee.

⚠️ **Tidak ada gate terhadap `paymentStatus` sama sekali.** Transaksi QRIS yang `paymentStatus` masih `PENDING` **tetap bisa** di-complete.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{transaction}` (bentuk sama seperti §4) |
| `403` | `FORBIDDEN` | Bukan AGENT, atau AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `CANCELLED` atau sudah `COMPLETED` sebelumnya |

---

## 6. POST /api/v1/transactions/:id/cancel — Batalkan Transaksi

HOST maupun AGENT (cabang sendiri) bisa cancel. **Tidak terpengaruh Phase 10/11.**

⚠️ **Tidak pernah memicu refund apa pun, dan tidak menyentuh `paymentStatus`.** `paymentStatus` tetap `PAID` kalau sudah lunas sebelumnya, hanya `transactionStatus` yang jadi `CANCELLED`.

Efek samping kalau transaksi yang dibatalkan sebelumnya `PAID` dan punya customer dengan poin: poin loyalty yang sempat diberikan **otomatis dibalik/dikurangi** (best-effort, atomik terhadap race dengan webhook Midtrans yang mungkin bersamaan — dikonfirmasi lewat `findOneAndUpdate` kondisional di kode, bukan read-modify-write biasa).

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{transaction}` |
| `403` | `FORBIDDEN` | AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `COMPLETED` atau sudah `CANCELLED` sebelumnya |

---

## 7. GET /api/v1/transactions/:id/receipt — Data Struk

⚠️ **Ini `GET`, tapi punya side effect: setiap kali dipanggil, `receipt.printCount` bertambah 1.** Jangan panggil untuk preview — pakai `GET /transactions/:id` (§4) untuk itu.

`branch` di response ini populated lebih lengkap — `{ _id, name, branchCode, address, phone }`. `employee` dan kelima field kategori **tetap tidak populated**, sama seperti endpoint lain (§0).

```json
{
  "success": true,
  "data": {
    "transaction": {
      "...": "... (field lain sama seperti §4, termasuk employee & kategori yang tetap ObjectId mentah)",
      "branch": {
        "_id": "66ffaa0011223344556677aa",
        "name": "Cabang Kemang",
        "branchCode": "KMG",
        "address": "Jl. Kemang Raya No. 1",
        "phone": "021-7654321"
      },
      "receipt": { "printed": true, "printedAt": "2026-10-18T08:05:00.000Z", "printCount": 1 }
    }
  }
}
```

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | AGENT dari cabang lain |
| `404` | Transaksi tidak ditemukan |

---

## 8. Pendukung QRIS — POST /payments/qris & GET /payments/:id

**Tidak terpengaruh Phase 10/11 sama sekali** — modul pembayaran tidak menyentuh field kategori/employee, hanya `transaction._id`/`total`.

### 8.1. POST /api/v1/payments/qris — Buat/Retry QRIS

**AGENT only.** Body:

```json
{ "transactionId": "671234abcd5678ef90123456" }
```

`transactionId` wajib persis 24 karakter hex (format ObjectId) — format lain ditolak `400` sebelum sempat query database.

Response `201`: `{ "payment": { ...sama seperti bentuk payment di §2... } }`.

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | QR baru berhasil dibuat |
| `400` | `VALIDATION_ERROR` | `transactionId` bukan format ObjectId valid |
| `403` | `FORBIDDEN` | Bukan AGENT, atau beda cabang |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `PAID`, sudah `CANCELLED`, atau masih ada payment `PENDING` lain yang **belum expired** |
| `422` | `BUSINESS_RULE_VIOLATION` | `paymentMethod` transaksi bukan `QRIS`, atau deployment ini mode `SELF_RECORDED` |
| `502` | `PAYMENT_GATEWAY_ERROR` | Panggilan ke Midtrans gagal |

> **Detail yang tidak terlihat dari luar tapi berguna untuk dipahami:** kalau payment `PENDING` yang ada **sudah lewat `expiresAt`**-nya sendiri, backend **otomatis** menandainya `EXPIRED` dulu lalu membuat QR baru — bukan `409`. `409` di atas hanya terjadi kalau payment `PENDING` yang ada **masih dalam masa berlaku**.

⚠️ **Beda penting dengan §2:** saat **create transaksi**, kegagalan Midtrans di-redam jadi `201` + `paymentError`. Saat **retry lewat endpoint ini**, kegagalan Midtrans yang sama jadi **`502` tegas** (tidak ada payment yang dibuat).

### 8.2. GET /api/v1/payments/:id — Polling Status

```json
{
  "success": true,
  "data": {
    "payment": {
      "_id": "66cc00112233445566778800",
      "transaction": { "_id": "671234abcd5678ef90123456", "branch": "66ffaa0011223344556677aa", "transactionCode": "GRM-20261018-412837" },
      "status": "PENDING",
      "grossAmount": 100000,
      "qrCodeUrl": "https://...",
      "qrString": "00020101...",
      "expiresAt": "2026-10-18T08:15:00.000Z",
      "paidAt": null
    }
  }
}
```

`status`: `PENDING | PAID | FAILED | EXPIRED | REFUNDED`.

**Pola polling yang disarankan:**
- Poll `GET /payments/:id` setiap 3–5 detik sampai `status` bukan lagi `PENDING`, ATAU sampai lewat `expiresAt`.
- `status: "PAID"` → tampilkan sukses.
- `status: "EXPIRED"` atau sudah lewat `expiresAt` → tampilkan "QR kedaluwarsa", sediakan tombol yang memanggil ulang §8.1.
- Tidak ada webhook/push ke app.

⚠️ **`EXPIRED` vs transaksi induknya:** kalau `Payment.status` jadi `EXPIRED`, `Transaction.paymentStatus` **tetap `PENDING`**.

---

## 9. Status Code — Ringkasan Semua Endpoint di Modul Ini

| Status | `error.code` | Endpoint mana saja |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Semua endpoint dengan body/query |
| `401` | `UNAUTHENTICATED` | Semua |
| `402` | `PAYMENT_REQUIRED` | Hanya bisa kena HOST (EXEMPT_AGENT) — AGENT tidak pernah |
| `403` | `FORBIDDEN` | Role salah, atau AGENT beda cabang |
| `404` | `NOT_FOUND` | Endpoint dengan `:id` |
| `409` | `CONFLICT` | complete/cancel (status tidak valid), payments/qris (sudah lunas/sudah ada pending), idempotency key masih diproses |
| `422` | `BUSINESS_RULE_VIOLATION` | create (kategori/customer/employee tidak valid, lihat §2), payments/qris (bukan QRIS/mode SELF_RECORDED) |
| `500` | `INTERNAL_ERROR` | Semua |
| `502` | `PAYMENT_GATEWAY_ERROR` | payments/qris saja |

---

## 10. Catatan Implementasi Flutter

- **🐛 Blocker employee — lihat §0 sebelum membangun layar create transaksi sama sekali.** Tidak ada endpoint untuk daftar Employee, dan field-nya tidak pernah populated di response manapun.
- **Hapus seluruh referensi `serviceId`** — diganti `haircutId`/`shavingId`/`treatmentId`/`colouringId`/`chemicalId`, 1–5 di antaranya boleh terisi sekaligus (§2).
- **UI pemilihan kategori servis harus mendukung multi-select**, bukan single-select seperti dulu — satu transaksi bisa punya haircut + shaving bersamaan. Ambil daftarnya dari `KELOLA-MOBILE-API-INTEGRATION.md` §3 (5 endpoint terpisah, masing-masing butuh `limit=100` untuk picker lengkap).
- **Hitung ulang pemahaman soal `ownerRevenue + employeeRevenue === total`** — ini hanya terjamin kalau tepat satu kategori terisi. Begitu >1 kategori + ada diskon, jangan validasi invarian ini di app (§2, bagian formula).
- **Generate `Idempotency-Key` per percobaan submit** (§2.5) — satu-satunya proteksi terhadap double-charge. `replayed` tidak pernah dikirim ke client — jangan desain UI yang mengandalkan field itu.
- **`transactionStatus: "IN_PROGRESS"` ada di enum tapi tidak pernah di-set oleh endpoint manapun** — alurnya cuma `PENDING → COMPLETED` (§5) atau `PENDING → CANCELLED` (§6).
- **Field kategori (`haircut`/`shaving`/dst.) DAN `employee` selalu ObjectId mentah** di semua response transaksi — nama layanan dari `*Snapshot.name`; nama employee **tidak bisa ditampilkan sama sekali** sampai blocker §0 terselesaikan.
- **Response `create` (§2) tidak populated, response `list`/`detail`/`receipt` sebagian populated** (`branch`/`agent`/`customer` saja, bukan `employee`) — jangan pakai satu model Dart yang sama secara naif untuk keduanya.
- **Setelah create dengan `paymentMethod: QRIS`, selalu cek `paymentError`** sebelum menganggap QR siap ditampilkan.
- **Alur approval koreksi transaksi ada di dokumen terpisah** — lihat `docs/TRANSACTION-CHANGE-REQUESTS-MOBILE-API-INTEGRATION.md`. Catatan silang: `employeeId` **tidak bisa dikoreksi** lewat alur itu — lihat dokumen tersebut §0.1.

---

## 11. Pending / Blocker — Ringkasan

- **🐛 Blocker utama (§0): tidak ada endpoint untuk list/detail `Employee`, dan `employee` tidak pernah populated di response manapun.** Ini memblokir implementasi create-transaction secara penuh (tidak ada cara mengisi picker employee) dan memblokir tampilan "siapa yang mengerjakan" di riwayat transaksi. Perlu endpoint baru di backend — bukan sesuatu yang bisa diakali dari sisi Flutter.
- Tidak ditemukan blocker lain di modul ini — seluruh endpoint lain (list/detail/complete/cancel/receipt/payments) diverifikasi langsung ke kode dan berfungsi sesuai yang didokumentasikan di atas.
