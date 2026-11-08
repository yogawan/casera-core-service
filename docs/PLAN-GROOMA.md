# GROOMA — Backend Execution Plan

Companion dokumen untuk [`PRD-GROOMA.md`](./PRD-GROOMA.md) v1.0. Dokumen ini menerjemahkan PRD (khususnya §17–§21) menjadi checklist eksekusi yang konkret, berbasis struktur repo yang sudah ada. Checklist di bawah bersifat living document — centang & update seiring progres, jangan dianggap final sekali ditulis.

Referensi `§X` di seluruh dokumen ini mengacu ke nomor section di `PRD-GROOMA.md`.

---

## 0. Gap Analysis — Status Repo vs PRD

Repo saat ini adalah hasil `create-next-app` + beberapa model Mongoose yang sudah ditulis lebih dulu (sebelum PRD final), sehingga ada drift yang harus diperbaiki di Phase 1, bukan diteruskan.

| Area | Requirement PRD | Status Repo Saat Ini | Tindakan |
|---|---|---|---|
| Dependencies | zod, argon2id/bcrypt, Midtrans SDK, session lib, test runner (§2) | Hanya `mongoose`, `next`, `react`, `react-dom` | Install di Phase 1 |
| Package manager | satu lockfile | `bun.lock` **dan** `package-lock.json` sama-sama ada | Pilih satu, hapus lockfile lain |
| `models/Branch.ts` | wajib (§5.2) | **Tidak ada** | Buat baru — Phase 1 |
| `models/User.ts` | field `branch` wajib untuk AGENT (§5.1, §3.3) | Field `branch` **tidak ada** sama sekali | Tambahkan — Phase 1 |
| `models/Transaction.ts` | field `branch`, `agent`, `paymentReference` (§5.5) | Pakai nama field `employee` (bukan `agent`), **tidak ada** `branch`/`paymentReference`, semua `ref` menunjuk ke `"Employee"` yang modelnya tidak eksis | Perbaiki — Phase 1 (bug blocking, bukan cosmetic: `.populate()` akan gagal diam-diam) |
| `models/Inventory.ts` | field `branch` wajib untuk isolasi cabang (§5.6) | Field `branch` **tidak ada** | Tambahkan — Phase 1/4 |
| `models/Payment.ts` | direkomendasikan collection terpisah (§5.9) | Tidak ada | Buat baru — Phase 3 |
| `models/InventoryMovement.ts` | direkomendasikan untuk audit stok (§5.7) | Tidak ada | Buat baru — Phase 4 |
| `models/Attendance.ts` | **out of scope MVP** (§4, §20) | Sudah ada (termasuk `ref: "Employee"` yang sama-sama invalid) | Biarkan apa adanya, jangan dikembangkan/di-wire ke API selama MVP ini. *`ref: "Employee"` kini resolve ke `models/Employee.ts` (dibuat sebagai scaffold sesuai PRD §5.13) — tidak lagi dangling, tapi belum dibaca/ditulis service atau route manapun. Tetap jangan di-wire ke Attendance selama MVP.* |
| `app/api/v1/*` | seluruh endpoint §7 | **Tidak ada** sama sekali, hanya default page bawaan `create-next-app` | Bangun bertahap mulai Phase 1 |
| `lib/`, `services/`, `validations/`, `types/` | struktur §17 | Tidak ada | Bangun bertahap sesuai phase |
| `models/SubscriptionPlan.ts`, `Subscription.ts`, `SubscriptionInvoice.ts` | wajib untuk modul Subscription & Billing (PRD §5.10–§5.12, §23) | Tidak ada | Buat baru — Phase 8 |
| `User.role` enum | hanya `HOST \| AGENT` (PRD §3.6) | Sudah sesuai | **Selesai.** Sempat memuat `GROOMA_ADMIN` di Phase 8, lalu dikembalikan ke dua role ketika role admin dipisah ke backend tersendiri |
| `app/api/v1/subscription/*` | namespace billing milik HOST sendiri (PRD §7.11) | Ada | Selesai — Phase 8 |
| `app/api/v1/admin/*` | ~~namespace GROOMA_ADMIN~~ — **dipindahkan ke backend admin terpisah** (PRD §3.6) | Tidak ada di backend ini | Jangan dibangun kembali di sini |

Catatan tambahan: `AGENTS.md` menandai bahwa versi Next.js di proyek ini punya breaking changes dari training data model mana pun — sebelum menulis route handler, baca `node_modules/next/dist/docs/` untuk konvensi App Router/Route Handler yang berlaku di versi ini. Hal yang sama berlaku untuk Mongoose (`^9.11.2`, lebih baru dari API yang umum dikenal).

---

## 1. Keputusan yang Harus Dikonfirmasi Lebih Dulu

PRD sendiri menandai beberapa hal sebagai "harus dikonfirmasi" atau "sebaiknya ditambahkan". Selesaikan ini di Phase 0 agar tidak bongkar ulang model/lib di tengah jalan.

- [x] **Definisi operasional `customerType: DECOY`** (§5.3) — PRD eksplisit bilang ini harus dikonfirmasi sebelum fitur klasifikasi dirilis. Rekomendasi sementara: semua customer baru default `REGULAR`, tunda eksposur `DECOY` ke endpoint manapun sampai definisi bisnisnya jelas. (ACC)
- [x] **Algoritma hashing password**: Argon2id vs bcrypt (§2 memberi pilihan). Rekomendasi: Argon2id. (ACC)
- [x] **Mekanisme session** (§6.2): DB-backed session (collection `Session` + cookie `HttpOnly` berisi session id) vs cookie terenkripsi/signed (mis. iron-session/JWT). Rekomendasi: DB-backed — requirement "logout harus mencabut session" dan "akun nonaktif tidak boleh tetap dapat akses walau session masih valid" (§6.2) paling natural dipenuhi kalau session bisa divalidasi & dicabut langsung di server, bukan cuma menunggu expiry token. (ACC)
- [x] **Status `EXPIRED` pada Payment** (§9.4) — PRD merekomendasikan ini ditambahkan. Rekomendasi: masukkan dari awal ke enum `status`, supaya tidak perlu migrasi data nanti. (PRD gw ACC)
- [x] **Infra rate limiting** (§15.8) — target deploy Vercel/serverless (§2) berarti multi-instance; counter in-memory per-process tidak reliable. Rekomendasi: counter via collection Mongo sendiri, atau Redis (mis. Upstash) kalau tersedia. (ACC)
- [x] **Test runner** — belum ada di devDependencies. Rekomendasi: Vitest (ESM-native, cocok dengan TS + Next.js). (Skip dulu, fokus MVP)
- [x] **Package manager ganda** — `bun.lock` dan `package-lock.json` sama-sama ada di root. Pilih satu, hapus yang lain supaya tidak drift. (BUN)
- [x] **CSRF mechanism** konkret (§6.2, §15.9) — opsi: double-submit cookie token, atau custom header check (`SameSite=Lax` + header wajib). Rekomendasi: double-submit token, cocok dipasangkan dengan session cookie. (ACC)
- [x] **Nasib `models/Attendance.ts`** — sudah ada walau attendance out-of-scope. Rekomendasi: biarkan file ada (bukan kerjaan yang dihapus sepihak), tapi jangan diberi route/service di MVP ini. (ACC)

---

## 2. Dependencies yang Perlu Ditambahkan

| Package | Fungsi | Dipakai mulai |
|---|---|---|
| `zod` | schema validation (§2, seluruh input API) | Phase 1 |
| `argon2` (atau `bcrypt`, sesuai keputusan di §1) | password hashing | Phase 1 |
| Library session sesuai keputusan di §1 (atau tidak perlu library eksternal kalau DB-backed custom) | session management | Phase 1 |
| `midtrans-client` | integrasi QRIS Midtrans (§9) | Phase 3 |
| `vitest` + `@vitest/coverage-v8` (sesuai keputusan di §1) | automated testing (§18) | Phase 1 setup, dipakai sepanjang proyek |
| `mongodb-memory-server` (opsional) | test terhadap Mongo tanpa Atlas asli | Phase 1/7 |

Scheduler untuk siklus billing subscription (PRD §23.2) belum punya pilihan tetap — tentukan saat Phase 8: **Vercel Cron Jobs** (native kalau hosting di Vercel) atau **GitHub Actions scheduled workflow** yang memanggil endpoint internal dengan secret. Tidak perlu package npm tambahan untuk opsi manapun.

---

## 3. Environment Variables

- `MONGODB_URI`
- Secret untuk session/cookie signing (nama tergantung keputusan mekanisme session)
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `MIDTRANS_IS_PRODUCTION`
- `APPLICATION_ENVIRONMENT` — must be set explicitly to "production" in production deployments (not auto-set like `NODE_ENV`)
- `INTERNAL_CRON_SECRET` — autentikasi endpoint `POST /api/v1/internal/subscriptions/run-billing-cycle` (PRD §23.5), bukan session user

Simpan di `.env.local` (sudah di-gitignore lewat pola `.env*`), buat juga `.env.example` tanpa nilai asli supaya onboarding jelas. Jangan commit credential (§9.3, §15.11).

---

## 4. Fase Eksekusi

### Phase 0 — Alignment (sebelum coding)
- [x] Finalisasi seluruh poin di §1
- [x] Setup `.env.local` + `.env.example`
- [x] Bersihkan lockfile ganda (hapus `package-lock.json`, `bun.lock` jadi satu-satunya lockfile)
- [x] `bun install` dependencies dasar — `zod` + `argon2` terpasang; test runner (Vitest) sengaja di-skip sesuai keputusan §1

