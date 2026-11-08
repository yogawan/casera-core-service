# Notifikasi WhatsApp ke Customer Saat Transaksi Lunas

> **Status: dirancang, belum diimplementasikan.** Dokumen desain untuk fitur notifikasi WhatsApp otomatis ke nomor HP customer setiap transaksi POS berstatus **PAID**. Belum ada satu baris kode pun dari rencana ini yang ditulis — implementasi menyusul di sesi terpisah.
>
> **Bukan** fitur yang sama dengan PRD §23.6 ("Notifikasi reminder WhatsApp" untuk subscription HOST→Grooma, yang itu memang masih *out of scope*). Dokumen ini soal notifikasi ke **customer barbershop**, bukan ke HOST.

## 1. Latar Belakang

Saat ini, setiap transaksi yang dicatat lewat `POST /transactions` (`services/transactionService.ts`) tidak punya mekanisme apa pun untuk menghubungi customer di luar aplikasi — struk hanya bisa diakses lewat `getReceipt()` di dalam sistem. Tujuan fitur ini: begitu transaksi **lunas**, customer otomatis menerima pesan WhatsApp sebagai konfirmasi (semacam struk digital), tanpa agent perlu kirim manual.

Temuan dari eksplorasi codebase yang relevan untuk desain ini:
- **Belum ada infrastruktur notifikasi customer sama sekali.** Satu-satunya hal bernama "notification" di codebase (`NotificationResult` di `services/paymentService.ts`) adalah soal *menerima* webhook Midtrans, bukan *mengirim* pesan ke customer.
- `models/Customer.ts`'s `phone` adalah string bebas, opsional, tanpa validasi format (`trim`, `max 32`) — perlu dinormalisasi sebelum dipakai mengirim WhatsApp.
- `Transaction.customer` boleh `null` (transaksi walk-in/anonim) — harus di-skip dengan aman, bukan jadi error.
- Codebase sudah punya **preseden arsitektur yang bentuknya identik**: pemberian loyalty points punya dua titik pemicu — `transactionService.ts`'s `createTransaction()` untuk CASH & SELF_RECORDED (langsung `PAID` saat dibuat), dan `paymentService.ts`'s `processMidtransNotification()` untuk QRIS MANAGED (baru `PAID` setelah webhook Midtrans settle). Keduanya non-blocking: try/catch, log-and-continue, tidak pernah menggagalkan transaksi. Fitur ini mengikuti pola yang sama persis.
- Pola env-var fail-fast sudah mapan di `lib/paymentConfig.ts` (`PAYMENT_INTEGRATION_MODE`, `MIDTRANS_*`). Tapi ada pelajaran yang sudah pernah ditulis soal `lib/midtrans.ts`: validasi kredensial **tidak boleh di module scope tanpa syarat** — deployment `SELF_RECORDED` yang legitimately tanpa Midtrans sampai tidak bisa load transaction path sama sekali sebelum ini diperbaiki. Config WhatsApp baru harus langsung pakai pola lazy, bukan mengulang kesalahan yang sama.

## 2. Keputusan Desain

Empat keputusan berikut sudah dikonfirmasi sebelum dokumen ini ditulis:

| # | Keputusan | Pilihan | Alasan |
|---|---|---|---|
| 1 | Provider WhatsApp | **Meta WhatsApp Cloud API resmi** (bukan aggregator seperti Fonnte/Wablas) | Konsisten dengan cara Grooma menangani Midtrans secara resmi; tidak ada risiko nomor di-banned sepihak seperti jalur berbasis sesi WhatsApp Web |
| 2 | Pemilik nomor pengirim | **Milik masing-masing HOST**, dikonfigurasi per-deployment via env var | Pola identik dengan MANAGED Midtrans — customer melihat pesan datang dari barbershop langganannya, bukan dari "Grooma" |
| 3 | Titik pemicu kirim | **Hanya saat transaksi benar-benar `PAID`** | Dua call site, sama seperti pola loyalty points yang sudah ada |
| 4 | Consent customer | **Wajib ada flag opt-in** di `Customer` sebelum nomornya dipakai | Nomor HP dipakai aktif untuk mengirim pesan (bukan cuma disimpan) — pertimbangan UU PDP |

