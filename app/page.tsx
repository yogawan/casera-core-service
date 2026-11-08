import Link from "next/link";

export default function Page() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
      {/* Badge */}
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[--color-primary-light] px-3 py-1 text-xs font-semibold text-[--color-primary] mb-6 tracking-wide uppercase">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[--color-primary] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[--color-primary]" />
        </span>
        API · v1 · Live
      </span>

      {/* Headline */}
      <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-[--color-foreground]">
        Backend API untuk{" "}
        <span className="text-[--color-primary]">Barbershop</span> Anda
      </h1>

      {/* Subheadline */}
      <p className="mt-6 max-w-2xl text-lg sm:text-xl text-[--color-muted] leading-relaxed">
        Casera menyediakan REST API lengkap untuk transaksi, manajemen stok,
        karyawan, cabang, dan pembayaran QRIS — siap diintegrasikan ke
        aplikasi mobile atau POS Anda.
      </p>

      {/* CTA */}
      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/scalar/docs"
          className="inline-flex items-center gap-2 rounded-[--radius-md] bg-[--color-primary] hover:bg-[--color-primary-hover] px-7 py-3.5 text-sm font-semibold text-white shadow-md transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--color-primary]"
        >
          Lihat Dokumentasi API
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>

        <a
          href="https://github.com/yogawan/grooma"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-[--radius-md] border border-[--color-border] bg-[--color-surface] hover:bg-[--color-background] px-7 py-3.5 text-sm font-semibold text-[--color-foreground] transition-colors duration-150"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.807 5.628-5.479 5.923.43.372.823 1.102.823 2.222v3.293c0 .322.218.694.825.576C20.565 21.796 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub
        </a>
      </div>

      {/* Stats strip */}
      <dl className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
        {[
          { label: "Endpoints", value: "50+" },
          { label: "Kategori Servis", value: "5" },
          { label: "Role Akses", value: "HOST & AGENT" },
          { label: "Payment Gateway", value: "Midtrans" },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-[--color-muted] uppercase tracking-wider">
              {label}
            </dt>
            <dd className="text-2xl font-extrabold text-[--color-foreground]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