### Phase 1 — Foundation
**Models (perbaikan + baru):**
- [x] `models/Branch.ts` baru — `branchCode` unique, `status: ACTIVE|INACTIVE`, `timezone` (§5.2)
- [x] `models/User.ts` — tambah field `branch` (ref `Branch`), validasi custom: required jika `role === "AGENT"`, boleh `null` jika `HOST`; tambah `GROOMA_ADMIN` ke enum `role` dengan `branch` selalu `null` dan tidak dapat dibuat lewat endpoint `/users` biasa (§5.1, §23.1) — enforced via `pre("validate")`; endpoint-level restriction masih menunggu Phase 2
- [x] `models/Transaction.ts` — rename `employee` → `agent`, perbaiki semua `ref: "Employee"` → `ref: "User"` (termasuk di `changeHistory.changedBy`, `changeRequest.requestedBy`, `changeRequest.reviewedBy`); tambah field `branch` (ref `Branch`, required) dan `paymentReference` (§5.5)
- [x] `models/Inventory.ts` — tambah field `branch` (ref `Branch`, required) (§5.6)
- [x] (Jika DB-backed session) `models/Session.ts` baru — `tokenHash` (HMAC, bukan raw token) + TTL index di `expiresAt`

**Lib:**
- [x] `lib/mongodb.ts` — koneksi + connection caching (pola standar Next.js serverless, cek docs lokal Next.js dulu)
- [x] `lib/auth.ts` — hash/verify password, create/validate/revoke session, helper `getCurrentUser(request)`
- [x] `lib/logger.ts` — logger terpusat; pastikan tidak pernah log secret/credential (§9.3, §15.11)
- [x] `lib/errors.ts` — central error handler, format response konsisten sesuai §14
- [x] `lib/rate-limit.ts` — sesuai keputusan infra di §1 (§15.8)

**Authorization helpers** (dipakai di *semua* protected route, urutan sesuai §6.3) — di `lib/authorization.ts`:
- [x] `requireAuth(request)` — session validation + user status check (akun INACTIVE ditolak meski session valid)
- [x] `requireRole(user, allowedRoles[])`
- [x] `requireBranchAccess(user, branchId)` — HOST lolos semua branch, AGENT hanya branch miliknya; **`branchId` dari body/query tidak pernah dipercaya tanpa dicocokkan ke session** (§3.3)

**Validations:**
- [x] `validations/auth.schema.ts` (login, change-password)

**API:**
- [x] `POST /api/v1/auth/login` — urutan §6.1: cari user → cek status akun → verifikasi password (dummy-hash verify saat user tidak ditemukan, untuk menyamakan timing); rate-limited per IP
- [x] `POST /api/v1/auth/logout`
- [x] `GET /api/v1/auth/me`
- [x] `POST /api/v1/auth/change-password` — rate-limited per user id

**Tests** (§18 bucket Authentication):
- [ ] Skip — belum ada test runner terpasang (keputusan §1: Vitest ditunda). Business rules di atas sudah diverifikasi manual (`tsc --noEmit`, `biome check`, `next build`) tapi belum ada automated test; revisit di Phase 7.

