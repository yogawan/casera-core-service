import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "Casera — Aplikasi Kasir & Manajemen Barbershop Multi-Cabang",
  description:
    "Kelola transaksi, stok, karyawan, dan pembayaran QRIS barbershop Anda dalam satu dashboard. Pantau semua cabang secara real-time dengan Casera.",
  openGraph: {
    title: "Casera — Kelola Barbershop Anda Tanpa Ribet Catat Manual",
    description:
      "Transaksi, stok, komisi karyawan, dan laporan bisnis — otomatis tercatat dalam satu sistem. Dibangun khusus untuk barbershop Indonesia.",
    locale: "id_ID",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