## 3. Arsitektur

### 3.1. Env var & config baru — `lib/whatsappConfig.ts`

```
WHATSAPP_NOTIFICATION_ENABLED=false   # default off — fitur opt-in per deployment
WHATSAPP_PHONE_NUMBER_ID=             # Phone Number ID WABA milik HOST di Meta
WHATSAPP_ACCESS_TOKEN=                # system-user access token, server-side only
WHATSAPP_TEMPLATE_NAME=               # nama template yang sudah di-approve Meta
WHATSAPP_TEMPLATE_LANGUAGE=id         # default "id"
```

- Validasi **lazy** (dipanggil dari dalam fungsi pengirim saat dibutuhkan), bukan di top-level module — mengikuti pola yang sudah terbukti aman di `lib/midtrans.ts` (`getCoreApi()`/`requireServerKey()`), bukan pola module-scope lama di `lib/paymentConfig.ts`.
- `WHATSAPP_NOTIFICATION_ENABLED` bukan `"true"` → pengirim no-op total, tidak butuh credential apa pun.
- `true` tapi `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_TEMPLATE_NAME` kosong → fail fast dengan error jelas saat pertama dipakai (bukan saat boot — fitur ini opt-in, beda dengan `PAYMENT_INTEGRATION_MODE` yang wajib ada untuk semua deployment).

### 3.2. Field consent baru — `models/Customer.ts`

```ts
whatsappNotificationConsent: { type: Boolean, default: false }
```

- Default `false` (opt-in eksplisit). AGENT/HOST menandai field ini saat mendaftarkan/mengubah data customer, misalnya menanyakan langsung ke customer di kasir.
- `validations/customerSchema.ts` (create & update) perlu menerima field ini.
- Perlu ditambahkan ke whitelist field yang bisa dilihat AGENT di `services/customerService.ts` — AGENT adalah role yang paling sering berinteraksi langsung dengan customer di kasir, jadi perlu bisa melihat & mengubah status consent ini.
- Tidak perlu collection/ledger baru untuk audit histori consent — satu boolean cukup untuk MVP (sama seperti keputusan "tanpa ledger" untuk loyalty points earn-only).

### 3.3. Normalisasi nomor HP

Fungsi murni (kandidat lokasi: `lib/utils.ts` dekat `computeLoyaltyPoints`/`computeServicePricing`, atau file baru `lib/phoneNumber.ts`): mengubah nomor bebas-format (`"08123..."`, `"+62812..."`, `"62812..."`, dengan spasi/strip) ke format yang diminta Meta Cloud API (digit saja, `62` di depan, tanpa `+`). Return `null` untuk input yang tidak bisa dinormalisasi (kosong, terlalu pendek, bukan nomor Indonesia) — caller skip & log, tidak pernah mengirim nomor sampah ke Meta.

### 3.4. Client WhatsApp — `lib/whatsapp.ts`

Wrapper tipis ke Meta Cloud API (`POST https://graph.facebook.com/v{N}/{PHONE_NUMBER_ID}/messages`, kirim template message). Mengikuti konvensi `lib/midtrans.ts`:
- Header self-path comment (`// @/lib/whatsapp.ts`).
- Timeout eksplisit (fetch/axios tidak punya timeout default — upstream yang lambat/stuck bisa menggantung request selamanya kalau tidak dibungkus manual, pelajaran yang sama dengan wrapper 10s di `lib/midtrans.ts`).
- Tidak pernah throw ke caller untuk kegagalan kirim — return result object (sukses/gagal + alasan), caller menentukan log level.

### 3.5. Service orkestrasi — `services/notificationService.ts`

Satu fungsi tunggal, `notifyTransactionPaid(transaction, customer)`, dipanggil dari kedua call site di §3.6. Isinya:
1. Skip diam-diam (debug log saja) kalau: fitur disabled, `customer` null, `customer.whatsappNotificationConsent` false, atau `phone` gagal dinormalisasi.
2. Susun parameter template (nama customer, kode transaksi, nama layanan, total terformat Rupiah, poin yang didapat).
3. Panggil `lib/whatsapp.ts`, log hasilnya (`logger.info` sukses / `logger.error` gagal) — tidak pernah throw.