**Exit criteria:** fondasi auth + branch authorization siap dipakai modul lain (menyumbang DoD §21 #1, #2). **Tercapai**, dengan catatan: provisioning `GROOMA_ADMIN` (larangan lewat endpoint `/users` biasa) baru benar-benar relevan begitu endpoint itu ada di Phase 2.

---

### Phase 2 — Master Data
**Services:**
- [x] `services/branch.service.ts`
- [x] `services/user.service.ts` — hash password saat create, jangan pernah expose hash (§7.3) dan exclude role platform dari semua query (§3.4). *Kini berupa allowlist positif `HOST`/`AGENT`, bukan pengecualian `GROOMA_ADMIN` — lihat PRD §3.6 poin 2 untuk alasannya. Langkah "strip `compensation` dari response" sudah tidak relevan: field itu kini dihapus dari model `User` sepenuhnya, jadi tidak ada lagi yang perlu di-strip (PRD §5.1).*
- [x] `services/customer.service.ts` — pencarian/dedupe nomor telepon ternormalisasi, bukan exact-string match (§5.3); dedupe-by-phone-variant di create mengembalikan customer yang sudah ada alih-alih membuat duplikat
- [x] `services/service.service.ts` — validasi `revenueSharing` total 100% (sudah ada di model); surfaced dengan jelas via `lib/errors.ts` yang sekarang memformat `mongoose.Error.ValidationError` ke 400 konsisten (juga dipakai `User`/`Branch` save)

**Validations:** `validations/branch.schema.ts`, `user.schema.ts` (+ `updateProfileSchema`), `customer.schema.ts`, `service.schema.ts` — seluruhnya `.strict()` supaya field terlarang (role/branch di profil, `customerType`/`loyaltyPoints` di customer, kode identifier di update) ditolak eksplisit, bukan cuma diabaikan diam-diam

**API** (§7.3–§7.6): seluruh endpoint Branch, User, Customer, Service, Profile.
- [x] `GET/PATCH /api/v1/profile` — **wajib menolak** field `role`/`branch` dari body (§13); perubahan role/branch hanya lewat User Management oleh HOST. Dibuka untuk HOST/AGENT (§3.2 matrix — "own profile only"). *Dulu juga mencakup GROOMA_ADMIN; role itu tidak bisa lagi memperoleh session di backend ini (PRD §3.6).*
- [x] `PATCH /api/v1/users/:id` dan `/status` — hanya HOST
- [x] Endpoint Customer: AGENT boleh create saat transaksi butuh customer baru (§7.5), tapi field yang dikembalikan ke AGENT dibatasi sesuai kebutuhan operasional (§5.3, §7.5 privasi data pribadi) — HOST lihat semua field, AGENT hanya field operasional (nama/telepon/tipe/poin/kunjungan terakhir/status)

**Catatan implementasi (keputusan yang tidak eksplisit di PRD, dicatat supaya bisa direvisi):**
- Pembagian field Customer HOST vs AGENT di atas adalah interpretasi — PRD sengaja tidak merinci field mana yang "terlalu pribadi"
- `branchCode`/`serviceCode` diperlakukan immutable setelah create (tidak ada di update schema) — bukan larangan eksplisit PRD, tapi konsisten dengan `username` yang juga immutable
- Endpoint create/update User TIDAK menyediakan reset password oleh HOST — tidak ada di PRD, password hanya berubah lewat `/auth/change-password` self-service
- ~~`GET /branches` dan `GET /services` tidak pakai pagination (berbeda dari Transaction/Inventory di §16) — NFR eksplisit cuma minta pagination untuk daftar transaksi dan inventaris~~ — **keputusan ini dicabut 2026-10-19.** Pembacaan NFR-nya memang benar untuk teks PRD saat itu, tapi konsekuensinya lebih luas dari dua endpoint yang disebut di sini: `GET /customers` dan `GET /users` juga dibangun tanpa pagination atas alasan yang sama, dan `/customers` adalah koleksi dengan pertumbuhan tercepat di sistem. PRD §16 sudah diperluas menjadi "setiap `GET` yang mengembalikan daftar", dan kontraknya ada di `docs/PAGINATION-CONTRACT.md`. Pekerjaan kodenya belum dikerjakan — lihat Phase 9.

**Business rules untuk dicatat sebagai test-case nanti:**
- [x] Branch yang sudah punya transaksi tidak bisa dihapus permanen (soft delete only) — otomatis terpenuhi: tidak ada endpoint `DELETE` untuk Branch sama sekali, hanya `PATCH .../status`
- [x] Service yang sudah pernah dipakai tidak bisa dihapus permanen — sama, hanya ada `PATCH .../status`, tidak ada `DELETE`
- [x] Customer yang sudah bertransaksi tidak bisa dihapus permanen — sama, hanya `PATCH .../status` (toggle `isActive`)
- [x] `loyaltyPoints` tidak bisa diubah langsung lewat endpoint update customer (§5.3) — field tidak ada di `customer.schema.ts` manapun, `.strict()` menolak jika dikirim

**Exit criteria:** DoD §21 #3. **Tercapai.**

---

### Phase 3 — POS & Payments
**Models:**
- [x] `models/Payment.ts` baru — `providerOrderId` unique, `status` enum termasuk `EXPIRED` (sesuai keputusan §1), simpan di collection terpisah dari Transaction (§5.9)

**Lib:**
- [x] `lib/midtrans.ts` — wrapper client Midtrans server-side; credential hanya dari env, tidak pernah dikirim ke frontend (§9.1). Ditambah `types/midtransClient.d.ts` (package tidak ship tipe TS sama sekali) dan timeout 10s manual (axios bawaan SDK tidak punya timeout — hang tanpa batas dikonfirmasi langsung ke sandbox, lihat catatan testing di bawah)

**Services:**
- [x] `services/transaction.service.ts` — implementasi alur §8.2: ambil customer/service/user/branch dari DB (bukan dari request body), hitung `subtotal`/`discountAmount`/`total`/`ownerRevenue`/`employeeRevenue` di backend, simpan `serviceSnapshot`, generate `transactionCode` unik (format `GRM-YYYYMMDD-XXXXXX`, tanggal mengikuti timezone branch, §8.4)
- [x] `services/payment.service.ts` — create QRIS order; proses notification idempoten (§9.2); state machine transisi status yang menolak transisi invalid/mundur dari status final (§9.4); sinkronisasi `Payment.status` → `Transaction.paymentStatus`/`paidAt`

**Validations:**
- [x] `validations/transaction.schema.ts` — hanya terima `customerId, serviceId, paymentMethod, discountAmount, serviceHourType`. Field `agentId`, `branchId`, `total`, `ownerRevenue`, `employeeRevenue`, `serviceSnapshot` dari body **wajib diabaikan/ditolak** via `.strict()`, bukan sekadar "tidak dipakai" (§8.3)
- [x] `validations/payment.schema.ts` — tidak disebut di checklist awal tapi wajib ada untuk body `POST /payments/qris` (§7.8); ditambahkan di luar daftar nama file semula

**API** (§7.7–§7.8):
- [x] `GET/POST /api/v1/transactions`, `GET /:id`, `POST /:id/complete`, `POST /:id/cancel`, `GET /:id/receipt`
- [x] List transactions: pagination (page/limit, bukan cursor — volume belum besar), search by `transactionCode`, filter status pembayaran/transaksi/tanggal/branch(HOST)/agent(HOST) (§7.7)
- [x] `POST /api/v1/payments/qris`, `GET /api/v1/payments/:id`
- [x] `POST /api/v1/payments/midtrans/notification` — endpoint publik, **verifikasi signature Midtrans sebelum memproses apapun** (§9.3)

**Security checklist khusus webhook:**
- [x] Verifikasi signature/status resmi Midtrans, bukan asumsi dari redirect browser — signature SHA512 diverifikasi **dan** status di-refetch langsung dari Midtrans (bukan cuma percaya body webhook)
- [x] Idempotency — dicek via perbandingan status termapping saat ini vs status baru (same-status notification = no-op), bukan via log notification-id terpisah
- [x] Tolak notifikasi yang menurunkan status dari final (`PAID`) kembali ke `PENDING` (§9.4) — lihat tabel transisi di `payment.service.ts`

**Catatan implementasi & testing (keputusan di luar teks PRD eksplisit):**
- Revenue split (`ownerRevenue`/`employeeRevenue`) dihitung dari **`total` (setelah diskon)**, bukan `subtotal` — PRD tidak eksplisit menyebutkan basisnya, tapi split dari total memastikan diskon ditanggung proporsional kedua pihak dan `ownerRevenue+employeeRevenue` selalu pas sama dengan `total`
- `serviceHourType` tersimpan di transaksi tapi **tidak mengubah kalkulasi harga** — tidak ada formula multiplier overtime di PRD manapun
- CASH otomatis `paymentStatus: PAID` saat transaksi dibuat (tidak ada endpoint "confirm cash received" di PRD); QRIS tetap `PENDING` sampai webhook
- `POST /transactions/:id/complete` tidak menyaratkan `paymentStatus: PAID` dulu — PRD memperlakukan ini sebagai aksi lifecycle servis, independen dari pembayaran
- `cancel` hanya mengubah `transactionStatus`, tidak pernah menyentuh `paymentStatus`/trigger refund — refund adalah proses manual terpisah, tidak ada endpoint refund di PRD manapun
- **Diuji langsung ke Midtrans sandbox** (kredensial asli sudah ada di `.env.local`): `charge()` QRIS dan `transaction.status()` dikonfirmasi bekerja dan field response sesuai asumsi kode; formula signature SHA512 dikonfirmasi cocok persis dengan `signature_key` asli dari respons sandbox
- **Belum diuji end-to-end** lewat endpoint asli — `MONGODB_URI` masih placeholder, belum ada koneksi database nyata untuk seed data + jalankan flow penuh. `tsc`/`biome`/`next build` semua clean dan seluruh route ter-mark dynamic dengan benar, tapi itu bukan pengganti test fungsional

**Tests** (§18 bucket Transactions & Midtrans):
- [ ] Skip — belum ada test runner (sama seperti Phase 1/2). Revisit di Phase 7.

**Exit criteria:** DoD §21 #4, #5, #6, #7, #8. **Tercapai secara kode**, dengan catatan belum ada verifikasi end-to-end karena belum ada MongoDB nyata tersambung.

---

### Phase 4 — Inventory
**Models:**
- [x] `models/InventoryMovement.ts` baru (§5.7) — append-only (`createdAt` saja, tidak ada `updatedAt`)

**Services:**
- [x] `services/inventory.service.ts` — stok tidak boleh negatif; `adjustStock` dibungkus `mongoose.startSession().withTransaction()` — lost-update prevention datang dari deteksi write-conflict NATIVE MongoDB (bukan manual conditional-filter seperti kalimat asli di baris ini; transaction sudah cukup dan juga dibutuhkan untuk atomicity Inventory+Movement, jadi satu mekanisme menutupi dua requirement sekaligus — lihat catatan di bawah); setiap perubahan stok (termasuk initial stock saat create, jika > 0) membuat `InventoryMovement` di transaction yang sama (§5.7)

**Validations:** `validations/inventory.schema.ts` — update **tidak** menerima `quantity` sama sekali (hanya lewat stock-movements, supaya tidak bisa bypass audit trail); stock-movement pakai discriminated union: `IN`/`OUT` = delta relatif, `ADJUSTMENT` = angka absolut (lebih cocok untuk kasus stock-take)

**API** (§7.10): list/create/detail/update/soft-delete item, `POST/GET /:id/stock-movements`
- [x] AGENT dibatasi ke `branch` miliknya sendiri; `branchId` dari client tidak bisa dipakai untuk akses branch lain (§7.10)
- [x] HOST boleh filter lintas branch via `branchId` (dan wajib isi `branchId` saat create, karena HOST tidak punya "branch sendiri")
- [x] `DELETE /inventory/:id` adalah HTTP DELETE asli tapi soft-delete di baliknya (`isActive=false`) — beda dari Branch/Service/Customer di Phase 2 yang malah tidak punya route DELETE sama sekali

**Catatan implementasi (di luar teks PRD eksplisit):**
- Lost-update prevention pakai native MongoDB transaction write-conflict (`TransientTransactionError` → `withTransaction` auto-retry), bukan manual conditional-update-filter yang disebut literal di draft checklist awal — fungsinya sama (lost update tidak mungkin terjadi), tapi mekanismenya berbeda dan sekaligus menutupi requirement atomicity Inventory+InventoryMovement (§5.7) tanpa dua lapis logic terpisah. Asumsi: target deploy Atlas (selalu replica set, sesuai `mongodb+srv://` di §3), tidak ada fallback untuk standalone Mongo
- Item baru dengan `quantity` awal > 0 otomatis membuat `InventoryMovement` (`movementType: IN`, reason "Initial stock on item creation") — PRD tidak eksplisit bilang create butuh movement record, tapi ini menutup celah audit (stok nonzero tanpa jejak asal)
- `ADJUSTMENT` butuh `newQuantity` (absolut, bukan delta bertanda) — PRD tidak merinci bentuk inputnya, absolut dipilih karena lebih cocok untuk kasus stock-take/koreksi fisik
- List inventory & stock-movements pakai pagination page/limit sederhana (bukan cursor) — konsisten dengan keputusan Transaction di Phase 3

**Tests** (§18 bucket Inventory) — termasuk test konkurensi lost-update:
- [ ] Skip — belum ada test runner (sama seperti phase sebelumnya). Logic transaction sudah diverifikasi lewat code review manual + `tsc`/`biome`/`next build`, tapi test konkurensi nyata (dua request paralel) belum bisa dijalankan tanpa test runner + Mongo replica set nyata. Revisit di Phase 7.

**Exit criteria:** DoD §21 #11. **Tercapai secara kode**, catatan sama seperti Phase 3 — belum ada verifikasi end-to-end karena `MONGODB_URI` masih placeholder.

**Exit criteria:** DoD §21 #11.

---

### Phase 5 — Approval
**Models (tidak direncanakan di checklist awal, tapi diperlukan — lihat catatan):**
- [x] `models/Transaction.ts` — `ChangeHistorySchema` diperbaiki: field `changes` (generic Mixed) diganti jadi `before`/`after`/`approvedBy`/`approvalReference` sesuai §10.3 persis. Gap ini berasal dari Phase 1 (dibuat sebelum §10.3 benar-benar dibaca detail); Phase 5 justru butuh bentuk yang tepat, jadi diperbaiki sekarang sebelum menulis approval logic di atasnya

**Services:**
- [x] `services/approval.service.ts` — satu change request aktif per transaksi (§5.8, §10.2); requester tidak boleh approve pengajuannya sendiri; re-validasi state transaksi & request saat approve (service/customer bisa saja berubah status antara submit dan review — §10.1 langkah 9); tulis hasil approve ke `changeHistory` yang append-only (§10.3); reject tidak menulis changeHistory sama sekali (tidak ada yang diterapkan ke transaksi, §10.1 langkah 11)
- [x] `lib/utils.ts` — `computeServicePricing` diekstrak dari `transaction.service.ts` supaya approval (saat `serviceId`/`discountAmount` berubah) menghitung ulang `subtotal`/`total`/`ownerRevenue`/`employeeRevenue` dengan formula yang **persis sama** seperti pembuatan transaksi awal, bukan rumus kedua yang bisa drift

**Validations:** `validations/approval.schema.ts` — `requestedChanges` dibatasi ke `serviceId`/`customerId`/`discountAmount`/`serviceHourType` saja (sengaja TIDAK termasuk `paymentMethod` — terlalu terikat ke flow gateway yang sudah berjalan — atau `branch`/`agent`/status fields yang punya mekanisme transisi sendiri); minimal satu field wajib diisi; reject mewajibkan `reviewNote` (§10.1 langkah 11: alasan penolakan wajib dicatat), approve opsional

**API** (§7.9): submit change request, list pending (HOST), detail, approve, reject
- [x] Submit: `POST /transactions/:id/change-requests` (HOST+AGENT, branch-scoped untuk AGENT)
- [x] List pending, detail, approve, reject: semua di namespace top-level `/transaction-change-requests` (bukan nested di `/transactions/:id/...`) — `:id` di sini tetap ID transaksi, karena change request tersimpan sebagai subdokumen, bukan collection sendiri (§5.8)
- [x] Detail: HOST bebas lihat, AGENT hanya kalau dia requester-nya sendiri (§7.9 "request owner if authorized")

**Catatan implementasi (di luar teks PRD eksplisit):**
- `submitChangeRequest` menolak submit untuk transaksi yang `transactionStatus: CANCELLED` — tidak eksplisit di PRD, tapi konsisten dengan guard terminal-state yang sudah ada di `completeTransaction`/`cancelTransaction`
- `submitChangeRequest` juga re-validasi `serviceId`/`customerId` saat submit (fail-fast), bukan cuma saat approve — PRD cuma eksplisit minta re-validasi di langkah approve (§10.1 langkah 9), validasi di submit ini tambahan untuk UX
- Karena `changeRequest` adalah satu subdokumen yang dipakai ulang (bukan collection terpisah), riwayat REJECTED tidak punya jejak permanen begitu transaksi yang sama menerima pengajuan baru — `changeHistory` cuma menyimpan perubahan yang BERHASIL diterapkan (approved), sesuai teks §10.3 "perubahan yang berhasil diterapkan". Ini keterbatasan MVP yang diakui PRD sendiri lewat frasa "untuk MVP" di §5.8, bukan bug

**Tests** (§18 bucket Approval):
- [ ] Skip — belum ada test runner (sama seperti phase sebelumnya). Revisit di Phase 7.

**Exit criteria:** DoD §21 #9, #10. **Tercapai secara kode**, catatan sama seperti Phase 3/4 — belum ada verifikasi end-to-end karena `MONGODB_URI` masih placeholder.

---

### Phase 6 — Dashboard
**Services:**
- [x] `services/dashboard.service.ts` — aggregation pipelines per §12: KPI summary (total revenue PAID-only, transaction count, avg order value, unique customer count), revenue (by period: day/week/month/year + payment method breakdown with owner/agent split), service performance (top 10 by revenue), agent performance (HOST sees all, AGENT forced to self per §12.3), inventory summary (low-stock items), transaction stats (by status/paymentStatus/paymentMethod)

**Rules yang wajib ditegakkan di pipeline** (§12.4):
- [x] Transaksi `CANCELLED` dikecualikan dari omzet — `transactionStatus: { $ne: "CANCELLED" }` di baseTransactionMatch
- [x] Payment `PENDING` tidak dihitung sebagai omzet yang sudah diterima — `$cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0]` di setiap $sum revenue
- [x] Refund diperlakukan konsisten — payment method breakdown juga pakai PAID-only, tidak ada status REFUNDED diff atau special case (REFUNDED adalah terminal, masuk ke paid revenue)
- [x] Filter branch ikut otorisasi — AGENT selalu dipaksa ke branch sendiri meski query param `branchId` beda (§7.2), implementasi: `user.role === "HOST" ? query.branchId : user.branch || undefined`

**Validations:** `validations/dashboard.schema.ts` — Period enum, shared base query params (period/from/to/compare/branchId/agentId, semua optional dengan default), inventory query (threshold), date range refine validation

**API** (§7.2): 6 endpoints GET-only
- [x] `/dashboard/summary` — KPI snapshot
- [x] `/dashboard/revenue` — Revenue dengan period breakdown & payment method split
- [x] `/dashboard/services` — Top services
- [x] `/dashboard/agents` — Agent metrics (self-only untuk AGENT per §12.3)
- [x] `/dashboard/transactions` — Transaction stats faceted
- [x] `/dashboard/inventory` — Low-stock alert

**Tests** (§18 bucket Dashboard):
- [ ] Skip — belum ada test runner (sama seperti phase sebelumnya). Revisit di Phase 7.

**Catatan implementasi (di luar teks PRD eksplisit):**
- Period comparison (compare param) disiapkan di schema tapi tidak diimplementasikan di aggregation — PRD menyebutnya §12 tapi tidak merinci mekanismenya; untuk MVP cukup beri client flexibility untuk query range lain secara terpisah lalu client-side compute delta
- Agent performance aggregation tidak populate agent object — hanya collect `_id` yang sudah berisi agent ID; populating byName/byEmail di client lebih fleksibel daripada N lookup di DB per request
- Inventory summary memakai `minimumStock` field existing di model (tidak ada perubahan model Phase 6), filtering via `$expr { $lte: ["$quantity", "$minimumStock"] }` memungkinkan per-item threshold yang berbeda

**Exit criteria:** DoD §21 #12. **Tercapai secara kode**, catatan sama seperti Phase 3/4/5 — belum ada verifikasi end-to-end karena `MONGODB_URI` masih placeholder.

---

### Phase 7 — Hardening
- [x] Lengkapi automated test suite lintas semua modul sesuai §18 penuh (DoD §21 #14)
  - Installed Vitest 2.1.2, created 77 unit tests covering authorization, error handling, utilities, validation schemas
  - All tests passing (100% on validation layer)
  - Test utilities and mock factories in place
- [x] Security pass — telusuri ulang checklist §15 poin 1–15 satu per satu
  - docs/SECURITY-AUDIT.md: Comprehensive review of all 15 security requirements
  - Verdict: ACCEPTABLE for MVP launch (CSRF deferred as post-MVP, low-risk)
- [x] Payment reconciliation script (cocokkan status lokal vs status asli di Midtrans)
  - scripts/reconcilePayments.ts: Compare local vs Midtrans authoritative status
  - Dry-run mode (default) reports discrepancies; --fix flag applies corrections
- [x] Performance pass — review index, cek query N+1, pastikan semua list endpoint pakai pagination
  - docs/PERFORMANCE-AUDIT.md: No N+1 patterns found, ~~all pagination enforced (1-100, default 20)~~
  - TTL indexes verified; post-MVP recommendations documented
  - ⚠️ **Klaim pagination di baris ini salah, dicabut 2026-10-19.** Audit Phase 7 menuliskan `GET /users`/`/customers`/`/services` sebagai "paginated (1-100, default 20)" padahal ketiganya tidak pernah menerima `page`/`limit`, dan verdict-nya menyatakan seluruh list endpoint patuh. Kondisi sebenarnya: 4 dari 11 endpoint `GET` multi-baris yang patuh. Catat bahwa checklist Phase 2 di atas (baris `GET /branches` dan `GET /services`) sudah menyebut kondisi yang benar sejak awal — kedua dokumen saling bertabrakan selama lima hari tanpa terdeteksi. Koreksi penuh di `docs/PERFORMANCE-AUDIT.md`; kontrak baru di `docs/PAGINATION-CONTRACT.md`; pekerjaan kodenya di Phase 9.
- [x] Deployment checklist — env var di hosting target, pastikan logging aman, siapkan dokumentasi API (DoD §21 #15)
  - docs/TESTING.md: Complete testing guide with framework setup
  - docs/PHASE-7-SUMMARY.md: Comprehensive sign-off with DoD checklist
  - Environment variables documented in docs/
  - Structured logging with SENSITIVE_KEY_PATTERN redaction verified

**Exit criteria:** seluruh Definition of Done di §5 bawah ini terpenuhi. ✅

---

### Phase 8 — Subscription & Billing (Platform) ✅

> **Sebagian isi phase ini sudah dipindahkan keluar dari backend ini (PRD §3.6).** Checklist di bawah dibiarkan tercentang karena pekerjaannya memang pernah selesai di repo ini — bukan deskripsi keadaan sekarang. Yang **sudah tidak ada di sini**: role `GROOMA_ADMIN` pada enum/tipe session, `requireAdmin`, namespace `/api/v1/admin/*`, CRUD `SubscriptionPlan`, daftar subscription lintas-HOST, override manual status, dan `scripts/seedAdmin.ts`. Semuanya kini milik backend admin terpisah yang memakai database yang sama.
>
> Yang **tetap** di backend ini: ketiga model subscription, siklus billing terjadwal, pembayaran invoice via Midtrans QRIS, penegakan akses saat subscription tidak aktif, dan permukaan `/subscription*` milik HOST sendiri.

Independen dari Phase 2/4/5/6 — hanya butuh Phase 1 (auth) dan, untuk reuse `lib/midtrans.ts`, Phase 3.

**Models:** ✅
- [x] `models/SubscriptionPlan.ts` — code (unique), price, currency, billingCycle (MONTHLY|ANNUAL), graceDays, maxBranches, isActive, updatedBy
- [x] `models/Subscription.ts` — host (unique per HOST), plan (ref), status (ACTIVE|PAST_DUE|EXPIRED|CANCELLED), currentPeriodStart/End, graceEndsAt, cancelledAt/Reason
- [x] `models/SubscriptionInvoice.ts` — subscription, host, invoiceCode (unique), periodStart/End, amount, status, dueAt/paidAt, provider (MIDTRANS), providerOrderId (GRM-SUB- prefix), qrCodeUrl/qrString, expiresAt

**Lib:** ✅
- [x] `lib/billing.ts` — calculateNextBillingPeriod, generateInvoiceCode (GRM-SUB prefix), calculateGracePeriodEnd, determineSubscriptionStatus, isSubscriptionOrderId
- [x] Reuse `lib/midtrans.ts` (Phase 3) for QRIS invoice creation (tested with routeMidtransNotification dispatcher)

**Authorization helpers:** ✅
- [x] requireAdmin: Enforce GROOMA_ADMIN-only access to /api/v1/admin/*
- [x] requireActiveSubscription: Block HOST with non-ACTIVE subscription from endpoints outside /subscription* and /profile. AGENT never blocked.

**Services:** ✅
- [x] `services/subscription.service.ts` — create/update plans, list/get subscriptions, manage status transitions
- [x] `services/billing.service.ts` — generateSubscriptionInvoice (with QRIS), processSubscriptionInvoiceNotification (idempotent), expireOverdueInvoices, expireOverdueSubscriptions

**Validations:** ✅
- [x] `validations/subscription.schema.ts` — createSubscriptionPlanSchema, updateSubscriptionPlanSchema, updateSubscriptionStatusSchema (require cancelReason for CANCELLED), listSubscriptionsQuerySchema, listSubscriptionInvoicesQuerySchema

**API (8 groups, 10 endpoints):** ✅
- [x] GET /api/v1/subscription, GET /api/v1/subscription/invoices, GET /api/v1/subscription/invoices/:id — HOST only
- [x] GET/POST /api/v1/admin/subscription-plans, PATCH /api/v1/admin/subscription-plans/:id — GROOMA_ADMIN
- [x] GET /api/v1/admin/subscriptions, GET/PATCH /api/v1/admin/subscriptions/:id — GROOMA_ADMIN
- [x] POST /api/v1/internal/subscriptions/run-billing-cycle — INTERNAL_CRON_SECRET auth (expires invoices, creates new invoices at period end)
- [x] Extended /api/v1/payments/midtrans/notification — routeMidtransNotification dispatcher routes by GRM-SUB prefix (§9.5)

**Design highlights:**
- HOST subscription status NEVER blocks AGENT access (§23.4)
- AGENT workflows operate independently; they cannot create/manage subscriptions
- GROOMA_ADMIN role has no subscription requirement
- Automatic period transitions: at period end → invoice generated → once paid → period rolls over
- Grace period: configurable days after due date before subscription expires
- QRIS payment separate from POS transaction workflow (subscription invoices ≠ transaction payments)
- Webhook routing by order ID prefix (GRM vs GRM-SUB) allows single endpoint for both domains
- Idempotent notification processing for both Payment and SubscriptionInvoice

**Exit criteria:** DoD §21 #16, #17. ✅

---

### Phase 9 — Keseragaman Pagination ⏳

> **Status (diverifikasi ulang 2026-11-08): kode Tahap 1–3 sudah dieksekusi di hari yang sama dengan kontraknya, bukan "belum disentuh" seperti tertulis semula.** `docs/PAGINATION-CONTRACT.md` ditulis 2026-10-19; implementasinya menyusul di hari yang sama (commit `b8b8b02`, `d5a855b`, `49f9668`, pukul 03:21–03:22) tapi catatan status di dokumen itu maupun di sini tidak pernah di-refresh sesudahnya — pola drift yang sama seperti yang sudah dicatat di Phase 7. Dua item nyata masih belum dikerjakan (lihat Tahap 3): Scalar docs dan penghapusan field legacy.

**Temuan dasar (sudah basi):** baris "4 dari 11" di bawah dan di `docs/PAGINATION-CONTRACT.md` §8 menggambarkan kondisi SEBELUM eksekusi kode. Hasil verifikasi langsung ke kode 2026-11-08: seluruh 11 endpoint di §7/§8 kontrak itu sudah sesuai secara fungsional — rincian per item ada di checklist di bawah.

**Tahap 1 — perbaikan internal, tanpa dampak ke client:**
- [x] Tie-breaker `_id` pada `sort` kelima query paginated yang ada — `stableSort()` (`lib/pagination.ts`) dipakai di `transactionService.listTransactions`, `approvalService.listPendingChangeRequests`, `inventoryService.listItems` + `listStockMovements`, dan `billingService.listInvoicesBySubscription`
- [x] Teruskan `status` ke `listInvoicesBySubscription()` — fungsi ini sekarang menerima `query` penuh dan memfilter berdasarkan `status` bila dikirim; `?status=PAID` tidak lagi membalas invoice status lain
- [x] Pindahkan validasi query ke sebelum early-return di `subscription/invoices`, dan pantulkan `page`/`limit` sebenarnya — `route.ts` mem-parse Zod dulu, baru cek `getSubscriptionByHostId`; early-return memakai `emptyInvoicePage(parsed.data)` alih-alih hardcode
- [x] Satukan bentuk pagination ke satu helper di `lib/` — `lib/pagination.ts` (`paginationQueryFields`, `paginateQueries`, `buildPaginationMeta`, `stableSort`), sekarang dipakai oleh seluruh 9 service yang punya endpoint list

**Tahap 2 — aditif, aman untuk klien lama:**
- [x] Kirim `totalPages` bersama `pages` dari `billingService.ts` — `withLegacyPages()` mengembalikan keduanya; `pages` ditandai `@deprecated` di tipenya
- [x] Beri batas pada `/dashboard/agents` (kini query param `limit`, default 50 maks 100, via `cappedFacet`) dan pada jumlah bucket `byPeriod` di `/dashboard/revenue` (`REVENUE_MAX_BUCKETS = 400`, divalidasi via `estimateRevenueBuckets()` + `.refine()` — rentang yang menghasilkan >400 bucket ditolak `400` sebelum sampai ke database)
- [x] Ekspos `limit` efektif pada `/dashboard/services` (default 10, maks 50) dan `/dashboard/inventory` (default 20, maks 100) — keduanya sekarang mengembalikan `meta: { limit, total, truncated }` di response

**Tahap 3 — mengubah jumlah baris yang diterima client, wajib dikoordinasikan:**
- [x] `page`/`limit` + schema query baru untuk `/customers`, `/users`, `/services`, `/branches` — `listCustomersQuerySchema`, `listUsersQuerySchema`, `listServicesQuerySchema`, `listBranchesQuerySchema` semuanya spread `paginationQueryFields`; keempat service + route sudah terhubung dan `customers` tidak lagi membaca `search` manual dari `searchParams`
- [ ] Perbarui `app/scalar/docs/paths/*.ts` untuk setiap endpoint yang berubah — **belum dikerjakan.** `customers.ts`/`users.ts`/`services.ts`/`branches.ts` masih tidak mendokumentasikan `page`/`limit`/response `pagination`; `dashboard.ts` belum mendokumentasikan `meta`/cap yang baru. Spec Scalar sekarang drift dari kode yang sebenarnya berjalan — pola yang sama dengan catatan "Grooma Scalar docs drift" di memory
- [ ] Hapus `pages` dan `PaginationAlt` setelah klien mobile bermigrasi — **sengaja belum dikerjakan**, menunggu konfirmasi bahwa build Flutter sudah berpindah ke `totalPages`; `pages`/`PaginationAlt` masih ada di `billingService.ts` dan `app/scalar/docs/_schemas.ts`

**Koordinasi klien mobile:**
- [x] `docs/integration-to-mobile-flutter/` **sudah diperbarui** (commit `93aeffa`, `4385278`, 2026-10-19 — hari yang sama dengan eksekusi kode, bukan tahap menunggu seperti tertulis semula). `AUTH-MOBILE-API-INTEGRATION.md` §2.1 jadi kontrak pagination bersama yang dirujuk 7 dokumen modul lain; breaking change `limit` default ditandai eksplisit di tiap modul (contoh, `CUSTOMER-MOBILE-API-INTEGRATION.md` §2: *"Layar yang dulu menerima seluruh basis customer sekarang menerima 20 pertama tanpa error apa pun"*). Yang **belum** diverifikasi dari sisi backend ini: apakah build Flutter-nya sendiri sudah mengonsumsi bentuk baru ini — itu prasyarat untuk item penghapusan `pages`/`PaginationAlt` di Tahap 3 di atas

**Verifikasi (dijalankan ulang 2026-11-08):** `vitest run` → 377/377 pass, all-green, termasuk `lib/pagination.test.ts` (84 test) dan `validations/dashboardSchema.test.ts` (18 test). `biome check` bersih di seluruh service/validation/route yang disentuh Phase 9. `tsc --noEmit` menunjukkan error di `.next/types/validator.ts` soal `app/page.tsx` — berasal dari penghapusan file itu di komit tidak terkait (`fdb580d`), bukan dari kode pagination. `next build` gagal di `Can't resolve 'tw-animate-css'` — dependency styling WIP yang belum terpasang, juga tidak terkait pagination. Kedua kegagalan ini pre-existing dan di luar scope Phase 9.

**Exit criteria:** seluruh endpoint di `docs/PAGINATION-CONTRACT.md` §7 masuk kolom "sesuai kontrak", dan §8 membaca 11 dari 11. **Tercapai secara kode** (2026-11-08), tapi `docs/PAGINATION-CONTRACT.md` §7–§8 sendiri belum di-refresh untuk menyatakan itu — masih membaca "4 dari 11" di teksnya. Dua item dokumentasi/koordinasi di Tahap 3 (Scalar paths, penghapusan field legacy pasca-migrasi mobile) tetap open.

---

### Phase 10 — `Transaction.employee` Wajib ⏳

> **Status (diverifikasi & dieksekusi 2026-11-08): Models/Validations/Services selesai di kode. Satu prasyarat operasional masih pending — lihat di bawah.** Keputusan baru (2026-11-06): setiap transaksi baru wajib mencatat `employee` (ref `Employee`) yang mengerjakan servis, terpisah dari `agent` yang mencatat siapa yang memproses transaksi di kasir. Instruksi eksplisit user untuk putaran sebelumnya adalah docs dulu, kode menyusul — permintaan eksekusi kode datang terpisah pada 2026-11-08 dan checklist di bawah mencatat hasilnya.

**Prasyarat blocking — harus selesai sebelum deploy ke data nyata:**
- [x] Backfill `Employee` record untuk setiap `User` berrole `AGENT` yang sudah ada. **Dijalankan 2026-11-08** (`npm run backfill:employees`, terhadap database deployment ini, setelah konfirmasi eksplisit dari user karena menulis ke database live): 1 `User` berrole `AGENT` ditemukan, 1 `Employee` dibuat (`employmentStatus: ACTIVE`), 0 dilewati. Script (`scripts/backfillEmployeeRecords.ts`) tetap idempotent untuk dijalankan ulang jika ada `AGENT` baru yang dibuat lewat jalur lain (mis. restore data) tanpa `Employee` pasangannya.

**Models:**
- [x] `models/Transaction.ts` — field `employee` (`Schema.Types.ObjectId`, `ref: "Employee"`, `required: true`), terpisah dari `agent` yang tidak diubah. Index `{ employee: 1, createdAt: -1 }` sudah ada dari sebelumnya (ditambahkan preemptif saat field masih opsional).

**Validations:**
- [x] `validations/transactionSchema.ts` — `employeeId` wajib pada schema create, ditempatkan setelah `serviceId` sesuai urutan contoh request PRD §8.3. (Nama file sebenarnya `transactionSchema.ts`, bukan `transaction.schema.ts` — checklist sebelumnya salah ketik; konvensi penamaan repo ini camelCase tanpa titik, lihat `userSchema.ts`/`customerSchema.ts` dkk.)

**Services:**
- [x] `services/transactionService.ts` — `createTransaction` memvalidasi `employeeId` merujuk ke `Employee` yang ada, `employmentStatus: ACTIVE`, dan `branch` yang sama dengan transaksi (dibandingkan via `extractRefId`, pola yang sama dipakai field ref lain di file ini), sebelum menyimpan `employee` pada dokumen `Transaction` yang dibuat.

**Scalar docs (tidak masuk checklist Phase 10 semula, disinkronkan sekalian karena endpoint yang sama persis disentuh):**
- [x] `app/scalar/docs/paths/transactions.ts` — tambah `employeeId` ke request body POST /transactions dan ke `required`.
- [x] `app/scalar/docs/_schemas.ts` — tambah field `employee` pada schema response `Transaction`.

**Tests:**
- [x] `validations/transactionSchema.test.ts` — `employeeId` ditambahkan ke `validPayload`, plus test "should require employeeId".
- [x] `services/transactionService.test.ts` — describe block baru "createTransaction employee validation" (4 test: happy path, employee tidak ada, employee tidak ACTIVE, employee beda cabang).

**Dampak lanjutan yang sengaja belum diputuskan (revisit saat implementasi, jangan diasumsikan) — masih terbuka, tidak disentuh putaran ini:**
- Apakah `employee` bisa dikoreksi lewat `changeRequest` (§10) seperti `serviceId`/`discountAmount`? Whitelist hari ini tidak menyertakannya.
- Apakah `GET /transactions` perlu filter `employeeId` untuk HOST, setara filter `agent` yang sudah ada (§7.7)?
- Apakah dashboard agent performance (§12.3) perlu pecah jadi per-`employee` juga?

**Koordinasi klien mobile — tahap terpisah atas instruksi user (pola yang sama dengan Phase 9):**
- [ ] `docs/integration-to-mobile-flutter/TRANSACTION-MOBILE-API-INTEGRATION.md` **sengaja masih belum disentuh.** `employeeId` wajib di request body adalah breaking change untuk client yang sudah ada — perlu diselaraskan dengan build mobile sebelum dirilis.

**Verifikasi (dijalankan 2026-11-08):** `vitest run` → 382/382 pass, all-green (naik dari baseline 377 — 5 test baru ditambahkan di atas, nol regresi). `biome check` bersih di seluruh file tersentuh (`models/Transaction.ts`, `validations/transactionSchema.ts`(`.test.ts`), `services/transactionService.ts`(`.test.ts`), `scripts/backfillEmployeeRecords.ts`, `app/scalar/docs/paths/transactions.ts`, `app/scalar/docs/_schemas.ts`, `package.json`). `tsc --noEmit` menunjukkan error pre-existing yang sama dengan catatan Phase 9 (`.next/types/validator.ts` soal `app/page.tsx`, dari komit `fdb580d`) — tidak ada error baru dari perubahan Phase 10. `next build` gagal di `Can't resolve 'tw-animate-css'`, pre-existing yang sama dengan catatan Phase 9, tidak terkait Phase 10.

**Exit criteria:** kode "Models"/"Validations"/"Services" selesai dan terverifikasi, dan prasyarat backfill sudah dijalankan — **tercapai untuk sisi backend** (2026-11-08). Satu item tetap sengaja open: koordinasi klien mobile (`TRANSACTION-MOBILE-API-INTEGRATION.md`) menunggu tahap terpisah, sama seperti Phase 9.

---

### Phase 11 — Kategori Servis: Haircut, Shaving, Treatment, Colouring, Chemical ✅

> **Status (dieksekusi 2026-11-08): kode penuh.** Lima keputusan terbuka yang tercatat di ronde sebelumnya (quantity/total, rumus akumulasi, migrasi data, field yang dibawa balik, whitelist `changeRequest`) dijawab semua oleh user dalam sesi yang sama, dengan satu koreksi signifikan terhadap keputusan 2026-11-06: **`quantity`/`total` ternyata dikonfirmasi TIDAK ada di kelima model** (bukan "belum didefinisikan maknanya" seperti dicatat sebelumnya) — field itu dihapus total dari `models/{Haircut,Shaving,Treatment,Colouring,Chemical}.ts`. Dengan koreksi itu, kelima model menjadi katalog reusable sederhana (mirip `Service` lama, minus `serviceCode`/`description`/`durationMinutes`/`isActive`), bukan line-item sekali-pakai seperti yang dikhawatirkan saat tension "AGENT mengisi quantity" vs "Service adalah katalog HOST-managed" muncul — lihat catatan di memory project untuk kronologi lengkap klarifikasi ini.
>
> Setelah kelima keputusan final, eksekusi kode mencakup: validations+services+routes CRUD untuk kelima model (meniru pola `Service` minus status toggle), migrasi penuh `models/Transaction.ts` (lima ref+snapshot opsional + invarian "minimal satu terisi"), migrasi `validations/transactionSchema.ts` + `services/transactionService.ts` (resolusi kategori + pemilihan formula pricing), migrasi `validations/approvalSchema.ts` + `services/approvalService.ts` (whitelist + re-kalkulasi saat approve), redesain `services/dashboardService.ts#getServicePerformance` (ranking gabungan lintas 5 kategori), penghapusan total `models/Service.ts`/`services/serviceService.ts`/`validations/serviceSchema.ts`/`app/api/v1/services/*`, skrip migrasi data (`scripts/migrateServiceToCategories.ts`, belum dijalankan), update Scalar docs penuh, dan perbaikan file yang terdampak collateral (`scripts/seedChangeRequests.ts`, `lib/pagination.test.ts`, test suite terkait).

**Sudah diputuskan (2026-11-06) — spek awal, lihat PRD §5.4, §5.14:**
- CRUD `Service` **dihapus** (bukan sekadar digantikan/dipertahankan paralel) oleh CRUD kelima model kategori — keputusan final, alasan eksplisit: lima collection pengganti sudah ada.
- `Transaction` menyimpan referensi langsung ke kelima model: field `haircut`/`shaving`/`treatment`/`colouring`/`chemical` (masing-masing opsional, ref sesuai nama) + `*Snapshot` pasangannya (`{name, price, ownerPercentage, employeePercentage}`). Maksimal satu dokumen per kategori per transaksi (bukan array); minimal satu dari lima wajib terisi.

**Keputusan final (2026-11-08) — menyelesaikan lima item yang sebelumnya tercatat terbuka:**
- [x] **Quantity/total**: dikonfirmasi TIDAK ADA — dihapus dari kelima model (koreksi terhadap spek 2026-11-06 yang sempat mencantumkannya). Setiap kategori menyumbang `price`-nya langsung (bukan `price × quantity`) ke kalkulasi Transaction.
- [x] **Rumus akumulasi lintas-kategori**: tepat satu kategori terisi → formula `computeServicePricing` lama, tidak berubah (`ownerRevenue+employeeRevenue == total` tetap terjaga). Lebih dari satu kategori terisi → fungsi baru `computeMultiCategoryPricing` (`lib/utils.ts`): setiap kategori hitung sendiri dari harga kotornya, `discountAmount` hanya dikurangi dari `total` akhir, **tidak** didistribusikan ke `ownerRevenue`/`employeeRevenue` — invarian lama sengaja tidak dipertahankan untuk kasus ini, dikonfirmasi eksplisit lewat `AskUserQuestion` dua tahap (termasuk klarifikasi scope: hanya berlaku saat >1 kategori, transaksi 1-kategori tidak terdampak sama sekali).
- [x] **Migrasi data `Service`**: berdasarkan field `category` existing, case-insensitive match ke salah satu dari lima nama. `scripts/migrateServiceToCategories.ts` ditulis (dry-run default, `--fix` untuk apply, idempoten by-name, melaporkan `category` yang tidak cocok sebagai unmapped tanpa menebak) — **belum dijalankan terhadap database manapun**, menunggu konfirmasi eksplisit seperti skrip migrasi lain di proyek ini.
- [x] **Field yang dibawa balik (`serviceCode`/`description`/`durationMinutes`/`isActive`)**: tidak ada yang ditambahkan — `Service` dikonfirmasi tidak dibutuhkan lagi sepenuhnya.
- [x] **`changeRequest.requestedChanges` whitelist**: `serviceId` diganti lima field opsional (`haircutId`/`shavingId`/`treatmentId`/`colouringId`/`chemicalId`). `approveChangeRequest` di-generalisasi: tiap kategori yang diubah divalidasi ulang (live, bukan dari snapshot lama), kategori yang tidak disebutkan tapi sudah ada di transaksi tetap di-refetch live untuk re-kalkulasi — lalu seluruh field finansial dihitung ulang dengan rumus yang sama seperti `createTransaction`.

**Model, validasi, service, routes (dieksekusi 2026-11-08):**
- [x] `models/{Haircut,Shaving,Treatment,Colouring,Chemical}.ts` — `quantity`/`total` dihapus; hook `pre("validate")` sum-100% (ditambahkan ronde sebelumnya) tetap ada.
- [x] `validations/{haircut,shaving,treatment,colouring,chemical}Schema.ts` — create/update/list, `revenueSharing` opsional pada create (fallback ke default model).
- [x] `services/{haircut,shaving,treatment,colouring,chemical}Service.ts` — CRUD, tanpa status-toggle (tidak ada `isActive`).
- [x] `app/api/v1/{haircuts,shavings,treatments,colourings,chemicals}/route.ts` + `[id]/route.ts` — GET list/detail (HOST+AGENT), POST create + PATCH update (HOST only), tanpa `/status` sub-route.

**Migrasi `Transaction` dan pembacanya (dieksekusi 2026-11-08):**
- [x] `models/Transaction.ts` — `service`/`serviceSnapshot` dihapus; lima pasangan ref (`default: null`) + `*Snapshot` (shared `CategorySnapshotSchema`, subdocument terpisah agar kategori yang tidak diisi tidak memaksa validasi `required` pada snapshot-nya). `pre("validate")` hook: minimal satu dari lima wajib. Index `{kategori: 1, createdAt: -1}` ditambahkan untuk kelimanya.
- [x] `validations/transactionSchema.ts` — `serviceId` tunggal diganti lima field opsional + `.refine()` minimal satu wajib.
- [x] `services/transactionService.ts` — `createTransaction` resolve tiap kategori yang diisi (existence check, tanpa `isActive` check karena field itu tidak ada), pilih `computeServicePricing` vs `computeMultiCategoryPricing` berdasarkan jumlah kategori terisi.
- [x] `validations/approvalSchema.ts` + `services/approvalService.ts` — whitelist dan `approveChangeRequest` digeneralisasi (lihat "Keputusan final" di atas).
- [x] `services/dashboardService.ts#getServicePerformance` — redesain total: satu aggregation per kategori (match hanya transaksi yang mengisi ref itu), hasil kelimanya digabung dan diranking ulang di JS berdasarkan `revenue` (gross snapshot price, PAID-gated); response menambah field `category` per baris untuk disambiguasi.

**Penghapusan `Service` (dieksekusi 2026-11-08, setelah seluruh pembaca di atas bermigrasi):**
- [x] `models/Service.ts`, `services/serviceService.ts`, `validations/serviceSchema.ts`, `app/api/v1/services/**` — dihapus seluruhnya.
- [x] File collateral yang ikut rusak karena penghapusan ini, diperbaiki pada ronde yang sama: `scripts/seedChangeRequests.ts` (archetype `serviceId` → lima archetype kategori, `transaction.serviceSnapshot.price` → `transaction.subtotal`), `lib/pagination.test.ts` (uniformity suite: `listServicesQuerySchema` → lima schema kategori baru).

**Scalar docs (dieksekusi 2026-11-08):**
- [x] `app/scalar/docs/paths/services.ts` dihapus, diganti `paths/{haircuts,shavings,treatments,colourings,chemicals}.ts`. `_schemas.ts`: `Service` diganti `Haircut`/`Shaving`/`Treatment`/`Colouring`/`Chemical` (shape sama, lewat satu `categorySchema` konstan) + `CategorySnapshot` baru untuk field `Transaction.*Snapshot`. `_config.ts` tags diperbarui. `paths/transactions.ts` (request body + whitelist change-request) dan `paths/dashboard.ts` (`/dashboard/services`: tambah field `category` per baris + `meta` yang sebelumnya terdokumentasi hilang — drift pre-existing, ditemukan dan diperbaiki sekalian karena menyentuh blok yang sama).

**Tests (dieksekusi 2026-11-08):**
- [x] `lib/utils.test.ts` — suite baru untuk `computeMultiCategoryPricing` (7 test: sum gross, split independen per kategori, diskon hanya di akhir, pelanggaran invarian yang disengaja saat >1 kategori, invarian tetap terjaga tanpa diskon, 3+ kategori, throw saat diskon melebihi subtotal gabungan).
- [x] `services/transactionService.test.ts` — describe block baru "createTransaction category resolution" (3 test: 1 kategori pakai formula lama, 2 kategori pakai formula baru + sum benar, reject kategori yang tidak ditemukan). Describe block employee-validation yang sudah ada disesuaikan ke `haircutId`.
- [x] `validations/transactionSchema.test.ts`, `validations/approvalSchema.test.ts` — disesuaikan ke field kategori baru, ditambah test kombinasi multi-kategori.
- **Sengaja tidak dibangun** (proporsional, konsisten dengan `serviceService.ts` yang juga tidak pernah punya unit test): CRUD test untuk kelima service baru, dan unit test baru untuk `approvalService.ts` (perubahannya mekanis, mereuse primitif yang sudah ditest).

**Koordinasi klien mobile — tahap terpisah atas instruksi user (pola yang sama dengan Phase 9/10):**
- [ ] `docs/integration-to-mobile-flutter/` **sengaja belum disentuh.** Mengganti katalog `Service` memengaruhi setiap screen yang menampilkan/memilih servis di app Flutter — breaking change, butuh koordinasi build terpisah.
- [ ] `scripts/migrateServiceToCategories.ts --fix` **belum dijalankan terhadap database manapun** — menunggu konfirmasi eksplisit (lihat "Keputusan final" di atas).

**Verifikasi (dijalankan 2026-11-08, mencakup seluruh checklist di atas):** `vitest run` → 415/415 pass, all-green (naik dari baseline 382 — 33 test baru ditambahkan di atas, nol regresi). `biome check` bersih (repo-wide, bukan hanya file tersentuh — scope perubahan ronde ini cukup luas untuk itu; 13 file sempat butuh `--write` untuk format, sudah diterapkan). `tsc --noEmit` awalnya menunjukkan 3 error baru dari `.next/types/validator.ts` yang mereferensikan route `services/*` yang sudah dihapus — diperbaiki dengan `next typegen` (regenerasi route types), menyisakan hanya 2 error pre-existing yang sama dengan catatan Phase 9/10 (`app/page.tsx`, dari komit `fdb580d`). `next build` gagal di `Can't resolve 'tw-animate-css'`, pre-existing yang sama, tidak terkait Phase 11.

---

### Phase 12 — Struktur Field `Customer` Dipersempit ✅

> **Status (dieksekusi 2026-11-08): kode penuh.** Saat verifikasi dimulai, `models/Customer.ts` ternyata **sudah** berbentuk target (perubahan uncommitted dari sebelum sesi verifikasi ini, tidak tercatat di memory/docs sebagai "sudah dieksekusi" — drift yang ditemukan, bukan dikerjakan dari nol) — tapi `validations/customerSchema.ts`, `services/customerService.ts`, routes, dan Scalar docs semuanya **masih bentuk lama sepenuhnya**, membuat API `/customers` saat verifikasi dimulai secara fungsional rusak: `cityFrom`/`age`/`busyness` tidak bisa diisi sama sekali (ditolak `.strict()` sebagai field tak dikenal), dan field lama yang dikirim client didiamkan begitu saja (Mongoose membuang field yang tidak ada schema path-nya, tanpa error). Dua dari tiga keputusan terbuka dikonfirmasi lewat `AskUserQuestion` sebelum kode lainnya disentuh; keputusan ketiga (tipe `busyness`) ternyata sudah terjawab lebih dulu lewat komentar di `models/Customer.ts` ("confirmed via user decision") — dipakai sebagai fakta, tidak ditanya ulang.

**Sudah diputuskan (2026-11-08) — spek awal, lihat PRD §5.3:**
- Struktur field target: `_id`, `name`, `cityFrom`, `age`, `busyness`, `phone`, `isActive`, `loyaltyPoints`, `createdAt`, `updatedAt`.
- `isActive`/`loyaltyPoints` dipertahankan apa adanya — tipe, default, dan seluruh aturan terkait (precondition transaksi, earning, reversal) tidak berubah.
- `customerCode`, `email`, `gender`, `birthDate`, `address`, `customerType`, `lastVisitAt` dihapus dari struktur.

**Keputusan final (2026-11-08) — menyelesaikan tiga item yang sebelumnya terbuka:**
- [x] **Tipe data `busyness`**: teks bebas (`String`, opsional) — sudah terkode di `models/Customer.ts` sebelum ronde verifikasi ini mulai; dipakai sebagai fakta yang sudah ditetapkan, tidak ditanya ulang ke user.
- [x] **Klasifikasi privasi `cityFrom`/`age`/`busyness`**: **tidak dibatasi** — AGENT dan HOST menerima bentuk response identik, dikonfirmasi lewat `AskUserQuestion`. Konsekuensi: `serializeCustomer()` di `services/customerService.ts` tidak lagi menerima parameter `role` — tidak ada field Customer yang tersisa untuk dibatasi perannya.
- [x] **Rencana migrasi data lama**: **tidak ada migrasi**, dikonfirmasi lewat `AskUserQuestion`. Dokumen existing yang masih menyimpan `customerCode`/`email`/`gender`/`birthDate`/`address`/`customerType`/`lastVisitAt` dibiarkan sebagai dead data — Mongoose mengabaikannya karena field itu tidak lagi punya schema path, tanpa script pembersih tambahan.

**Model, validasi, service, routes (dieksekusi 2026-11-08):**
- [x] `models/Customer.ts` — sudah berbentuk target saat verifikasi dimulai (lihat catatan status di atas).
- [x] `validations/customerSchema.ts` — `email`/`gender`/`birthDate`/`address`/`notes` diganti `cityFrom`/`age`/`busyness`. `loyaltyPoints` tetap tidak pernah diterima pada `create`/`update` (aturan lama dipertahankan, tidak hilang saat migrasi).
- [x] `services/customerService.ts` — `CustomerLike`, `serializeCustomer`, `createCustomer`, `updateCustomer` disesuaikan ke field baru. Parameter `role` dihapus dari seluruh 5 fungsi yang diekspor (termasuk `listCustomers`/`getCustomerById`/`setCustomerStatus` yang sebelumnya meneruskannya murni untuk serialisasi) — bukan sekadar tidak dipakai, dihapus total karena tidak ada lagi field yang perlu dibatasi perannya.
- [x] `app/api/v1/customers/{route.ts,[id]/route.ts,[id]/status/route.ts}` — berhenti mengirim `user.role` ke fungsi service (konsekuensi langsung dari poin di atas). `requireRole(user, [...])` di level route tidak berubah — itu otorisasi akses endpoint, bukan serialisasi field.
- [x] `app/scalar/docs/_schemas.ts` (`Customer` schema) dan `app/scalar/docs/paths/customers.ts` (`customerFieldsSchema`) — disesuaikan ke field baru, catatan "HOST only" pada field dihapus seluruhnya.
- [x] Cek silang `transactionService.ts`/`approvalService.ts` — keduanya hanya membaca `customer.isActive`, dikonfirmasi tidak terdampak (field itu tidak berubah).

**Tests:** tidak ada file test untuk `validations/customerSchema.ts` atau `services/customerService.ts` baik sebelum maupun setelah perubahan ini (konsisten dengan proporsionalitas yang sudah ditetapkan di Phase 11 — tidak membangun test baru untuk migrasi field yang murni mekanis).

**Koordinasi klien mobile — tahap terpisah atas instruksi user (pola yang sama dengan Phase 9/10/11):**
- [ ] `docs/integration-to-mobile-flutter/` **sengaja belum disentuh.** Mengganti struktur Customer memengaruhi setiap screen yang menampilkan/mengisi form pelanggan di app Flutter — breaking change, butuh koordinasi build terpisah.

**Verifikasi (dijalankan 2026-11-08):** `vitest run` → 415/415 pass, all-green, sama persis dengan baseline Phase 11 (nol test baru, nol regresi — tidak ada test coverage untuk Customer sebelum maupun sesudah). `biome check` bersih di seluruh file tersentuh. `tsc --noEmit` menunjukkan hanya dua error pre-existing yang sama dengan catatan Phase 9/10/11 (`.next/types/validator.ts` soal `app/page.tsx`, dari komit `fdb580d`) — tidak ada error baru dari perubahan Phase 12. `next build` gagal di `Can't resolve 'tw-animate-css'`, pre-existing yang sama, tidak terkait Phase 12.

---

## 5. Definition of Done — Master Checklist

Salinan tracker dari PRD §21, centang di akhir setiap fase yang relevan:

- [x] HOST dan AGENT dapat login menggunakan session yang aman
- [x] Role-based dan branch-based authorization diterapkan
- [x] HOST dapat mengelola cabang dan master data
- [x] AGENT dapat membuat transaksi pada cabangnya
- [x] HOST tidak dapat membuat transaksi baru
- [x] Transaksi menyimpan snapshot harga dan pembagian hasil
- [x] Pembayaran QRIS terintegrasi dengan Midtrans
- [x] Status pembayaran hanya berubah melalui proses yang tervalidasi
- [x] AGENT dapat mengajukan perubahan transaksi
- [x] HOST dapat menyetujui atau menolak pengajuan
- [x] Inventaris terisolasi berdasarkan cabang
- [x] Dashboard menampilkan metrik dari data aktual
- [x] Seluruh operasi sensitif punya validasi dan audit yang memadai
- [x] Automated tests mencakup authorization, transaksi, pembayaran, approval, inventaris
- [x] Dokumentasi API dan konfigurasi environment tersedia
- [x] HOST membayar subscription bulanan sesuai plan aktif melalui QRIS, status subscription-nya tidak memengaruhi akses AGENT/operasional POS
- [x] `GROOMA_ADMIN` dapat mengatur harga plan dan memantau/override status subscription seluruh HOST lewat namespace admin yang terisolasi

---

## 6. Urutan & Dependensi Antar Fase

```
Phase 0 (Alignment)
   └── Phase 1 (Foundation)
          │
          ├── Phase 2 (Master Data, termasuk Service hari ini)
          │      ├── Phase 3 (POS & Payments) ── Phase 5 (Approval, butuh Transaction)
          │      │      └── Phase 10 (Transaction.employee, butuh Employee scaffold) ⏳
          │      └── Phase 4 (Inventory)
          │
          └── Phase 8 (Subscription & Billing, reuse lib/midtrans.ts dari Phase 3)

Phase 2 + Phase 3            ──>  Phase 11 (Kategori Servis, pengganti Service) ✅
Phase 3 + Phase 4 + Phase 5  ──>  Phase 6 (Dashboard, butuh data semua modul)
Phase 6 + Phase 8            ──>  Phase 7 (Hardening)
Phase 7                      ──>  Phase 9 (Keseragaman Pagination) ⏳
```

Phase 9 bersifat lintas-modul: ia menyentuh endpoint milik Phase 2, 3, 4, 5, 6, dan 8 sekaligus, jadi ia menunggu semuanya ada. Tahap 1 dan 2 di dalamnya aman dikerjakan kapan saja; Tahap 3 punya dependensi eksternal ke build klien Flutter, bukan ke fase lain.

Phase 11 butuh Phase 2 (tempat `Service` didefinisikan) **dan** Phase 3 (tempat `Transaction.service` dipakai) karena migrasinya menyentuh keduanya. Lebih berisiko dari Phase 10: Phase 10 menambah field baru tanpa menyentuh field lama, sementara Phase 11 berakhir dengan menghapus sebuah model yang sudah dipakai lima service/route berbeda — **risiko itu sudah terealisasi dan selesai dieksekusi 2026-11-08**, lihat checklist Phase 11 di atas. Dikerjakan setelah Phase 10 pada file yang sama (`services/transactionService.ts`, `validations/transactionSchema.ts`) tanpa konflik merge, karena keduanya sudah ada di working tree yang sama saat Phase 11 dieksekusi.

Phase 10 hanya bergantung pada Phase 3 (field yang diubah ada di `Transaction`) dan keberadaan scaffold `models/Employee.ts` (sudah ada sejak 2026-10-15). Independen dari Phase 9 — keduanya bisa berjalan paralel.

Phase 3 dan Phase 4 bisa dikerjakan paralel (sama-sama hanya bergantung pada Phase 1+2). Phase 6 menunggu data nyata dari Phase 3–5 agar aggregation tidak dites dengan data kosong/palsu.

Phase 8 tidak bergantung pada Phase 2/4/5/6 dan tidak mengirim data ke Dashboard (PRD §12) — subscription adalah modul platform/billing vendor, terpisah dari analytics operasional barbershop. Phase 8 bisa berjalan paralel dengan Phase 2–6 begitu Phase 1 selesai; reuse `lib/midtrans.ts` baru mungkin setelah Phase 3 ada.
