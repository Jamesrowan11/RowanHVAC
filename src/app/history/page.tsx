import Link from "next/link";
import { COMPANY } from "@/lib/constants";

export const metadata = {
  title: `Our History — ${COMPANY.name}`,
  description:
    "Family owned and operated since 1958 — over 65 years of the Rowan family keeping Howard County and the Washington, D.C. area comfortable.",
};

const photos = [
  {
    src: "/history/history-7.jpg",
    caption: "The Rowan office with a brand-new service truck out front, ready to roll.",
  },
  {
    src: "/history/history-5.jpg",
    caption: "The Rowan team beside one of the original trucks — Heating · Air Conditioning · Sheet Metal.",
  },
  {
    src: "/history/history-6.jpg",
    caption: "The Rowan family and crew.",
  },
  {
    src: "/history/history-1.jpg",
    caption: "The shop on a workday morning, trucks loaded for the day's calls.",
  },
  {
    src: "/history/history-3.jpg",
    caption: "The front office — back when every invoice was typed one at a time.",
  },
  {
    src: "/history/history-2.jpg",
    caption: "Going over the day's paperwork.",
  },
  {
    src: "/history/history-4.jpg",
    caption: "All hands on deck — the crew at work.",
  },
];

export default function HistoryPage() {
  const years = new Date().getFullYear() - COMPANY.foundingYear;

  return (
    <>
      {/* Header — same as the homepage, with History active */}
      <header className="sticky top-0 z-50 border-b border-navy-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-extrabold tracking-tight text-navy sm:text-xl">
            Rowan <span className="text-accent">Heating &amp; Air Conditioning</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-3 sm:gap-5">
            <Link href="/#services" className="hidden text-sm font-medium text-gray-600 hover:text-navy md:block">Services</Link>
            <Link href="/history" className="hidden text-sm font-semibold text-navy md:block">Our History</Link>
            <Link href="/#reviews" className="hidden text-sm font-medium text-gray-600 hover:text-navy md:block">Reviews</Link>
            <Link href="/#contact" className="hidden text-sm font-medium text-gray-600 hover:text-navy md:block">Contact</Link>
            <Link href="/login" className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700">
              Portal Login
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="bg-navy text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-20">
            <p className="text-sm font-bold uppercase tracking-wider text-accent-300">Since {COMPANY.foundingYear}</p>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
              Our History
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-100">
              {years}+ years, one family, one promise: show up, do honest work, and
              treat every home like our own.
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="mx-auto max-w-3xl space-y-10 px-4 py-16">
          <div>
            <h2 className="text-2xl font-bold text-navy">It started in 1958</h2>
            <p className="mt-3 leading-relaxed text-gray-700">
              Rowan Heating &amp; Air Conditioning opened its doors in {COMPANY.foundingYear},
              back when a service call meant a handshake, a toolbox, and a promise
              to get the heat back on before nightfall. From the very beginning the
              work was built on three trades done under one roof — heating, air
              conditioning, and custom sheet metal — and on the belief that if you
              take care of your neighbors, the rest takes care of itself.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-navy">A family trade, passed down</h2>
            <p className="mt-3 leading-relaxed text-gray-700">
              Three generations of the Rowan family have carried the company since
              then, and it has never stopped being a family operation. Each member
              of the family heads a department — from the shop, to the office, to
              the trucks — so when you call Rowan, you&apos;re talking to someone whose
              name is on the door. Today Jim Rowan leads the company, Theresa runs
              the office (and answers the phone when your A/C quits at 9 PM), and
              the next generation is already on the trucks learning the trade the
              same way it&apos;s always been taught: on the job, alongside family.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-navy">The same values, modern tools</h2>
            <p className="mt-3 leading-relaxed text-gray-700">
              A lot has changed since {COMPANY.foundingYear} — oil burners gave way to
              high-efficiency gas furnaces, heat pumps, geothermal systems, and
              Aeroseal duct sealing, and the typewriter in the front office gave
              way to this website. But the sheet metal is still bent in our own
              shop, the trucks still roll out of Highland every morning, and the
              standard is still the one set more than {years} years ago: honest,
              upfront pricing and work we&apos;re proud to put our name on. We&apos;re
              certified by NATE, ACCA, and Aeroseal — and still family owned and
              operated, serving Howard County and the greater Washington, D.C.
              area.
            </p>
          </div>
        </section>

        {/* Photo gallery */}
        <section className="bg-navy-50">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-center text-3xl font-bold text-navy">From the family album</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
              A few snapshots from the early decades — the shop, the trucks, and the
              people who built Rowan into what it is today.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p) => (
                <figure key={p.src} className="overflow-hidden rounded-xl bg-white shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.caption} loading="lazy" className="h-64 w-full object-cover" />
                  <figcaption className="p-3 text-sm text-gray-600">{p.caption}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-navy">Be part of the next chapter</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-700">
            Whether it&apos;s a no-heat call on the coldest night of the year or a brand-new
            system for a brand-new home, we&apos;d be honored to take care of yours.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/#contact" className="btn-primary w-full sm:w-auto">Request a quote</Link>
            <a href={COMPANY.phoneHref} className="btn-secondary w-full sm:w-auto">
              Call {COMPANY.phone}
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-navy py-8 text-center text-sm text-navy-200">
        <p className="font-bold text-white">{COMPANY.name}</p>
        <p className="mt-1">{COMPANY.address} · {COMPANY.phone}</p>
        <p className="mt-3">© {new Date().getFullYear()} {COMPANY.name}. All rights reserved.</p>
      </footer>
    </>
  );
}