Memusatkan logic di satu fungsi berarti kedua call site tidak duplikasi aturan precondition/template.

### 3.6. Dua titik pemicu (mengikuti pola loyalty points persis)

- **`services/transactionService.ts`'s `createTransaction()`** — tepat di sebelah blok `if (recordAsPaid && customer) { creditLoyaltyPoints(...) }` yang sudah ada. Menangani CASH & SELF_RECORDED-mode QRIS (langsung `PAID` saat transaksi dibuat).
- **`services/paymentService.ts`'s `processMidtransNotification()`** — tepat di titik yang sama tempat `creditLoyaltyPoints` dipanggil untuk jalur webhook. Menangani QRIS MANAGED yang baru `PAID` setelah Midtrans settle.

Kedua tempat: panggilan tidak pernah mempengaruhi response transaksi/webhook — identik dengan alasan non-blocking yang sudah dipakai untuk loyalty points & kegagalan pembuatan QRIS.

## 4. Di Luar Scope (MVP)

- **Tidak ada retry queue / dead-letter / background worker** — percobaan sekali, best-effort, dengan timeout; gagal cukup di-log. Tidak ada infrastruktur queue di codebase ini untuk fitur lain mana pun, jadi menambah satu khusus untuk ini tidak proporsional.
- **Tidak ada abstraksi multi-provider** — Meta Cloud API saja.
- **Tidak ada notifikasi untuk event lain** (cancel, approval perubahan, dll) — hanya transaksi lunas, sesuai permintaan awal.
- **Tidak ada UI admin untuk kelola template** — template dikelola HOST langsung di Meta Business Manager, di luar Grooma.

## 5. Konsekuensi Onboarding HOST

Meta Cloud API **mewajibkan template pre-approved** untuk pesan business-initiated (customer belum chat duluan dalam 24 jam terakhir) — ini aturan platform Meta, bukan pilihan Grooma. Setiap HOST yang mau mengaktifkan fitur ini butuh, sebelum `WHATSAPP_NOTIFICATION_ENABLED=true`:
1. WhatsApp Business Account (WABA) terverifikasi.
2. Minimal satu template pesan yang sudah disetujui Meta.

Langkah ini perlu masuk sebagai tambahan di `docs/PROVISIONING-HOST.md`, sejajar dengan langkah setup Midtrans yang sudah ada di sana.

## 6. File yang Akan Disentuh (saat implementasi)

- **Baru**: `lib/whatsappConfig.ts`, `lib/whatsapp.ts`, `services/notificationService.ts`, plus test file untuk masing-masing.
- **Diubah**: `models/Customer.ts` (+field consent), `validations/customerSchema.ts`, `services/customerService.ts` (field whitelist AGENT), `services/transactionService.ts` (call site 1), `services/paymentService.ts` (call site 2), `lib/utils.ts` (fungsi normalisasi nomor, kalau tidak dipisah file sendiri), `.env.example`.
- **Dokumentasi lanjutan** (menyusul setelah kode jadi): `docs/PRD-GROOMA.md` (section baru), `docs/PROVISIONING-HOST.md` (langkah setup WABA), `docs/integration-to-mobile-flutter/CUSTOMER-MOBILE-API-INTEGRATION.md` (kalau form customer di mobile butuh checkbox consent baru).

## 7. Rencana Verifikasi (saat implementasi)

- `tsc --noEmit`, `vitest run` (bandingkan dengan baseline all-green saat ini), `biome check` di file yang disentuh, `next build`.
- Test baru: normalisasi nomor HP (pure function — kasus `08xx`/`+62xx`/`62xx`/invalid), config fail-fast (enabled-tanpa-credential vs disabled), precondition-skip di `notificationService.ts` (no consent / no phone / disabled → skip, tidak mengirim).
- Smoke test manual dengan WABA sandbox Meta (kalau credential tersedia) — kirim satu transaksi sungguhan, konfirmasi pesan sampai ke nomor WhatsApp asli. Teknik yang sama seperti script probe `tsx --env-file=.env.local` yang sudah dipakai untuk debug Midtrans/MongoDB sebelumnya.
