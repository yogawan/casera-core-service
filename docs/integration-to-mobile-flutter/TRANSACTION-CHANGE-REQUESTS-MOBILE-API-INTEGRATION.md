# Integrasi Mobile (Flutter) — Grooma API — Modul Transaction Change Requests (Approval Workflow)

> Dokumen ini khusus alur **pengajuan & approval koreksi transaksi** (ganti kategori servis/customer/diskon/jam pada transaksi yang **sudah dibuat**). Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2. Untuk create/list/detail/complete/cancel/receipt transaksi itu sendiri, lihat `docs/TRANSACTION-MOBILE-API-INTEGRATION.md`.

> **Diperbarui penuh berdasarkan audit langsung ke kode** (`validations/approvalSchema.ts`, `services/approvalService.ts`, dan seluruh route `app/api/v1/{transactions/:id/change-requests,transaction-change-requests}/**`) — bukan disalin dari versi dokumen sebelumnya. Versi lama ditulis **sebelum** Phase 11 (Service → 5 kategori), jadi whitelist dan contoh request/response-nya berubah.

---

## 0. Konsep Penting — Baca Dulu Sebelum Lanjut

**Tidak ada entity "change request" yang berdiri sendiri.** Tidak ada collection/model/`_id` sendiri untuk sebuah change request. Seluruh state-nya nempel langsung di dokumen `Transaction` yang bersangkutan:

- `transaction.changeRequest` — status pengajuan **terkini/terakhir** (`NONE`/`PENDING`/`APPROVED`/`REJECTED`) beserta siapa yang minta, alasan, apa yang diminta, siapa yang review, dst. Field ini **ditimpa penuh** setiap ada pengajuan baru — riwayat pengajuan lama yang sudah diputuskan tidak disimpan di sini.
- `transaction.changeHistory[]` — log permanen **append-only**, isinya cuma perubahan yang **benar-benar diterapkan** (yang di-APPROVE). Pengajuan yang di-REJECT tidak pernah masuk ke sini.

**Konsekuensi langsung ke URL:** parameter `:id` di **semua** endpoint `/transaction-change-requests/:id*` di bawah **adalah `_id` milik `Transaction`**, bukan id entity lain. Dan **response dari kelima endpoint di modul ini selalu `{ transaction: {...} }`**, tidak pernah ada object `changeRequest` berdiri sendiri yang dikembalikan terpisah.

### 0.1. ⚠️ Breaking Change — `serviceId` Diganti 5 Field Kategori, dan `employeeId` TIDAK Bisa Dikoreksi Lewat Sini (PRD §5.14)

Sama seperti alur create (`TRANSACTION-MOBILE-API-INTEGRATION.md` §2), `requestedChanges.serviceId` **sudah tidak ada** — diganti lima field opsional: `haircutId`, `shavingId`, `treatmentId`, `colouringId`, `chemicalId`. Detail lengkapnya di §2.

**Dikonfirmasi langsung dari `validations/approvalSchema.ts`: `employeeId` TIDAK ADA di whitelist `requestedChanges` sama sekali.** Kalau AGENT salah pilih employee saat create transaksi (lihat blocker terpisah di `TRANSACTION-MOBILE-API-INTEGRATION.md` §0), **tidak ada cara memperbaikinya** — bukan cuma lewat modul ini, tapi lewat API manapun. Satu-satunya field referensi yang bisa dikoreksi tetap seperti sebelumnya: kategori servis (sekarang 5, bukan 1) dan customer.

---

## 1. Ringkasan 5 Endpoint

| Method | Endpoint | Role | Catatan |
|---|---|---|---|
| POST | `/api/v1/transactions/:id/change-requests` | HOST, AGENT (cabang sendiri) | Ajukan koreksi |
| GET | `/api/v1/transaction-change-requests` | **HOST only** | List semua yang `PENDING`, lintas cabang |
| GET | `/api/v1/transaction-change-requests/:id` | HOST, atau **AGENT yang mengajukan sendiri** | Lihat status satu pengajuan. **Tidak ada `requireRole` di route ini** — akses ditentukan penuh dari data di dalam service (§4) |
| POST | `/api/v1/transaction-change-requests/:id/approve` | **HOST only** | Tidak bisa approve pengajuan sendiri |
| POST | `/api/v1/transaction-change-requests/:id/reject` | **HOST only** | `reviewNote` wajib |

⚠️ **Subscription gating modul ini `ENFORCED` penuh di kelima endpoint** (diverifikasi langsung — tidak satu pun dari 5 route handler mengirim `subscriptionPolicy` override, jadi default `ENFORCED` berlaku semuanya) — beda dari dokumen POS core (`EXEMPT_AGENT`). Kalau subscription HOST nunggak, **AGENT JUGA kena `402`** di kelima endpoint ini. PRD §23.4.1 sengaja mengunci modul ini untuk kedua role karena mengajukan/approve koreksi bukan bagian dari "menyelesaikan customer yang sedang di kursi" — konsisten dengan allowlist §23.4.1 yang eksplisit mengecualikan `/transactions/{id}/change-requests` dari daftar yang tetap terbuka untuk AGENT.

---

## 2. POST /api/v1/transactions/:id/change-requests — Ajukan Koreksi

`:id` = id transaksi yang mau dikoreksi.

### Request

```json
{
  "reason": "Customer sebenarnya minta Haircut + Beard Trim, salah input kategori",
  "requestedChanges": {
    "haircutId": "66bb22cc33dd44ee55ff6611",
    "discountAmount": 10000
  }
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `reason` | `string` | **Ya** | 1–1000 karakter |
| `requestedChanges` | `object` | **Ya** | **Minimal 1 key** harus diisi |
| `requestedChanges.haircutId` | `string` | Tidak | |
| `requestedChanges.shavingId` | `string` | Tidak | |
| `requestedChanges.treatmentId` | `string` | Tidak | |
| `requestedChanges.colouringId` | `string` | Tidak | |
| `requestedChanges.chemicalId` | `string` | Tidak | |
| `requestedChanges.customerId` | `string \| null` | Tidak | `null` valid — buat mengoreksi "transaksi ini seharusnya tanpa customer" atau sebaliknya |
| `requestedChanges.discountAmount` | `number` | Tidak | |
| `requestedChanges.serviceHourType` | `"REGULAR" \| "OVERTIME"` | Tidak | |

**Hanya 8 field di atas yang bisa diajukan** (schema `.strict()` menolak field lain dengan `400`, termasuk `employeeId` — lihat §0.1). `paymentMethod`, status, `branch`, `agent` **tidak bisa** dikoreksi lewat jalur ini sama sekali — masing-masing punya mekanismenya sendiri.

**Mengirim satu id kategori berarti mengubah/menetapkan kategori itu secara spesifik** — keempat kategori lain (kalau ada) **tidak tersentuh**, tetap seperti semula. Tidak ada mekanisme "kosongkan kategori yang sudah ada" lewat change request (sama seperti `serviceId` dulu tidak pernah mendukung "transaksi tanpa service").

### Response `201 Created`

```json
{
  "success": true,
  "data": {
    "transaction": {
      "_id": "671234abcd5678ef90123456",
      "transactionCode": "GRM-20261018-412837",
      "...": "... (field transaksi lain seperti biasa)",
      "changeRequest": {
        "status": "PENDING",
        "requestedBy": "66ab12cd34ef56ab78cd90aa",
        "reason": "Customer sebenarnya minta Haircut + Beard Trim, salah input kategori",
        "requestedChanges": { "haircutId": "66bb22cc33dd44ee55ff6611", "discountAmount": 10000 },
        "requestedAt": "2026-10-18T09:00:00.000Z"
      }
    }
  }
}
```

Perhatikan: **field transaksi utama (`total`, `*Snapshot`, dst.) belum berubah sama sekali** di titik ini — pengajuan hanya "dicatat niatnya", efeknya baru benar-benar diterapkan kalau HOST approve (§5).

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Pengajuan tersimpan |
| `400` | `VALIDATION_ERROR` | `reason` kosong, `requestedChanges` kosong/semua field tidak diisi, atau ada field di luar whitelist (termasuk `employeeId`/`serviceId` lama) |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Subscription HOST lapsed — **berlaku untuk AGENT juga** (lihat §1) |
| `403` | `FORBIDDEN` | AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `CANCELLED`, **atau sudah ada pengajuan `PENDING` lain yang masih aktif** (hanya 1 pengajuan aktif per transaksi) |
| `422` | `BUSINESS_RULE_VIOLATION` | Kategori/customer yang diajukan tidak ditemukan — pesan per kategori sama seperti create (`"Requested haircut is not available."`, dst., lihat `TRANSACTION-MOBILE-API-INTEGRATION.md` §2) |

Kalau dapat `409` karena sudah ada pengajuan `PENDING`, tidak ada cara "update" pengajuan yang sudah ada — harus menunggu HOST approve/reject dulu (§5/§6), baru bisa ajukan lagi.

---

## 3. GET /api/v1/transaction-change-requests — Antrian Approval (HOST)

**HOST only** (403 untuk AGENT).

### Query Params

| Param | Default | Catatan |
|---|---|---|
| `page` | `1` | |
| `limit` | `20`, maks `100` | |

⚠️ **Tidak ada filter `branchId`** — HOST dengan banyak cabang melihat **seluruh** pengajuan `PENDING` lintas cabang dalam satu list. Kalau butuh grouping per cabang di UI, lakukan di sisi client dari field `transaction.branch` pada tiap item.

> ⚠️ **Isi list berubah saat HOST bekerja.** Setiap approve/reject mengeluarkan satu baris dari antrian `PENDING`. **Refetch dari halaman 1 setelah setiap aksi approve/reject**, jangan mempertahankan posisi halaman.

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
        "changeRequest": {
          "status": "PENDING",
          "requestedBy": { "_id": "66ab12cd34ef56ab78cd90aa", "name": "Budi Santoso" },
          "reason": "Customer sebenarnya minta Haircut + Beard Trim, salah input kategori",
          "requestedChanges": { "haircutId": "66bb22cc33dd44ee55ff6611", "discountAmount": 10000 },
          "requestedAt": "2026-10-18T09:00:00.000Z"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

⚠️ **Key array-nya `transactions`, bukan `changeRequests`.** Terurut dari pengajuan **terbaru** (`changeRequest.requestedAt` descending). Hanya pengajuan `PENDING` yang muncul di sini.

---

## 4. GET /api/v1/transaction-change-requests/:id — Detail Satu Pengajuan

`:id` = id transaksi (§0). Endpoint ini bisa dipakai untuk pengajuan yang masih `PENDING` **maupun** yang sudah `APPROVED`/`REJECTED`.

⚠️ **Tidak ada `requireRole` di route ini sama sekali** — berbeda dari keempat endpoint lain di modul ini yang semuanya punya gate role eksplisit. Aturan aksesnya **sepenuhnya data-dependent**, dicek di dalam `services/approvalService.ts#getChangeRequestById`: **"HOST (siapa pun) + AGENT yang mengajukan pengajuan itu sendiri"** — bukan pola "branch access" seperti endpoint lain. AGENT lain di cabang yang sama yang BUKAN pengajunya akan tetap kena `403` walau satu cabang.

**Response-nya lebih lengkap populated dibanding §3** — selain `branch`/`agent`/`changeRequest.requestedBy`, endpoint ini juga mem-populate `changeRequest.reviewedBy` (siapa HOST yang sudah approve/reject), berguna kalau pengajuan sudah diputuskan.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{transaction}` |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Termasuk untuk AGENT (lihat §1) |
| `403` | `FORBIDDEN` | Bukan HOST dan bukan pengaju aslinya |
| `404` | `NOT_FOUND` | Transaksi tidak ada, **atau transaksi ada tapi belum pernah punya pengajuan sama sekali** (`changeRequest.status === "NONE"`) — dua kasus ini dibalas pesan error yang sama persis ("No change request exists for this transaction."), tidak bisa dibedakan dari response-nya |

---

## 5. POST /api/v1/transaction-change-requests/:id/approve — Setujui

**HOST only.** Body (keduanya optional):

```json
{
  "reviewNote": "Dicek dengan customer, benar salah input kategori",
  "approvalReference": "WA-chat-2026-10-18"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `reviewNote` | `string` | Tidak | Maks 1000 karakter |
| `approvalReference` | `string` | Tidak | Maks 255 karakter — referensi bebas |

### Apa yang Terjadi Saat Approve

1. **Kategori/customer yang diajukan divalidasi ULANG** (bukan cuma mengandalkan validasi saat submit di §2) — kalau di antara waktu submit dan approve kategori/customer itu hilang, approve akan gagal `422` meski submission-nya dulu sukses.
2. ⚠️ **Nuansa penting yang mudah terlewat: kalau pengajuan menyangkut PERUBAHAN kategori apa pun (atau `discountAmount`), backend me-refetch SEMUA kategori yang akan terisi di hasil akhir — bukan cuma yang diubah.** Kategori yang **tidak** disebutkan di `requestedChanges` tapi **sudah ada** di transaksi tetap di-refetch LIVE dari database (bukan dari snapshot lama) untuk ikut dalam kalkulasi ulang. Konsekuensinya: kalau transaksi punya haircut + shaving, dan pengajuan hanya mengubah `discountAmount` (tidak menyebut kategori apa pun), approve tetap akan gagal `422` ("Transaction's current haircut/shaving is no longer available.") kalau salah satu dari haircut/shaving yang **sudah ada** itu kebetulan sudah terhapus di antara waktu transaksi dibuat dan sekarang.
3. Formula kalkulasi ulang sama seperti saat create (satu kategori hasil akhir → formula lama; >1 kategori hasil akhir → formula gross-per-kategori) — lihat `TRANSACTION-MOBILE-API-INTEGRATION.md` §2 untuk detail formula dan konsekuensi `ownerRevenue+employeeRevenue` yang bisa tidak sama dengan `total`.
4. Satu entry baru ditambahkan ke `transaction.changeHistory[]` (permanen, berisi snapshot `before`/`after` — hanya field yang benar-benar berubah yang masuk ke objek ini, bukan seluruh transaksi).
5. `changeRequest.status` jadi `APPROVED`, tercatat `reviewedBy`/`reviewNote`/`reviewedAt`.

Response `200`: `{transaction}` — sudah mencerminkan nilai BARU.

⚠️ **`pointsEarned` TIDAK ikut dihitung ulang saat approve, dan poin loyalty yang sudah dikreditkan ke customer TIDAK ikut disesuaikan**, meskipun `total` transaksinya berubah — dikonfirmasi langsung dari kode, tidak ada satu baris pun di `approveChangeRequest` yang menyentuh `pointsEarned` atau memanggil fungsi credit/reverse poin. Kalau transaksi itu sudah `PAID` sebelum di-approve, approve yang mengubah harga tidak mengoreksi poin yang sudah terlanjur diberikan — ini gap di backend, bukan sesuatu yang bisa diperbaiki dari sisi Flutter.

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Disetujui & diterapkan |
| `400` | `VALIDATION_ERROR` | `reviewNote`/`approvalReference` melebihi panjang maksimal |
| `403` | `FORBIDDEN` | Bukan HOST, **atau HOST yang sama dengan pengaju mencoba approve pengajuannya sendiri** (pemisahan tugas — PRD §10.2, berlaku juga kalau HOST sendiri yang mengajukan) |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Pengajuan sudah bukan `PENDING` lagi |
| `422` | `BUSINESS_RULE_VIOLATION` | Kategori/customer yang diajukan ATAU yang sudah ada di transaksi sudah tidak tersedia saat approve (lihat poin 2 di atas) |

⚠️ **Kalau kena `422` di sini, pengajuan TETAP `PENDING`** — tidak otomatis gagal/ditolak. Karena hanya boleh ada 1 pengajuan `PENDING` aktif per transaksi (§2), AGENT tidak bisa mengajukan ulang sampai pengajuan ini diputuskan. Sediakan di UI HOST: kalau approve gagal `422`, tawarkan opsi **Reject** (§6) sebagai jalan keluar.

---

## 6. POST /api/v1/transaction-change-requests/:id/reject — Tolak

**HOST only.** Body:

```json
{ "reviewNote": "Kategori yang diminta tidak tersedia di cabang ini" }
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `reviewNote` | `string` | **Ya** | 1–1000 karakter — beda dari approve, di sini **wajib** diisi |

Transaksi **tidak disentuh sama sekali** — hanya `changeRequest.status` jadi `REJECTED` + `reviewedBy`/`reviewNote`/`reviewedAt`. Tidak ada entry baru di `changeHistory`.

Setelah ditolak, AGENT **bisa langsung mengajukan pengajuan baru** pada transaksi yang sama (§2).

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Ditolak |
| `400` | `VALIDATION_ERROR` | `reviewNote` kosong/tidak dikirim |
| `403` | `FORBIDDEN` | Bukan HOST |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Pengajuan sudah bukan `PENDING` lagi |

---

## 7. Catatan Implementasi Flutter

- **Hapus seluruh referensi `serviceId` di form pengajuan koreksi** — diganti `haircutId`/`shavingId`/`treatmentId`/`colouringId`/`chemicalId` (§2). UI-nya perlu mendukung memilih/ganti salah satu dari 5 kategori, bukan satu dropdown service tunggal.
- **Jangan tambahkan opsi "koreksi employee" di UI** — `employeeId` tidak ada di whitelist (§0.1), dan tidak ada mekanisme lain untuk memperbaikinya. Kalau user butuh ini, itu pertanyaan untuk tim backend, bukan sesuatu yang bisa dibangun di Flutter hari ini.
- **Jangan bangun model `ChangeRequest` dengan `id` sendiri** — semua state-nya adalah bagian dari model `Transaction`. Reuse model Transaction dari `TRANSACTION-MOBILE-API-INTEGRATION.md`.
- **Untuk layar "status pengajuan saya" (AGENT):** simpan `transaction._id` begitu submit (§2) sukses, lalu pakai id itu untuk cek ulang via §4 (yang juga menampilkan `reviewedBy` kalau sudah diputuskan). Jangan desain layar "daftar pengajuan saya" dari `GET /transaction-change-requests` — endpoint itu `403` untuk AGENT.
- **Tombol Approve di UI HOST harus siap menangani `422`** sebagai hasil yang valid — termasuk kasus di mana `422` dipicu oleh kategori yang **tidak** diajukan untuk diubah, tapi kebetulan sudah tidak tersedia lagi (§5 poin 2) — pesan errornya akan menyebut kategori spesifik yang bermasalah, tampilkan apa adanya ke HOST.
- **402 di modul ini berlaku untuk AGENT juga** (§1) — beda dari dokumen POS core.

---

## 8. Pending / Belum Bisa Dipastikan dari Audit Ini

Tidak ditemukan blocker untuk modul ini sendiri — kelima endpoint, whitelist, dan logic approve/reject diverifikasi langsung dari kode yang sudah berjalan (Phase 11 ✅). Satu limitasi struktural dicatat sebagai fakta (bukan blocker tersendiri, karena sudah konsisten di seluruh backend): `employeeId` tidak bisa dikoreksi lewat modul ini maupun modul lain (§0.1) — ini adalah konsekuensi langsung dari blocker yang sudah didokumentasikan di `TRANSACTION-MOBILE-API-INTEGRATION.md` §0 (tidak ada endpoint Employee sama sekali), bukan gap baru yang berdiri sendiri di modul approval ini.
